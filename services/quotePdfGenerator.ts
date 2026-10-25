import { jsPDF } from 'jspdf';
import { Order, Customer, Part, Filament, Settings } from '../types';
import { formatCurrency } from '../constants';
import { supabase } from './supabase';
import { 
  getCompletePixData, 
  isPixPaymentMethod, 
  formatPixKeyForDisplay, 
  getPixKeyTypeLabel,
  PixPayloadResult 
} from './pixService';

interface QuotePdfParams {
  order: Order;
  customer?: Customer;
  parts: Part[];
  filaments: Filament[];
  settings: Settings;
}

/**
 * Detects image format from data URL (JPEG, PNG, WEBP)
 */
function detectImageFormat(dataUrl: string): 'JPEG' | 'PNG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

/**
 * Safely embeds an image into jsPDF document.
 * Returns true if successful, false if failed, without throwing errors.
 */
function safeAddImage(
  doc: jsPDF,
  dataUrl: string | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number
): boolean {
  if (!dataUrl) return false;
  try {
    const format = detectImageFormat(dataUrl);
    doc.addImage(dataUrl, format, x, y, w, h, undefined, 'FAST');
    return true;
  } catch (err) {
    console.warn('Falha ao renderizar imagem no PDF (mantendo geração limpa):', err);
    return false;
  }
}

/**
 * Safely loads an image as base64 data URL for jsPDF embedding.
 * Supports Data URLs directly, private Supabase Storage URLs via temporary signed URLs,
 * and external CORS-accessible HTTP URLs.
 */
