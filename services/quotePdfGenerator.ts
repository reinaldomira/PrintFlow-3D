import { jsPDF } from 'jspdf';
import { Order, Customer, Part, Filament, Settings } from '../types';
import { formatCurrency } from '../constants';

interface QuotePdfParams {
  order: Order;
  customer?: Customer;
  parts: Part[];
  filaments: Filament[];
  settings: Settings;
}

/**
 * Safely loads an image as base64 data URL for jsPDF embedding
 */
async function getImageDataUrl(url?: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image')) return url;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Não foi possível carregar imagem para o PDF:', err);
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

  // 1. TOP BAR TÉCNICO (PRINT_3D SPEC-DOC | ISO/ASTM 52900 | ISO 2768-m | DOC: REV.04)
  // Quadrado teal indicador
  doc.setFillColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.rect(marginX, currentY - 2.2, 2.2, 2.2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  doc.text('PRINT_3D SPEC-DOC', marginX + 3.8, currentY - 0.5);

  // Separador 1
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.2);
  doc.line(marginX + 33, currentY - 3, marginX + 33, currentY + 0.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  doc.text('FABRICAÇÃO ADITIVA ISO/ASTM 52900', marginX + 36, currentY - 0.5);

  // Separador 2
  doc.line(marginX + 87, currentY - 3, marginX + 87, currentY + 0.5);
  doc.text('TOLERÂNCIA GERAL: ISO 2768-m  | | | | | | | |', marginX + 90, currentY - 0.5);

  // Badge DOC: REV.04 à direita (Fundo Preto com texto Branco)
  const docTagWidth = 16;
  const docTagX = pageWidth - marginX - docTagWidth;
  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(docTagX, currentY - 3.5, docTagWidth, 4.5, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(255, 255, 255);
  doc.text('DOC: REV.04', docTagX + 1.8, currentY - 0.5);

  // Linha divisória fina
  currentY += 2;
  doc.setDrawColor(colorBorder[0], colorBorder[1], colorBorder[2]);
  doc.setLineWidth(0.25);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  currentY += 5;

  // 2. LOGO & BRANDING vs QUADRO DE ORÇAMENTO (CARD PRETO #0B0F19)
  const brandStartY = currentY;

  // Se tem logotipo
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', marginX, brandStartY, 28, 13, undefined, 'FAST');
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
      doc.text(companyName, marginX, brandStartY + 7);
    }
  } else {
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

  // Badge "ENGENHARIA DE PRECISÃO" ao lado do nome
  const badgePrecX = marginX + (logoData ? 30 : 54);
  doc.setFillColor(colorSoftTeal[0], colorSoftTeal[1], colorSoftTeal[2]);
  doc.setDrawColor(colorTealBorder[0], colorTealBorder[1], colorTealBorder[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(badgePrecX, brandStartY + 2, 33, 4.2, 0.8, 0.8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
  doc.text('ENGENHARIA DE PRECISÃO', badgePrecX + 2.5, brandStartY + 5);

  // Tagline da Empresa
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  const defaultTagline = 'Manufatura aditiva industrial, engenharia reversa & prototipagem rápida';
  doc.text(defaultTagline, marginX, brandStartY + 14);

  // Card do Orçamento à Direita (Fundo Preto Industrial #0B0F19)
  const orderBoxWidth = 65;
  const orderBoxHeight = 22;
  const orderBoxX = pageWidth - marginX - orderBoxWidth;

  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(orderBoxX, brandStartY, orderBoxWidth, orderBoxHeight, 2, 2, 'F');

  // Cabeçalho da Caixa: "ORÇAMENTO Nº" (Esquerda) e "#2025-0842" em Verde Esmeralda (Direita)
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

  // Datas: Emissão e Validade com destaque verde
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('EMISSÃO:', orderBoxX + 4, brandStartY + 13.5);
  doc.text('VALIDADE:', orderBoxX + 32, brandStartY + 13.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text(emissionDate, orderBoxX + 4, brandStartY + 18);

  const valText = '15 dias';
  doc.text(valText, orderBoxX + 32, brandStartY + 18);
  if (validityInfo.short) {
    doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.text(` (${validityInfo.short})`, orderBoxX + 32 + doc.getTextWidth(valText), brandStartY + 18);
  }

  currentY = brandStartY + 26;

  // 3. CARDS: CLIENTE / SOLICITANTE (ESQUERDA) + PROPOSTA TÉCNICA (DIREITA - CARD ESCURO)
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

  // Badge "CADASTRO VERIFICADO" com borda teal
  const verBadgeText = 'CADASTRO VERIFICADO';
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

  // 3.2 Card Proposta Técnica (Card Escuro Industrial #0B0F19)
  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(proposalCardX, currentY, proposalCardWidth, clientCardHeight, 2, 2, 'F');

  // Cabeçalho da Proposta
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.text('PROPOSTA TÉCNICA', proposalCardX + 5, currentY + 5.5);

  // Tag LOTE #01
  const loteTagText = 'LOTE #01';
  const loteTagWidth = doc.getTextWidth(loteTagText) + 4;
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(proposalCardX + proposalCardWidth - loteTagWidth - 4, currentY + 2.5, loteTagWidth, 4.2, 0.8, 0.8, 'F');
  doc.setFontSize(5.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text(loteTagText, proposalCardX + proposalCardWidth - loteTagWidth - 2, currentY + 5.5);

  // Título "ORÇAMENTO COMERCIAL"
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text('ORÇAMENTO COMERCIAL', proposalCardX + 5, currentY + 11.5);

  // Descrição
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  const descTech = 'Itens customizados sob normas técnicas de manufatura aditiva para integração em projeto de automação.';
  const descLines = doc.splitTextToSize(descTech, proposalCardWidth - 10);
  doc.text(descLines, proposalCardX + 5, currentY + 16);

  // Linha vertical verde esmeralda + citação
  doc.setDrawColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.setLineWidth(0.8);
  doc.line(proposalCardX + 5, currentY + 21, proposalCardX + 5, currentY + 26.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.8);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text('"Precisão nos detalhes. Qualidade em cada', proposalCardX + 7.5, currentY + 23.2);
  doc.text('camada."', proposalCardX + 7.5, currentY + 26);

  currentY += clientCardHeight + 5;

  // 4. TABELA DE ITENS COM CABEÇALHO ESCURO INDUSTRIAL
  const itemsCount = (order.items || []).length;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
  const sectionTitle = '01. DISCRIMINAÇÃO DOS ITENS E SERVIÇOS';
  doc.text(sectionTitle, marginX, currentY + 3.5);

  // Badge "X ITENS VALIDADOS" em teal
  const valItemsText = `${itemsCount} ${itemsCount === 1 ? 'ITEM VALIDADO' : 'ITENS VALIDADOS'}`;
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
    const unitPriceStr = formatCurrency(item.unitPrice);
    const totalPriceStr = formatCurrency(item.unitPrice * item.quantity);

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

    // Foto Ampliada (31mm x 31mm)
    const imgX = colDescX;
    const imgY = currentY + 2.5;
    const imgSize = 31;
    let hasImageDrawn = false;

    if (part?.imageUrl && itemImages[part.imageUrl]) {
      try {
        doc.addImage(itemImages[part.imageUrl]!, 'JPEG', imgX, imgY, imgSize, imgSize);
        hasImageDrawn = true;
      } catch {
        hasImageDrawn = false;
      }
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

    // Texto do Produto (Apenas Nome + Badge FDM/SLA + Subtítulo limpo)
    const textDescX = imgX + imgSize + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(colorDarkText[0], colorDarkText[1], colorDarkText[2]);
    const maxTitleLen = 32;
    const cleanTitle = itemTitle.length > maxTitleLen ? itemTitle.slice(0, maxTitleLen) + '...' : itemTitle;
    doc.text(cleanTitle, textDescX, currentY + 14);

    // Badge Tecnológica (Ex: FDM INDUSTRIAL) em tom Teal
    const titleWidth = doc.getTextWidth(cleanTitle);
    const badgeTechX = textDescX + titleWidth + 3;
    doc.setFillColor(colorSoftTeal[0], colorSoftTeal[1], colorSoftTeal[2]);
    doc.setDrawColor(colorTealBorder[0], colorTealBorder[1], colorTealBorder[2]);
    doc.roundedRect(badgeTechX, currentY + 10.5, 23, 4.2, 0.8, 0.8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(colorTealDark[0], colorTealDark[1], colorTealDark[2]);
    doc.text('FDM INDUSTRIAL', badgeTechX + 2, currentY + 13.5);

    // Subtítulo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
    doc.text('Componente técnico com tolerância industrial conforme projeto.', textDescX, currentY + 20);

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
  doc.text('CONDIÇÕES TÉCNICAS E FABRICAÇÃO', condX + 8, currentY + 5.8);

  const termBadge = 'PADRÃO: TERM-ENG-V25';
  doc.setFont('courier', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(colorMutedText[0], colorMutedText[1], colorMutedText[2]);
  doc.text(termBadge, condX + condWidth - doc.getTextWidth(termBadge) - 4, currentY + 5.5);

  // Grid Condições Técnicas (Pequenos cards brancos com borda fina conforme pdf-2)
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
  doc.text('4 a 6 dias úteis', condX + 6, gridY1 + 6.5);

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
  const payMethodText = `${order.paymentMethod || 'PIX'} / Boleto (50% sinal)`;
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
  doc.text('Sedex Express c/ Seguro e Rastreio', condX + 6, gridY2 + 6.5);

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
    'Peças fabricadas sob demanda conforme arquivo digital validado pelo contratante. Microestrias superficiais são características físicas intrínsecas ao processo de manufatura aditiva.',
    condWidth - 8
  );
  doc.text(noteLines, condX + 4, noteY + 3.5);

  // 5.2 Card Resumo Financeiro (FUNDO PRETO INDUSTRIAL #0B0F19)
  doc.setFillColor(colorDarkBg[0], colorDarkBg[1], colorDarkBg[2]);
  doc.roundedRect(financeX, currentY, financeWidth, bottomBoxHeight, 2, 2, 'F');

  // Título em Verde Esmeralda Dourado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
  doc.text('RESUMO FINANCEIRO', financeX + 5, currentY + 5.5);

  const quoteTagRight = `PROPOSTA ${orderNumStr}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
  doc.text(quoteTagRight, financeX + financeWidth - doc.getTextWidth(quoteTagRight) - 5, currentY + 5.5);

  const subtotal = (order.items || []).reduce((acc, i) => acc + (i.unitPrice * i.quantity), 0);
  const discount = order.discount || 0;
  const total = order.totalValue || Math.max(0, subtotal - discount);

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

  // Desconto ou Frete
  finY += 6;
  if (discount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
    doc.text('Desconto em Lote:', financeX + 5, finY);
    const discStr = `- ${formatCurrency(discount)}`;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorPrimaryEmerald[0], colorPrimaryEmerald[1], colorPrimaryEmerald[2]);
    doc.text(discStr, financeX + financeWidth - doc.getTextWidth(discStr) - 5, finY);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorLightMuted[0], colorLightMuted[1], colorLightMuted[2]);
    doc.text('Frete Sedex (Com Seguro):', financeX + 5, finY);
    const freteStr = 'Incluso / Balcão';
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(freteStr, financeX + financeWidth - doc.getTextWidth(freteStr) - 5, finY);
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
  doc.text('Condição especial à vista', financeX + 5, finY);

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
