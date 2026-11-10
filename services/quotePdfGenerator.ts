import { jsPDF } from 'jspdf';
import { Order, Customer, Part, Filament, Settings, OrderStatus } from '../types';
import { formatCurrency } from '../constants';
import { supabase } from './supabase';
import { getCompletePixData, getPixKeyTypeLabel } from './pixService';
import { normalizeOrderStatus, isOrderPaid } from '../utils/statusUtils';

export interface QuotePdfParams {
  order: Order;
  customer?: Customer;
  parts: Part[];
  filaments: Filament[];
  settings: Settings;
  includePaymentInfo?: boolean;
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(fetchUrl, { mode: 'cors', signal: controller.signal });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } finally {
      clearTimeout(timeoutId);
    }
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
    'A combinar';
  return String(method).trim();
}

/**
 * Builds the jsPDF document matching the visual style in the reference (pdf-2_64ef64aa.jpg)
 */
export async function buildQuotePdfDoc({ order, customer, parts, filaments, settings, includePaymentInfo }: QuotePdfParams): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const isPendingQuote = normalizeOrderStatus(order.status) === OrderStatus.PENDING;
  const showPaymentInfo = typeof includePaymentInfo === 'boolean' 
    ? includePaymentInfo 
    : !isPendingQuote;
  const isPaid = isOrderPaid(order);

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm

  // Paleta Industrial de Engenharia / Manufatura Aditiva
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

  // Cálculo financeiro estrito
  const subtotalCalc = (order.items || []).reduce(
    (acc, i) => acc + ((Number(i.unitPrice) || 0) * (Number(i.quantity) || 0)), 
    0
  );
  const discountCalc = Math.max(0, Number(order.discount) || 0);
  const orderTotalVal = (typeof order.totalValue === 'number' && !isNaN(order.totalValue))
    ? order.totalValue
    : Math.max(0, subtotalCalc - discountCalc);

  // Pré-carrega logo se existir
  const logoData = await getImageDataUrl(business.logoUrl);

  // Pré-carrega dados do Pix se for pedido com pagamento
  let pixData: any = null;
  if (showPaymentInfo && business.pixKey) {
    try {
      pixData = await getCompletePixData(
        business,
        orderTotalVal,
        orderNumStr.replace('#', '')
      );
    } catch (pixErr) {
      console.warn('Erro ao gerar dados do Pix para o PDF:', pixErr);
    }
  }

  // Pré-carrega miniaturas das peças em paralelo
  const itemImages: Record<string, string | null> = {};
  const uniqueImageUrls = Array.from(new Set(
    (order.items || [])
      .map(i => parts.find(p => p.id === i.partId)?.imageUrl)
      .filter((url): url is string => !!url)
  ));
  
  await Promise.all(
    uniqueImageUrls.map(async (url) => {
      itemImages[url] = await getImageDataUrl(url);
    })
  );

  let currentY = 10;

  // 1. TOP BAR TÉCNICO (PROPOSTA TÉCNICA 3D | MANUFATURA ADITIVA SOB DEMANDA | PRINTFLOW)
  doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.rect(marginX, currentY - 2.2, 2.2, 2.2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  const docTypeHeader = showPaymentInfo ? 'ORDEM DE PRODUÇÃO 3D' : 'PROPOSTA TÉCNICA 3D';
  doc.text(docTypeHeader, marginX + 3.8, currentY - 0.5);

  const sep1X = marginX + doc.getTextWidth(docTypeHeader) + 6;
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.2);
  doc.line(sep1X, currentY - 3, sep1X, currentY + 0.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  const subtitle1 = 'MANUFATURA ADITIVA SOB DEMANDA';
  doc.text(subtitle1, sep1X + 3, currentY - 0.5);

  const sep2X = sep1X + 3 + doc.getTextWidth(subtitle1) + 4;
  if (sep2X < 140) {
    doc.line(sep2X, currentY - 3, sep2X, currentY + 0.5);
    doc.text('ESPECIFICAÇÕES DE PROJETO', sep2X + 3, currentY - 0.5);
  }

  // Badge ORÇAMENTO / PEDIDO à direita (Fundo Preto com texto Branco/Verde)
  const docTagText = showPaymentInfo ? (isPaid ? 'PEDIDO PAGO' : 'PEDIDO DE PRODUÇÃO') : 'ORÇAMENTO';
  const docTagWidth = doc.getTextWidth(docTagText) + 5;
  const docTagX = pageWidth - marginX - docTagWidth;
  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(docTagX, currentY - 3.5, docTagWidth, 4.5, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(showPaymentInfo ? colorPrimaryEmerald[0] : 255, showPaymentInfo ? colorPrimaryEmerald[1] : 255, showPaymentInfo ? colorPrimaryEmerald[2] : 255);
  doc.text(docTagText, docTagX + 2.5, currentY - 0.5);

  // Linha divisória fina
  currentY += 2;
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.25);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  currentY += 5;

  // 2. LOGO & BRANDING vs QUADRO DE ORÇAMENTO (CARD PRETO #0B0F19)
  const brandStartY = currentY;

  // Card do Orçamento / Pedido à Direita (Fundo Preto Industrial #0B0F19)
  const orderBoxWidth = 65;
  const orderBoxHeight = 22;
  const orderBoxX = pageWidth - marginX - orderBoxWidth;

  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(orderBoxX, brandStartY, orderBoxWidth, orderBoxHeight, 2, 2, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text(showPaymentInfo ? 'PEDIDO Nº' : 'ORÇAMENTO Nº', orderBoxX + 4, brandStartY + 6);

  doc.setFont('courier', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.text(orderNumStr, orderBoxX + orderBoxWidth - doc.getTextWidth(orderNumStr) - 4, brandStartY + 6);

  doc.setDrawColor(colorDarkBorder[0], colorDarkBorder[1], colorDarkBorder[2]);
  doc.setLineWidth(0.2);
  doc.line(orderBoxX + 4, brandStartY + 9, orderBoxX + orderBoxWidth - 4, brandStartY + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('EMISSÃO:', orderBoxX + 4, brandStartY + 13.5);
  doc.text(showPaymentInfo ? 'SITUAÇÃO:' : 'VALIDADE:', orderBoxX + 32, brandStartY + 13.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text(emissionDate, orderBoxX + 4, brandStartY + 18);

  if (showPaymentInfo) {
    const statusTxt = isPaid ? 'Pago' : 'Aprovado';
    doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.text(statusTxt, orderBoxX + 32, brandStartY + 18);
  } else {
    const valText = '15 dias da emissão';
    doc.text(valText, orderBoxX + 32, brandStartY + 18);
  }

  // Se tem logotipo, usa inserção segura com suporte a PNG/JPEG e fallback gracioso
  let hasLogoDrawn = false;
  if (logoData) {
    hasLogoDrawn = safeAddImage(doc, logoData, marginX, brandStartY, 28, 12);
  }

  let textBrandEndX = marginX;
  if (!hasLogoDrawn) {
    doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
    doc.roundedRect(marginX, brandStartY, 9, 9, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.text('3D', marginX + 2.5, brandStartY + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    const maxNameLen = 22;
    const cleanCompanyName = companyName.length > maxNameLen ? companyName.slice(0, maxNameLen) + '...' : companyName;
    doc.text(cleanCompanyName, marginX + 11.5, brandStartY + 6.5);
    textBrandEndX = marginX + 11.5 + doc.getTextWidth(cleanCompanyName);
  } else {
    textBrandEndX = marginX + 29;
  }

  // Badge da Oficina (posicionamento dinâmico sem colisão)
  const badgePrecX = Math.min(orderBoxX - 30, textBrandEndX + 3);
  doc.setFillColor(colorSoftTeal[0], colorSoftTeal[1], colorSoftTeal[2]);
  doc.setDrawColor(colorTealBorder[0], colorTealBorder[1], colorTealBorder[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(badgePrecX, brandStartY + 2, 26, 4.2, 0.8, 0.8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
  doc.text('IMPRESSÃO 3D', badgePrecX + 2, brandStartY + 5);

  // Subtítulo da Oficina
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  const defaultTagline = business.website || business.address || 'Serviços especializados em manufatura aditiva e prototipagem 3D';
  doc.text(defaultTagline.slice(0, 68), marginX, brandStartY + (hasLogoDrawn ? 16 : 13));

  currentY = brandStartY + 25;

  // 3. CARDS: CLIENTE / SOLICITANTE (ESQUERDA) + PROPOSTA COMERCIAL (DIREITA - CARD ESCURO)
  const clientCardWidth = 110;
  const proposalCardWidth = contentWidth - clientCardWidth - 4; // 68mm
  const clientCardHeight = 28;
  const clientCardX = marginX;
  const proposalCardX = marginX + clientCardWidth + 4;

  // 3.1 Card Cliente (Fundo Claro #F8FAFC)
  doc.setFillColor(colorCardBg[0], colorCardBg[1], colorCardBg[2]);
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(clientCardX, currentY, clientCardWidth, clientCardHeight, 2, 2, 'FD');

  doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.circle(clientCardX + 5, currentY + 4.8, 0.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('CLIENTE / SOLICITANTE', clientCardX + 8, currentY + 5.5);

  const verBadgeText = 'CONTATO REGISTRADO';
  const verBadgeWidth = doc.getTextWidth(verBadgeText) + 4;
  doc.setFillColor(colorSoftTeal[0], colorSoftTeal[1], colorSoftTeal[2]);
  doc.setDrawColor(colorTealBorder[0], colorTealBorder[1], colorTealBorder[2]);
  doc.roundedRect(clientCardX + clientCardWidth - verBadgeWidth - 4, currentY + 2.5, verBadgeWidth, 4.2, 0.8, 0.8, 'FD');
  doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
  doc.setFontSize(5.2);
  doc.text(verBadgeText, clientCardX + clientCardWidth - verBadgeWidth - 2, currentY + 5.3);

  const custName = customer?.name || 'Cliente Balcão';
  const custPhone = customer?.phone || 'Não informado';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('NOME DO CLIENTE:', clientCardX + 5, currentY + 11.5);
  doc.text('TELEFONE / WHATSAPP:', clientCardX + 58, currentY + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  const trimmedCustName = custName.length > 26 ? custName.slice(0, 26) + '...' : custName;
  doc.text(trimmedCustName, clientCardX + 5, currentY + 16.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
  doc.text(custPhone, clientCardX + 58, currentY + 16.5);

  const custEmail = customer?.email || '';
  const custNotes = customer?.notes || '';
  let subCustInfo = '';
  if (custEmail) subCustInfo += `Email: ${custEmail}`;
  if (custNotes) subCustInfo += (subCustInfo ? '  •  ' : '') + `Obs: ${custNotes}`;

  if (subCustInfo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
    doc.text(subCustInfo.slice(0, 78), clientCardX + 5, currentY + 22.5);
  }

  // 3.2 Card Proposta Comercial / Pedido (Card Escuro Industrial #0B0F19)
  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(proposalCardX, currentY, proposalCardWidth, clientCardHeight, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.text(showPaymentInfo ? 'ORDEM DE PRODUÇÃO' : 'PROPOSTA TÉCNICA', proposalCardX + 5, currentY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(showPaymentInfo ? 'PEDIDO DE PRODUÇÃO' : 'ORÇAMENTO COMERCIAL', proposalCardX + 5, currentY + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  const descTech = showPaymentInfo
    ? 'Fabricação aditiva sob demanda conforme parâmetros validados.'
    : 'Proposta comercial para fabricação aditiva conforme projeto.';
  doc.text(descTech, proposalCardX + 5, currentY + 16);

  doc.setDrawColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.setLineWidth(0.8);
  doc.line(proposalCardX + 5, currentY + 19, proposalCardX + 5, currentY + 24.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.4);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  const quoteLine = showPaymentInfo 
    ? '"Produção autorizada com precisão e acabamento."' 
    : '"Precisão nos detalhes e qualidade em cada camada."';
  doc.text(quoteLine, proposalCardX + 7.5, currentY + 22.5);

  currentY += clientCardHeight + 5;

  // 4. TABELA DE ITENS COM CABEÇALHO ESCURO INDUSTRIAL
  const itemsCount = (order.items || []).length;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  const sectionTitle = '01. DISCRIMINAÇÃO DOS ITENS E SERVIÇOS';
  doc.text(sectionTitle, marginX, currentY + 3.5);

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

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  const currUnit = 'MOEDA: BRL (R$)';
  doc.text(currUnit, pageWidth - marginX - doc.getTextWidth(currUnit), currentY + 3.5);

  currentY += 5.5;

  // Colunas da Tabela
  const colRefX = marginX + 3;
  const colDescX = marginX + 14;
  const colQtyX = marginX + 124;
  const colUnitX = marginX + 144;
  const colTotalX = marginX + 164;

  const renderTableHeader = (y: number) => {
    const tableHeaderHeight = 6.5;
    doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
    doc.roundedRect(marginX, y, contentWidth, tableHeaderHeight, 1.2, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    doc.text('REF', colRefX, y + 4.5);
    doc.text('ESPECIFICAÇÃO DO PRODUTO & PARÂMETROS DE PRODUÇÃO', colDescX, y + 4.5);
    doc.text('QTD', colQtyX, y + 4.5);
    doc.text('UNITÁRIO', colUnitX, y + 4.5);
    doc.text('TOTAL', colTotalX, y + 4.5);
    return y + tableHeaderHeight;
  };

  currentY = renderTableHeader(currentY);

  // Linhas de Itens
  const items = order.items || [];
  const rowHeight = 23;
  const imgSize = 18;

  items.forEach((item, index) => {
    // Quebra de página se necessário
    if (currentY + rowHeight > pageHeight - 65) {
      doc.addPage();
      currentY = 14;
      
      // Top bar de continuação
      doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
      doc.rect(marginX, currentY - 2.2, 2.2, 2.2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
      doc.text(`${showPaymentInfo ? 'ORDEM DE PRODUÇÃO' : 'ORÇAMENTO'} ${orderNumStr} (CONTINUAÇÃO)`, marginX + 4, currentY - 0.5);
      
      currentY += 4;
      currentY = renderTableHeader(currentY);
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
    doc.setFontSize(8);
    doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
    doc.text(refNum, colRefX, currentY + 12.5);

    // Foto (18mm x 18mm)
    const imgX = colDescX;
    const imgY = currentY + 2.5;
    let hasImageDrawn = false;

    if (part?.imageUrl && itemImages[part.imageUrl]) {
      hasImageDrawn = safeAddImage(doc, itemImages[part.imageUrl], imgX, imgY, imgSize, imgSize);
    }

    if (!hasImageDrawn) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
      doc.roundedRect(imgX, imgY, imgSize, imgSize, 1.2, 1.2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
      doc.text('FOTO 3D', imgX + 3.5, imgY + 10);
    }

    // Título da Peça com largura estritamente limitada para NUNCA invadir as colunas de preço
    const textDescX = imgX + imgSize + 4;
    const maxTitleW = colQtyX - textDescX - 3; // ~83mm de largura garantida
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);

    const titleLines = doc.splitTextToSize(itemTitle, maxTitleW);
    const dispTitleLines = titleLines.slice(0, 2);

    if (dispTitleLines.length === 1) {
      doc.text(dispTitleLines[0], textDescX, currentY + 10.5);
    } else {
      doc.text(dispTitleLines[0], textDescX, currentY + 8.5);
      doc.text(dispTitleLines[1], textDescX, currentY + 12.5);
    }

    // Informação de material ou categoria se disponível
    const matInfo = part?.material || part?.category || '';
    if (matInfo) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
      doc.text(`Material / Linha: ${matInfo}`, textDescX, currentY + 17.5);
    }

    // Quantidade
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text(qtyStr, colQtyX, currentY + 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
    doc.text('un', colQtyX + doc.getTextWidth(qtyStr) + 1.5, currentY + 12.5);

    // Unitário
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text(unitPriceStr, colUnitX, currentY + 12.5);

    // Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text(totalPriceStr, colTotalX, currentY + 12.5);

    currentY += rowHeight;
  });

  currentY += 4;

  // 5. BLOCO FINAL: CONDIÇÕES TÉCNICAS (ESQUERDA) vs RESUMO FINANCEIRO (DIREITA - CARD ESCURO)
  const bottomBoxHeight = 42;
  const condWidth = 110;
  const financeWidth = contentWidth - condWidth - 4; // 68mm
  const condX = marginX;
  const financeX = marginX + condWidth + 4;

  // Garante que o bloco final e o Pix/Termo caibam na folha ou saltem limpos para a próxima
  const remainingNeeded = bottomBoxHeight + (showPaymentInfo ? 31 : 28) + 16;
  if (currentY + remainingNeeded > pageHeight) {
    doc.addPage();
    currentY = 16;
    
    // Top bar de continuação
    doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.rect(marginX, currentY - 2.2, 2.2, 2.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text(`${showPaymentInfo ? 'ORDEM DE PRODUÇÃO' : 'ORÇAMENTO'} ${orderNumStr} - CONDIÇÕES & PAGAMENTO`, marginX + 4, currentY - 0.5);
    currentY += 5;
  }

  // 5.1 Card Condições Técnicas e Fabricação (Fundo Claro)
  doc.setFillColor(colorCardBg[0], colorCardBg[1], colorCardBg[2]);
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.roundedRect(condX, currentY, condWidth, bottomBoxHeight, 2, 2, 'FD');

  doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.circle(condX + 5, currentY + 4.8, 0.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('CONDIÇÕES TÉCNICAS E FORNECIMENTO', condX + 8, currentY + 5.5);

  const termBadge = 'CONDIÇÕES GERAIS';
  doc.setFont('courier', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  doc.text(termBadge, condX + condWidth - doc.getTextWidth(termBadge) - 4, currentY + 5.5);

  const gridY1 = currentY + 9;
  const gridY2 = currentY + 18.5;

  // Box 1: Prazo
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.18);
  doc.roundedRect(condX + 4, gridY1, 48, 8, 1, 1, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('PRAZO DE FABRICAÇÃO:', condX + 6, gridY1 + 2.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('A combinar c/ cliente', condX + 6, gridY1 + 6.2);

  // Box 2: Condição Comercial
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(condX + 55, gridY1, 51, 8, 1, 1, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text(showPaymentInfo ? 'SITUAÇÃO DO PEDIDO:' : 'CONDIÇÃO COMERCIAL:', condX + 57, gridY1 + 2.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text(showPaymentInfo ? (isPaid ? 'Pago / Quitado' : 'Aprovado / Em Produção') : 'Sujeita à Aprovação', condX + 57, gridY1 + 6.2);

  // Box 3: Envio / Logística
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(condX + 4, gridY2, 102, 8, 1, 1, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('ENVIO / LOGÍSTICA:', condX + 6, gridY2 + 2.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('A combinar (Retirada ou Envio)', condX + 6, gridY2 + 6.2);

  // Nota de Manufatura
  const noteY = currentY + 28.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('NOTA DE MANUFATURA:', condX + 4, noteY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  const noteLines = doc.splitTextToSize(
    'Peças fabricadas sob demanda conforme arquivo digital validado. Linhas e texturas superficiais são características próprias do processo de impressão 3D (FDM/FFF).',
    condWidth - 8
  );
  doc.text(noteLines, condX + 4, noteY + 3.2);

  // 5.2 Card Resumo Financeiro (FUNDO PRETO INDUSTRIAL #0B0F19)
  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(financeX, currentY, financeWidth, bottomBoxHeight, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.text('RESUMO FINANCEIRO', financeX + 5, currentY + 5.5);

  const quoteTagRight = `${showPaymentInfo ? 'PEDIDO' : 'PROPOSTA'} ${orderNumStr}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text(quoteTagRight, financeX + financeWidth - doc.getTextWidth(quoteTagRight) - 5, currentY + 5.5);

  const subtotal = subtotalCalc;
  const discount = discountCalc;
  const total = orderTotalVal;

  let finY = currentY + 11;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('Subtotal dos Itens:', financeX + 5, finY);
  const subtotalStr = formatCurrency(subtotal);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(subtotalStr, financeX + financeWidth - doc.getTextWidth(subtotalStr) - 5, finY);

  finY += 5.5;
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

  finY += 3.5;
  doc.setDrawColor(colorDarkBorder[0], colorDarkBorder[1], colorDarkBorder[2]);
  doc.setLineWidth(0.3);
  doc.line(financeX + 5, finY, financeX + financeWidth - 5, finY);

  finY += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text(showPaymentInfo ? 'TOTAL DO PEDIDO:' : 'VALOR TOTAL LÍQUIDO:', financeX + 5, finY);

  finY += 7.5;
  const totalStr = formatCurrency(total);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(255, 255, 255);
  doc.text(totalStr, financeX + financeWidth - doc.getTextWidth(totalStr) - 5, finY);

  finY += 3.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  const finFootNote = showPaymentInfo 
    ? (isPaid ? 'Pagamento confirmado no caixa' : 'Aguardando pagamento via Pix') 
    : 'Orçamento sujeito à aprovação do cliente';
  doc.text(finFootNote, financeX + 5, finY);

  currentY += bottomBoxHeight + 4;

  // 5.3 SEÇÃO: DADOS PARA PAGAMENTO PIX OU TERMO INFORMATIVO
  if (showPaymentInfo) {
    const payBoxHeight = 31;
    const payX = marginX;
    const payWidth = contentWidth;

    doc.setFillColor(colorCardBg[0], colorCardBg[1], colorCardBg[2]);
    doc.setDrawColor(colorTealBorder[0], colorTealBorder[1], colorTealBorder[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(payX, currentY, payWidth, payBoxHeight, 2, 2, 'FD');

    doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.circle(payX + 5, currentY + 4.8, 0.9, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text('DADOS PARA PAGAMENTO VIA PIX (BANCO CENTRAL DO BRASIL)', payX + 8, currentY + 5.5);

    const payBadgeText = isPaid ? 'PAGAMENTO CONFIRMADO' : 'AGUARDANDO PAGAMENTO';
    const payBadgeW = doc.getTextWidth(payBadgeText) + 4;
    doc.setFillColor(isPaid ? colorSoftTeal[0] : 255, isPaid ? colorSoftTeal[1] : 255, isPaid ? colorSoftTeal[2] : 255);
    doc.setDrawColor(colorTealBorder[0], colorTealBorder[1], colorTealBorder[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(payX + payWidth - payBadgeW - 4, currentY + 2.5, payBadgeW, 4, 0.8, 0.8, 'FD');
    doc.setFont('courier', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
    doc.text(payBadgeText, payX + payWidth - payBadgeW - 2, currentY + 5.2);

    let contentStartX = payX + 5;
    if (pixData?.qrCodeDataUrl) {
      const qrSize = 20;
      const qrY = currentY + 7.5;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
      doc.roundedRect(payX + 4, qrY - 0.6, qrSize + 1.2, qrSize + 1.2, 1, 1, 'FD');
      safeAddImage(doc, pixData.qrCodeDataUrl, payX + 4.6, qrY, qrSize, qrSize);
      contentStartX = payX + qrSize + 8;
    }

    // Linha 1: Chave Pix
    const keyTypeStr = getPixKeyTypeLabel(business.pixKeyType);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
    doc.text(`CHAVE PIX (${keyTypeStr.toUpperCase()}):`, contentStartX, currentY + 10.5);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    const cleanPixKeyStr = pixData?.formattedKey || business.pixKey || 'Chave Pix a combinar com a oficina';
    doc.text(cleanPixKeyStr, contentStartX, currentY + 14.5);

    // Linha 2: Favorecido e Banco
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
    const recName = business.pixReceiverName || companyName;
    const bankName = business.pixBank;
    let bankLine = `Favorecido: ${recName}`;
    if (bankName) {
      bankLine += `  •  Instituição/Banco: ${bankName}`;
    }
    doc.text(bankLine.slice(0, 95), contentStartX, currentY + 19);

    // Linha 3: Total e Instruções
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
    doc.text(`Valor a Pagar: ${formatCurrency(total)}`, contentStartX, currentY + 23);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
    const payInstruction = 'Abra o app do seu banco, acesse Pix > Ler QR Code ou Copia e Cola com a chave acima e envie o comprovante.';
    doc.text(payInstruction, contentStartX, currentY + 27);

    currentY += payBoxHeight + 4;
  } else {
    // Modo Orçamento Comercial Informativo
    const termBoxHeight = 28;
    const termX = marginX;
    const termWidth = contentWidth;

    doc.setFillColor(colorCardBg[0], colorCardBg[1], colorCardBg[2]);
    doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(termX, currentY, termWidth, termBoxHeight, 2, 2, 'FD');

    doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.circle(termX + 5, currentY + 4.8, 0.9, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text('INFORMAÇÕES COMERCIAIS & SUJEIÇÃO À APROVAÇÃO', termX + 8, currentY + 5.5);

    const termBadgeText = 'PROPOSTA INFORMATIVA';
    const termBadgeW = doc.getTextWidth(termBadgeText) + 4;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
    doc.setLineWidth(0.2);
    const badgeX = termX + termWidth - termBadgeW - 4;
    doc.roundedRect(badgeX, currentY + 2.5, termBadgeW, 4, 0.8, 0.8, 'FD');
    doc.setFont('courier', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
    doc.text(termBadgeText, badgeX + 2, currentY + 5.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.3);
    doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
    const termLines = [
      '• Este documento constitui um orçamento prévio exclusivamente comercial e informativo para apresentação dos custos do serviço.',
      '• A emissão desta proposta NÃO gera cobrança, débito pendente nem alteração de caixa. O documento informa apenas os preços estimados.',
      '• Proposta sujeita à aprovação formal do cliente. O início da produção e a definição do pagamento ocorrerão mediante aprovação.'
    ];

    let termLineY = currentY + 10;
    termLines.forEach(line => {
      const wrapped = doc.splitTextToSize(line, termWidth - 10);
      doc.text(wrapped, termX + 5, termLineY);
      termLineY += (Array.isArray(wrapped) ? wrapped.length : 1) * 3.3;
    });

    currentY += termBoxHeight + 4;
  }

  // 6. RENDERIZAÇÃO DO RODAPÉ EM TODAS AS PÁGINAS (PÁG 1 DE N)
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

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = pageHeight - 14;

    doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
    doc.setLineWidth(0.3);
    doc.line(marginX, footerY, pageWidth - marginX, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    doc.text(contactFooterStr.slice(0, 110), marginX, footerY + 4.5);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5.2);
    doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
    const legalFooterStr = `"Obrigado pela oportunidade de fabricar sua ideia."  •  EMISSÃO: ${emissionDate}  •  AUTENTICAÇÃO: ${authHash}`;
    doc.text(legalFooterStr.slice(0, 115), marginX, footerY + 8.5);

    const pageNumStr = `Pág. ${p} de ${totalPages}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
    doc.text(pageNumStr, pageWidth - marginX - doc.getTextWidth(pageNumStr), footerY + 8.5);
  }

  return doc;
}

/**
 * Downloads the generated PDF to the user's browser
 */
export async function downloadQuotePdf(params: QuotePdfParams): Promise<void> {
  const doc = await buildQuotePdfDoc(params);
  const orderNum = getRealisticOrderNumber(params.order);
  const isPending = normalizeOrderStatus(params.order.status) === OrderStatus.PENDING;
  const showPayment = typeof params.includePaymentInfo === 'boolean' ? params.includePaymentInfo : !isPending;
  const filename = `${showPayment ? 'Pedido' : 'Orcamento'}_${orderNum.replace('#', '')}.pdf`;
  doc.save(filename);
}

/**
 * Returns Blob of the generated PDF
 */
export async function getQuotePdfBlob(params: QuotePdfParams): Promise<Blob> {
  const doc = await buildQuotePdfDoc(params);
  return doc.output('blob');
}

/**
 * Uploads generated PDF to Supabase Storage and returns the public URL
 * so that WhatsApp recipients can open the complete PDF file directly via link.
 */
export async function uploadQuotePdfToStorage(params: QuotePdfParams): Promise<string | null> {
  try {
    const pdfBlob = await getQuotePdfBlob(params);
    const orderNum = getRealisticOrderNumber(params.order);
    const isPending = normalizeOrderStatus(params.order.status) === OrderStatus.PENDING;
    const showPayment = typeof params.includePaymentInfo === 'boolean' ? params.includePaymentInfo : !isPending;
    const prefix = showPayment ? 'Pedido' : 'Orcamento';
    const filename = `${prefix}_${orderNum.replace('#', '')}.pdf`;
    const storagePath = `quotes/${params.order.id}/${filename}`;

    const { data, error } = await supabase.storage
      .from('PARTS-IMAGES')
      .upload(storagePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (!error && data?.path) {
      const { data: { publicUrl } } = supabase.storage
        .from('PARTS-IMAGES')
        .getPublicUrl(data.path);
      return publicUrl;
    }
    return null;
  } catch (err) {
    console.warn('Falha no upload do PDF para link público:', err);
    return null;
  }
}