async function getImageDataUrl(url?: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image')) return url;
  
  let fetchUrl = url;

  // Se for uma imagem hospedada no Supabase Storage (bucket PARTS-IMAGES),
  // extrai o caminho relativo exato (ex: 'logos/{userId}/logo.jpg' ou '{userId}/{timestamp}.jpg')
  // e obtém URL assinada temporária (120s) para garantir leitura com bucket privado.
  const isStorageImage = url.includes('PARTS-IMAGES') || url.startsWith('logos/') || /^[0-9a-fA-F-]{36}\//.test(url);
  if (isStorageImage) {
    try {
      let relativePath = url;
      if (url.includes('PARTS-IMAGES/')) {
        const parts = url.split('PARTS-IMAGES/');
        relativePath = parts[parts.length - 1]?.split('?')[0] || '';
      }
      
      // Remove barras iniciais se houver
      relativePath = relativePath.replace(/^\/+/, '');

      if (relativePath && !relativePath.startsWith('http')) {
        const decodedPath = decodeURIComponent(relativePath);
        const { data: signed, error: signError } = await supabase.storage
          .from('PARTS-IMAGES')
          .createSignedUrl(decodedPath, 120);

        if (!signError && signed?.signedUrl) {
          fetchUrl = signed.signedUrl;
        }
      }
    } catch (signErr) {
      console.warn('Tentativa de obter signed URL no Storage falhou, tentando URL direta:', signErr);
    }
  }

  try {
    const res = await fetch(fetchUrl, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Não foi possível carregar imagem para o PDF (mantendo geração limpa):', err);
    return null;
  }
}

/**
 * Formats date into DD/MM/AAAA
 */
function formatDate(isoDate?: string): string {
  const d = isoDate ? new Date(isoDate) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('pt-BR');
  return d.toLocaleDateString('pt-BR');
}

/**
 * Calculates validity date (default 15 business days ahead)
 */
function getValidityDate(isoDate?: string, businessDays = 15): { full: string; short: string } {
  const d = isoDate ? new Date(isoDate) : new Date();
  if (isNaN(d.getTime())) return { full: '', short: '' };
  let count = 0;
  while (count < businessDays) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  const dayStr = String(d.getDate()).padStart(2, '0');
  const monthStr = String(d.getMonth() + 1).padStart(2, '0');
  return {
    full: d.toLocaleDateString('pt-BR'),
    short: `${dayStr}/${monthStr}`
  };
}

/**
 * Generates an 8-character hex hash for document authenticity
 */
function generateAuthHash(id: string, date: string): string {
  let hash = 0;
  const str = `${id}-${date}-printflow-quote-v2`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${id.slice(0, 4).toUpperCase()}`;
}

/**
 * Generates a realistic, clean 4-digit order number (e.g. #2026-0842) matching real enterprise quoting systems
 */
export function getRealisticOrderNumber(order: Order): string {
  const year = new Date(order.createdAt).getFullYear() || 2026;
  let hash = 0;
  for (let i = 0; i < order.id.length; i++) {
    hash = ((hash << 5) - hash) + order.id.charCodeAt(i);
    hash |= 0;
  }
  const serial = (Math.abs(hash) % 900) + 100;
  return `#${year}-${String(serial).padStart(4, '0')}`;
}

/**
 * Obtém a forma de pagamento de forma resiliente de qualquer formato (camelCase, snake_case ou array payments)
 */
export function resolveOrderPaymentMethod(order: Order): string {
  const anyOrder = order as any;
  const method = anyOrder.paymentMethod || 
    anyOrder.payment_method || 
    (anyOrder.payments && Array.isArray(anyOrder.payments) && anyOrder.payments[0]?.method) || 
    'Pix';
  return String(method).trim();
}

/**
 * Builds the jsPDF document matching the visual style in the reference (pdf-2_64ef64aa.jpg)
 */
export async function buildQuotePdfDoc({ order, customer, parts, filaments, settings }: QuotePdfParams): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm

  // Paleta Industrial de Engenharia / Manufatura Aditiva (Referência pdf-2)
  const colorDarkBg = [11, 15, 25]; // #0B0F19 (Dark industrial black)
  const colorDarkText = [15, 23, 42]; // #0F172A (slate-900)
  const colorMutedText = [100, 116, 139]; // #64748B (slate-500)
  const colorLightMuted = [148, 163, 184]; // #94A3B8 (slate-400)
  const colorPrimaryEmerald = [16, 185, 129]; // #10B981 (emerald-500)
  const colorTealDark = [13, 148, 136]; // #0D9488 (teal-600)
  const colorSoftTeal = [240, 253, 250]; // #F0FDFA (teal-50)
  const colorTealBorder = [153, 246, 228]; // #99F6E4 (teal-200)
  const colorCardBg = [248, 250, 252]; // #F8FAFC (slate-50)
  const colorBorder = [226, 232, 240]; // #E2E8F0 (slate-200)
  const colorDarkBorder = [30, 41, 59]; // #1E293B (slate-800)

  const business = settings.businessInfo || {};
  const companyName = (business.companyName || 'PRINT_3Dbr').toUpperCase();
  const orderNumStr = getRealisticOrderNumber(order);
  const emissionDate = formatDate(order.createdAt);
  const validityInfo = getValidityDate(order.createdAt, 15);
  const authHash = generateAuthHash(order.id, emissionDate);

  // Forma de pagamento resolvida de forma confiável
  const activePaymentMethod = resolveOrderPaymentMethod(order);

  // Cálculo financeiro estrito antecipado para inclusão no payload Pix e QR Code BACEN
  const subtotalCalc = (order.items || []).reduce(
    (acc, i) => acc + ((Number(i.unitPrice) || 0) * (Number(i.quantity) || 0)), 
    0
  );
  const discountCalc = Math.max(0, Number(order.discount) || 0);
  const orderTotalVal = (typeof order.totalValue === 'number' && !isNaN(order.totalValue))
    ? order.totalValue
    : Math.max(0, subtotalCalc - discountCalc);

  // Pré-carrega dados Pix e QR Code BACEN se a forma de pagamento for Pix
  const isPix = isPixPaymentMethod(activePaymentMethod);
  let pixData: PixPayloadResult | null = null;
  if (isPix) {
    try {
      pixData = await getCompletePixData(business, orderTotalVal, orderNumStr.replace('#', ''));
    } catch (pixErr) {
      console.warn('Erro ao carregar dados do Pix:', pixErr);
    }
  }

  // Pré-carrega logo se existir
  const logoData = await getImageDataUrl(business.logoUrl);

  // Pré-carrega miniaturas das peças
  const itemImages: Record<string, string | null> = {};
  for (const item of order.items || []) {
    const part = parts.find(p => p.id === item.partId);
    if (part?.imageUrl && !itemImages[part.imageUrl]) {
      itemImages[part.imageUrl] = await getImageDataUrl(part.imageUrl);
    }
  }

  let currentY = 10;

  // 1. TOP BAR TÉCNICO (PROPOSTA TÉCNICA 3D | MANUFATURA ADITIVA SOB DEMANDA | PRINTFLOW)
  // Quadrado teal indicador
  doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.rect(marginX, currentY - 2.2, 2.2, 2.2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('PROPOSTA TÉCNICA 3D', marginX + 3.8, currentY - 0.5);

  // Separador 1
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.2);
  doc.line(marginX + 33, currentY - 3, marginX + 33, currentY + 0.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  doc.text('MANUFATURA ADITIVA SOB DEMANDA', marginX + 36, currentY - 0.5);

  // Separador 2
  doc.line(marginX + 87, currentY - 3, marginX + 87, currentY + 0.5);
  doc.text('ESPECIFICAÇÕES DE PROJETO', marginX + 90, currentY - 0.5);

  // Badge ORÇAMENTO à direita (Fundo Preto com texto Branco)
  const docTagWidth = 18;
  const docTagX = pageWidth - marginX - docTagWidth;
  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(docTagX, currentY - 3.5, docTagWidth, 4.5, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(255, 255, 255);
  doc.text('ORÇAMENTO', docTagX + 2, currentY - 0.5);

  // Linha divisória fina
  currentY += 2;
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.25);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  currentY += 5;

  // 2. LOGO & BRANDING vs QUADRO DE ORÇAMENTO (CARD PRETO #0B0F19)
  const brandStartY = currentY;

  // Se tem logotipo, usa inserção segura com suporte a PNG/JPEG e fallback gracioso
  let hasLogoDrawn = false;
  if (logoData) {
    hasLogoDrawn = safeAddImage(doc, logoData, marginX, brandStartY, 28, 13);
  }

  if (!hasLogoDrawn) {
    // Ícone estilizado industrial + Nome
    doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
    doc.roundedRect(marginX, brandStartY, 9, 9, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.text('3D', marginX + 2.5, brandStartY + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text(companyName, marginX + 11.5, brandStartY + 6.5);
  }

  // Badge da Oficina
  const badgePrecX = marginX + (hasLogoDrawn ? 30 : 54);
  doc.setFillColor(colorSoftTeal[0], colorSoftTeal[1], colorSoftTeal[2]);
  doc.setDrawColor(colorTealBorder[0], colorTealBorder[1], colorTealBorder[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(badgePrecX, brandStartY + 2, 28, 4.2, 0.8, 0.8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
  doc.text('IMPRESSÃO 3D', badgePrecX + 2.5, brandStartY + 5);

  // Subtítulo da Oficina
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  const defaultTagline = business.website || business.address || 'Serviços especializados em manufatura aditiva e prototipagem 3D';
  doc.text(defaultTagline.slice(0, 70), marginX, brandStartY + 14);

  // Card do Orçamento à Direita (Fundo Preto Industrial #0B0F19)
  const orderBoxWidth = 65;
  const orderBoxHeight = 22;
  const orderBoxX = pageWidth - marginX - orderBoxWidth;

  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(orderBoxX, brandStartY, orderBoxWidth, orderBoxHeight, 2, 2, 'F');

  // Cabeçalho da Caixa: "ORÇAMENTO Nº" (Esquerda) e "#2026-0842" em Verde Esmeralda (Direita)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('ORÇAMENTO Nº', orderBoxX + 4, brandStartY + 6);

  doc.setFont('courier', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.text(orderNumStr, orderBoxX + orderBoxWidth - doc.getTextWidth(orderNumStr) - 4, brandStartY + 6);

  // Linha divisória interna do card escuro
  doc.setDrawColor(colorDarkBorder[0], colorDarkBorder[1], colorDarkBorder[2]);
  doc.setLineWidth(0.2);
  doc.line(orderBoxX + 4, brandStartY + 9, orderBoxX + orderBoxWidth - 4, brandStartY + 9);

  // Datas: Emissão e Validade
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('EMISSÃO:', orderBoxX + 4, brandStartY + 13.5);
  doc.text('VALIDADE:', orderBoxX + 32, brandStartY + 13.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text(emissionDate, orderBoxX + 4, brandStartY + 18);

  const valText = '15 dias da emissão';
  doc.text(valText, orderBoxX + 32, brandStartY + 18);

  currentY = brandStartY + 26;

  // 3. CARDS: CLIENTE / SOLICITANTE (ESQUERDA) + PROPOSTA COMERCIAL (DIREITA - CARD ESCURO)
  const clientCardWidth = 110;
  const proposalCardWidth = contentWidth - clientCardWidth - 4; // 68mm
  const clientCardHeight = 30;
  const clientCardX = marginX;
  const proposalCardX = marginX + clientCardWidth + 4;

  // 3.1 Card Cliente (Fundo Claro #F8FAFC)
  doc.setFillColor(colorCardBg[0], colorCardBg[1], colorCardBg[2]);
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(clientCardX, currentY, clientCardWidth, clientCardHeight, 2, 2, 'FD');

  // Bullet verde + Título
  doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.circle(clientCardX + 5, currentY + 5, 0.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('CLIENTE / SOLICITANTE', clientCardX + 8, currentY + 5.8);

  // Badge "SOLICITANTE REGISTRADO"
  const verBadgeText = 'CONTATO REGISTRADO';
  const verBadgeWidth = doc.getTextWidth(verBadgeText) + 4;
  doc.setFillColor(colorSoftTeal[0], colorSoftTeal[1], colorSoftTeal[2]);
  doc.setDrawColor(colorTealBorder[0], colorTealBorder[1], colorTealBorder[2]);
  doc.roundedRect(clientCardX + clientCardWidth - verBadgeWidth - 4, currentY + 2.5, verBadgeWidth, 4.2, 0.8, 0.8, 'FD');
  doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
  doc.setFontSize(5.5);
  doc.text(verBadgeText, clientCardX + clientCardWidth - verBadgeWidth - 2, currentY + 5.5);

  // Dados do Cliente (Nome e Telefone conforme pedido)
  const custName = customer?.name || 'Cliente Balcão';
  const custPhone = customer?.phone || 'Não informado';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('NOME DO CLIENTE:', clientCardX + 5, currentY + 12);
  doc.text('TELEFONE / WHATSAPP:', clientCardX + 60, currentY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  const trimmedCustName = custName.length > 28 ? custName.slice(0, 28) + '...' : custName;
  doc.text(trimmedCustName, clientCardX + 5, currentY + 18.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
  doc.text(custPhone, clientCardX + 60, currentY + 18.5);

  // 3.2 Card Proposta Comercial (Card Escuro Industrial #0B0F19)
  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(proposalCardX, currentY, proposalCardWidth, clientCardHeight, 2, 2, 'F');

  // Cabeçalho da Proposta
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.text('PROPOSTA COMERCIAL', proposalCardX + 5, currentY + 5.5);

  // Título "ORÇAMENTO COMERCIAL"
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text('ORÇAMENTO DE PRODUÇÃO', proposalCardX + 5, currentY + 11.5);

  // Descrição
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  const descTech = 'Proposta comercial para fabricação aditiva sob demanda dos itens listados conforme projeto.';
  const descLines = doc.splitTextToSize(descTech, proposalCardWidth - 10);
  doc.text(descLines, proposalCardX + 5, currentY + 16);

  // Linha vertical verde esmeralda + citação
  doc.setDrawColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.setLineWidth(0.8);
  doc.line(proposalCardX + 5, currentY + 21, proposalCardX + 5, currentY + 26.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.8);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('"Qualidade e atenção aos detalhes em cada', proposalCardX + 7.5, currentY + 23.2);
  doc.text('camada."', proposalCardX + 7.5, currentY + 26);

  currentY += clientCardHeight + 5;

  // 4. TABELA DE ITENS COM CABEÇALHO ESCURO INDUSTRIAL
  const itemsCount = (order.items || []).length;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  const sectionTitle = '01. DISCRIMINAÇÃO DOS ITENS E SERVIÇOS';
  doc.text(sectionTitle, marginX, currentY + 3.5);

  // Badge "X ITENS" em teal
  const valItemsText = `${itemsCount} ${itemsCount === 1 ? 'ITEM' : 'ITENS'}`;
  const valItemsWidth = doc.getTextWidth(valItemsText) + 4;
  const badgeValX = marginX + doc.getTextWidth(sectionTitle) + 3;
  doc.setFillColor(colorSoftTeal[0], colorSoftTeal[1], colorSoftTeal[2]);
  doc.setDrawColor(colorTealBorder[0], colorTealBorder[1], colorTealBorder[2]);
  doc.roundedRect(badgeValX, currentY + 0.5, valItemsWidth, 4, 0.8, 0.8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
  doc.text(valItemsText, badgeValX + 2, currentY + 3.2);

  // Moeda à direita
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  const currUnit = 'MOEDA: BRL (R$)';
  doc.text(currUnit, pageWidth - marginX - doc.getTextWidth(currUnit), currentY + 3.5);

  currentY += 5.5;

  // Cabeçalho da Tabela (FUNDO PRETO / DARK SLATE COM TEXTO BRANCO)
  const tableHeaderHeight = 6.5;
  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(marginX, currentY, contentWidth, tableHeaderHeight, 1.2, 1.2, 'F');

  const colRefX = marginX + 3;
  const colDescX = marginX + 16;
  const colQtyX = marginX + 120;
  const colUnitX = marginX + 140;
  const colTotalX = marginX + 163;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text('REF', colRefX, currentY + 4.5);
  doc.text('ESPECIFICAÇÃO DO PRODUTO & PARÂMETROS DE PRODUÇÃO', colDescX, currentY + 4.5);
  doc.text('QTD', colQtyX, currentY + 4.5);
  doc.text('UNITÁRIO', colUnitX, currentY + 4.5);
  doc.text('TOTAL', colTotalX, currentY + 4.5);

  currentY += tableHeaderHeight;

  // Linhas de Itens com Foto Ampliada (31mm x 31mm)
  const items = order.items || [];
  const rowHeight = 36; // Altura para acomodar foto 31mm

  items.forEach((item, index) => {
    // Quebra de página se necessário
    if (currentY + rowHeight > pageHeight - 55) {
      doc.addPage();
      currentY = 15;
    }

    const part = parts.find(p => p.id === item.partId);
    const itemTitle = item.name || part?.name || `Item 3D #${index + 1}`;
    const refNum = `#${String(index + 1).padStart(2, '0')}`;
    const qtyStr = `${String(item.quantity).padStart(2, '0')}`;
    const unitPrice = Number(item.unitPrice) || 0;
    const quantity = Number(item.quantity) || 0;
    const unitPriceStr = formatCurrency(unitPrice);
    const totalPriceStr = formatCurrency(unitPrice * quantity);

    // Fundo da linha
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
    doc.setLineWidth(0.15);
    doc.rect(marginX, currentY, contentWidth, rowHeight, 'FD');

    // Referência do Item (#01, #02)
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
    doc.text(refNum, colRefX, currentY + 19);

    // Foto Ampliada (31mm x 31mm) com renderização segura
    const imgX = colDescX;
    const imgY = currentY + 2.5;
    const imgSize = 31;
    let hasImageDrawn = false;

    if (part?.imageUrl && itemImages[part.imageUrl]) {
      hasImageDrawn = safeAddImage(doc, itemImages[part.imageUrl], imgX, imgY, imgSize, imgSize);
    }

    if (!hasImageDrawn) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
      doc.roundedRect(imgX, imgY, imgSize, imgSize, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
      doc.text('FOTO 3D', imgX + 8, imgY + 17);
    }

    // Nome da Peça (Apenas o nome limpo e destacado, sem FDM, sem badges e sem descrições técnicas)
    const textDescX = imgX + imgSize + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    const maxTitleLen = 45;
    const cleanTitle = itemTitle.length > maxTitleLen ? itemTitle.slice(0, maxTitleLen) + '...' : itemTitle;
    doc.text(cleanTitle, textDescX, currentY + 18.5);

    // Quantidade
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text(qtyStr, colQtyX, currentY + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
    doc.text('un', colQtyX + doc.getTextWidth(qtyStr) + 1.5, currentY + 18);

    // Unitário
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text(unitPriceStr, colUnitX, currentY + 18);

    // Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text(totalPriceStr, colTotalX, currentY + 18);

    currentY += rowHeight;
  });

  currentY += 4;

  // 5. BLOCO FINAL: CONDIÇÕES TÉCNICAS (ESQUERDA) vs RESUMO FINANCEIRO (DIREITA - CARD ESCURO)
  const bottomBoxHeight = 44;
  const condWidth = 110;
  const financeWidth = contentWidth - condWidth - 4; // 68mm
  const condX = marginX;
  const financeX = marginX + condWidth + 4;

  if (currentY + bottomBoxHeight > pageHeight - 20) {
    doc.addPage();
    currentY = 15;
  }

  // 5.1 Card Condições Técnicas e Fabricação (Fundo Claro)
  doc.setFillColor(colorCardBg[0], colorCardBg[1], colorCardBg[2]);
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.roundedRect(condX, currentY, condWidth, bottomBoxHeight, 2, 2, 'FD');

  // Bullet verde + Título
  doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.circle(condX + 5, currentY + 5, 0.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('CONDIÇÕES TÉCNICAS E FORNECIMENTO', condX + 8, currentY + 5.8);

  const termBadge = 'CONDIÇÕES GERAIS';
  doc.setFont('courier', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  doc.text(termBadge, condX + condWidth - doc.getTextWidth(termBadge) - 4, currentY + 5.5);

  // Grid Condições Técnicas
  const gridY1 = currentY + 10;
  const gridY2 = currentY + 19.5;

  // Box 1: Prazo
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.18);
  doc.roundedRect(condX + 4, gridY1, 48, 8, 1, 1, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('PRAZO DE FABRICAÇÃO:', condX + 6, gridY1 + 3);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('A combinar c/ cliente', condX + 6, gridY1 + 6.5);

  // Box 2: Pagamento
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(condX + 55, gridY1, 51, 8, 1, 1, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('FORMA DE PAGAMENTO:', condX + 57, gridY1 + 3);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  const payMethodText = String(activePaymentMethod || 'A combinar');
  doc.text(payMethodText.slice(0, 30), condX + 57, gridY1 + 6.5);

  // Box 3: Envio / Logística
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(condX + 4, gridY2, 102, 8, 1, 1, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('ENVIO / LOGÍSTICA:', condX + 6, gridY2 + 3);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('A combinar (Retirada ou Envio)', condX + 6, gridY2 + 6.5);

  // Nota de Manufatura
  const noteY = currentY + 30.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('NOTA DE MANUFATURA:', condX + 4, noteY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  const noteLines = doc.splitTextToSize(
    'Peças fabricadas sob demanda conforme arquivo digital e orientações do cliente. Linhas e texturas superficiais são características próprias do processo de impressão 3D.',
    condWidth - 8
  );
  doc.text(noteLines, condX + 4, noteY + 3.5);

  // 5.2 Card Resumo Financeiro (FUNDO PRETO INDUSTRIAL #0B0F19)
  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(financeX, currentY, financeWidth, bottomBoxHeight, 2, 2, 'F');

  // Título em Verde Esmeralda
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.text('RESUMO FINANCEIRO', financeX + 5, currentY + 5.5);

  const quoteTagRight = `PROPOSTA ${orderNumStr}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text(quoteTagRight, financeX + financeWidth - doc.getTextWidth(quoteTagRight) - 5, currentY + 5.5);

  // Cálculo financeiro estrito sem padrão || incorreto
  const subtotal = (order.items || []).reduce(
    (acc, i) => acc + ((Number(i.unitPrice) || 0) * (Number(i.quantity) || 0)), 
    0
  );
  const discount = Math.max(0, Number(order.discount) || 0);
  const total = (typeof order.totalValue === 'number' && !isNaN(order.totalValue))
    ? order.totalValue
    : Math.max(0, subtotal - discount);

  // Subtotal
  let finY = currentY + 11;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('Subtotal dos Itens:', financeX + 5, finY);
  const subtotalStr = formatCurrency(subtotal);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(subtotalStr, financeX + financeWidth - doc.getTextWidth(subtotalStr) - 5, finY);

  // Desconto (se houver, exibe com destaque; se não houver, mostra Neutro sem inventar frete)
  finY += 6;
  if (discount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
    doc.text('Desconto Aplicado:', financeX + 5, finY);
    const discStr = `- ${formatCurrency(discount)}`;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.text(discStr, financeX + financeWidth - doc.getTextWidth(discStr) - 5, finY);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
    doc.text('Descontos:', financeX + 5, finY);
    const noneStr = 'Nenhum';
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
    doc.text(noneStr, financeX + financeWidth - doc.getTextWidth(noneStr) - 5, finY);
  }

  // Linha divisória interna no card preto
  finY += 3.5;
  doc.setDrawColor(colorDarkBorder[0], colorDarkBorder[1], colorDarkBorder[2]);
  doc.setLineWidth(0.3);
  doc.line(financeX + 5, finY, financeX + financeWidth - 5, finY);

  // VALOR TOTAL LÍQUIDO
  finY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('VALOR TOTAL LÍQUIDO:', financeX + 5, finY);

  finY += 8.5;
  const totalStr = formatCurrency(total);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(totalStr, financeX + financeWidth - doc.getTextWidth(totalStr) - 5, finY);

  finY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text(activePaymentMethod ? `Pagamento via ${activePaymentMethod}` : 'Valor final do pedido', financeX + 5, finY);

  currentY += bottomBoxHeight + 4;

  // 5.3 SEÇÃO: DADOS PARA PAGAMENTO VIA PIX (EXIBIDA AUTOMATICAMENTE SE FORMA DE PAGAMENTO FOR PIX)
  if (isPix) {
    const pixBoxHeight = 35;
    if (currentY + pixBoxHeight > pageHeight - 18) {
      doc.addPage();
      currentY = 15;
    }

    const pixX = marginX;
    const pixWidth = contentWidth;

    // Fundo do Card Pix com borda verde esmeralda industrial
    doc.setFillColor(colorCardBg[0], colorCardBg[1], colorCardBg[2]);
    doc.setDrawColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.setLineWidth(0.35);
    doc.roundedRect(pixX, currentY, pixWidth, pixBoxHeight, 2, 2, 'FD');

    // Bullet verde + Título
    doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.circle(pixX + 5, currentY + 4.8, 0.9, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text('DADOS PARA PAGAMENTO VIA PIX', pixX + 8, currentY + 5.5);

    const pixBadgeText = 'PAGAMENTO INSTANTÂNEO BACEN';
    const pixBadgeW = doc.getTextWidth(pixBadgeText) + 4;
    doc.setFillColor(colorSoftTeal[0], colorSoftTeal[1], colorSoftTeal[2]);
    doc.setDrawColor(colorTealBorder[0], colorTealBorder[1], colorTealBorder[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(pixX + doc.getTextWidth('DADOS PARA PAGAMENTO VIA PIX') + 11, currentY + 2.5, pixBadgeW, 4, 0.8, 0.8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
    doc.text(pixBadgeText, pixX + doc.getTextWidth('DADOS PARA PAGAMENTO VIA PIX') + 13, currentY + 5.2);

    if (business.pixKey && business.pixKey.trim() !== '') {
      // 1. Linha Superior de Dados (Valor, Tipo de Chave, Chave Pix)
      const row1Y = currentY + 11.5;

      // Coluna 1: Valor Total do Pedido
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.2);
      doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
      doc.text('VALOR DO PEDIDO:', pixX + 5, row1Y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
      doc.text(formatCurrency(total), pixX + 5, row1Y + 4.5);

      // Coluna 2: Tipo de Chave
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.2);
      doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
      doc.text('TIPO DE CHAVE:', pixX + 42, row1Y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
      doc.text(getPixKeyTypeLabel(business.pixKeyType), pixX + 42, row1Y + 4.5);

      // Coluna 3: Chave Pix Completa
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.2);
      doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
      doc.text('CHAVE PIX COMPLETA:', pixX + 78, row1Y);

      doc.setFont('courier', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
      const formattedKeyStr = formatPixKeyForDisplay(business.pixKey, business.pixKeyType || 'cpf');
      doc.text(formattedKeyStr.slice(0, 36), pixX + 78, row1Y + 4.5);

      // 2. Linha Intermediária de Dados (Titular, CPF/CNPJ, Banco)
      const row2Y = currentY + 21;

      // Titular
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.2);
      doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
      doc.text('NOME DO TITULAR:', pixX + 5, row2Y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
      const receiverNameDisplay = (business.pixReceiverName || business.companyName || 'PRINT_3DBR').toUpperCase();
      doc.text(receiverNameDisplay.slice(0, 30), pixX + 5, row2Y + 4);

      // CPF / CNPJ do Titular (quando cadastrado)
      if (business.pixReceiverDoc && business.pixReceiverDoc.trim() !== '') {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.2);
        doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
        doc.text('CPF / CNPJ TITULAR:', pixX + 62, row2Y);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
        doc.text(business.pixReceiverDoc.trim().slice(0, 22), pixX + 62, row2Y + 4);
      }

      // Instituição Financeira / Banco (quando cadastrada)
      if (business.pixBank && business.pixBank.trim() !== '') {
        const bankColX = business.pixReceiverDoc ? pixX + 106 : pixX + 62;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.2);
        doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
        doc.text('INSTITUIÇÃO FINANCEIRA:', bankColX, row2Y);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
        doc.text(business.pixBank.trim().slice(0, 24), bankColX, row2Y + 4);
      }

      // 3. Nota Orientativa / Instrução
      const notePixY = currentY + 31.5;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(5.2);
      doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
      doc.text(
        'Aponte a câmera no app do seu banco para o QR Code ao lado ou use a chave Pix acima. A liquidação é imediata.',
        pixX + 5,
        notePixY
      );

      // 4. Renderização do QR Code Pix BACEN (à direita)
      if (pixData?.qrCodeDataUrl) {
        const qrBoxX = pixX + pixWidth - 30;
        const qrBoxY = currentY + 3.5;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
        doc.setLineWidth(0.2);
        doc.roundedRect(qrBoxX, qrBoxY, 26, 26, 1.2, 1.2, 'FD');

        safeAddImage(doc, pixData.qrCodeDataUrl, qrBoxX + 1, qrBoxY + 1, 24, 24);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(4.8);
        doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
        doc.text('PIX BR CODE', qrBoxX + 13, qrBoxY + 29.5, { align: 'center' });
      }
    } else {
      // Caso os dados Pix ainda não estejam configurados nas preferências da empresa
      const alertY = currentY + 13;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
      doc.text('VALOR TOTAL A PAGAR:', pixX + 5, alertY);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
      doc.text(formatCurrency(total), pixX + 5, alertY + 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
      doc.text('CHAVE PIX PENDENTE DE CADASTRO:', pixX + 48, alertY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
      doc.text(
        'Acesse "Ajustes / Configurações" no sistema Print_3Dbr para cadastrar a chave Pix e titular da conta.',
        pixX + 48,
        alertY + 5
      );
      doc.text(
        'Os dados e o QR Code oficial de cobrança serão vinculados automaticamente nas próximas emissões.',
        pixX + 48,
        alertY + 9.5
      );
    }

    currentY += pixBoxHeight + 4;
  }

  // 6. RODAPÉ COMERCIAL
  const footerY = pageHeight - 16;
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.3);
  doc.line(marginX, footerY, pageWidth - marginX, footerY);

  const contactParts: string[] = [companyName];
  if (business.whatsapp || business.phone) {
    contactParts.push(`WhatsApp: ${business.whatsapp || business.phone}`);
  }
  if (business.instagram) {
    contactParts.push(`Instagram: ${business.instagram}`);
  }
  if (business.email) {
    contactParts.push(business.email);
  }
  if (business.cityState) {
    contactParts.push(`${business.cityState} • Brasil`);
  }

  const contactFooterStr = contactParts.join('  •  ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text(contactFooterStr.slice(0, 110), marginX, footerY + 5);

  const legalFooterStr = `"Obrigado pela oportunidade de fabricar sua ideia."  •  GERADO EM ${emissionDate}  •  HASH DE VALIDAÇÃO ELETRÔNICA: ${authHash}`;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text(legalFooterStr.slice(0, 125), marginX, footerY + 9.5);

  return doc;
}

/**
 * Downloads the generated PDF to the user's browser
 */
export async function downloadQuotePdf(params: QuotePdfParams): Promise<void> {
  const doc = await buildQuotePdfDoc(params);
  const orderNum = getRealisticOrderNumber(params.order);
  const filename = `Orcamento_${orderNum.replace('#', '')}.pdf`;
  doc.save(filename);
}

/**
 * Returns Blob of the generated PDF
 */
export async function getQuotePdfBlob(params: QuotePdfParams): Promise<Blob> {
  const doc = await buildQuotePdfDoc(params);
  return doc.output('blob');
}
