import React, { useState, useEffect } from 'react';
import { Order, Customer, Part, Filament, Settings, OrderStatus } from '../types';
import { downloadQuotePdf, getQuotePdfBlob, getRealisticOrderNumber, uploadQuotePdfToStorage } from '../services/quotePdfGenerator';
import { normalizeOrderStatus, isOrderPaid } from '../utils/statusUtils';
import { getCompletePixData } from '../services/pixService';
import { formatCurrency } from '../constants';
import { 
  X, Download, Printer, MessageCircle, FileText, CheckCircle2, 
  Layers, Loader2, QrCode, Check, Copy
} from 'lucide-react';

interface QuotePdfModalProps {
  order: Order;
  customer?: Customer;
  parts: Part[];
  filaments: Filament[];
  settings: Settings;
  onClose: () => void;
}

export const QuotePdfModal: React.FC<QuotePdfModalProps> = ({
  order,
  customer,
  parts,
  filaments,
  settings,
  onClose
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [whatsAppNotice, setWhatsAppNotice] = useState<string | null>(null);
  const [lastPdfUrl, setLastPdfUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const isPendingQuote = normalizeOrderStatus(order.status) === OrderStatus.PENDING;
  const isPaid = isOrderPaid(order);

  // Por padrão, se o pedido já foi aprovado (status !== PENDING), os dados de pagamento vêm ATIVOS.
  // Se for orçamento pendente, vêm DESATIVADOS por padrão, mas o usuário pode alternar com 1 clique.
  const [includePaymentInfo, setIncludePaymentInfo] = useState<boolean>(!isPendingQuote);

  const business = settings.businessInfo || {};
  const companyName = business.companyName || 'PRINT_3Dbr';
  const orderNumStr = getRealisticOrderNumber(order);
  const emissionDate = new Date(order.createdAt).toLocaleDateString('pt-BR');

  const subtotal = (order.items || []).reduce((acc, i) => acc + (i.unitPrice * i.quantity), 0);
  const discount = order.discount || 0;
  const total = (typeof order.totalValue === 'number' && !isNaN(order.totalValue))
    ? order.totalValue
    : Math.max(0, subtotal - discount);

  // Dados do Pix para pré-visualização na folha
  const [pixPreview, setPixPreview] = useState<{
    qrCodeDataUrl?: string;
    formattedKey?: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (includePaymentInfo && business.pixKey) {
      getCompletePixData(business, total, orderNumStr.replace('#', '')).then(res => {
        if (isMounted && res.isValid) {
          setPixPreview({
            qrCodeDataUrl: res.qrCodeDataUrl,
            formattedKey: res.formattedKey || business.pixKey
          });
        }
      });
    }
    return () => { isMounted = false; };
  }, [includePaymentInfo, business, total, orderNumStr]);

  // Calcula validade (15 dias úteis)
  const calcValidity = () => {
    const d = new Date(order.createdAt);
    let count = 0;
    while (count < 15) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    }
    const dayStr = String(d.getDate()).padStart(2, '0');
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');
    return {
      full: d.toLocaleDateString('pt-BR'),
      short: `${dayStr}/${monthStr}`
    };
  };
  const validityInfo = calcValidity();

  const handleDownload = async () => {
    try {
      setIsGenerating(true);
      await downloadQuotePdf({
        order,
        customer,
        parts,
        filaments,
        settings,
        includePaymentInfo
      });
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Não foi possível gerar o arquivo PDF. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  /**
  const [lastPdfUrl, setLastPdfUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  /**
   * Envia o PDF e proposta técnica pelo WhatsApp:
   * 1. Gera o blob binário do PDF e tenta upload para obter link direto em nuvem.
   * 2. Em dispositivos compatíveis (celulares, tablets ou navegadores modernos), anexa o arquivo PDF
   *    diretamente no WhatsApp através da Web Share API nativa.
   * 3. No Desktop (WhatsApp Web), inclui o link direto do PDF na mensagem, baixa o arquivo
   *    automaticamente e orienta o usuário a arrastar ou anexar via clipe (📎).
   */
  const handleSendWhatsAppPdf = async () => {
    setIsSharingWhatsApp(true);
    setWhatsAppNotice(null);

    const phone = customer?.phone?.replace(/\D/g, '') || business.whatsapp?.replace(/\D/g, '') || '';
    const orderNum = getRealisticOrderNumber(order);
    const filename = `${includePaymentInfo ? 'Pedido' : 'Orcamento'}_${orderNum.replace('#', '')}.pdf`;

    const itemsSummary = (order.items || []).map(i => {
      const part = parts.find(p => p.id === i.partId);
      return `• ${i.quantity}x ${i.name || part?.name || 'Item 3D'} - ${formatCurrency((Number(i.unitPrice) || 0) * (Number(i.quantity) || 1))}`;
    }).join('\n');

    let textMessage = '';

    try {
      // 1. Gera o blob binário oficial do PDF
      const pdfBlob = await getQuotePdfBlob({
        order,
        customer,
        parts,
        filaments,
        settings,
        includePaymentInfo
      });

      // 2. Faz o upload na nuvem para gerar o link público de acesso direto
      let onlineUrl: string | null = null;
      try {
        onlineUrl = await uploadQuotePdfToStorage({
          order,
          customer,
          parts,
          filaments,
          settings,
          includePaymentInfo
        });
        if (onlineUrl) {
          setLastPdfUrl(onlineUrl);
        }
      } catch (uploadErr) {
        console.warn('Upload de PDF online não concluído:', uploadErr);
      }

      // 3. Monta a mensagem incluindo o link direto caso disponível
      const docLinkText = onlineUrl 
        ? `\n\n📄 *Visualizar / Baixar PDF Oficial:* \n${onlineUrl}\n`
        : `\n\n📄 *Documento Oficial em PDF:* Anexo a esta conversa.\n`;

      if (includePaymentInfo) {
        let pixPaymentText = '';
        if (business.pixKey) {
          pixPaymentText = `\n*DADOS PARA PAGAMENTO PIX:*\n` +
            `🔑 Chave Pix: *${business.pixKey}*` + (business.pixKeyType ? ` (${business.pixKeyType.toUpperCase()})` : '') + `\n` +
            (business.pixReceiverName ? `👤 Favorecido: ${business.pixReceiverName}\n` : '') +
            (business.pixBank ? `🏦 Banco: ${business.pixBank}\n` : '') +
            `💰 Valor a Pagar: *${formatCurrency(total)}*\n`;
        }

        textMessage = 
          `Olá ${customer?.name || 'Cliente'}! Segue o documento de confirmação do pedido da *${companyName}*:\n\n` +
          `*Pedido:* ${orderNumStr}\n` +
          `*Data:* ${emissionDate}\n` +
          `*Status:* ${isPaid ? 'Pago' : 'Aprovado / Em Produção'}\n\n` +
          `*Itens:* \n${itemsSummary}\n\n` +
          (discount > 0 ? `*Desconto Aplicado:* -${formatCurrency(discount)}\n` : '') +
          `*VALOR TOTAL:* ${formatCurrency(total)}\n` +
          pixPaymentText +
          docLinkText +
          `O documento oficial em PDF com QR Code Pix para pagamento e especificações completas está anexo. Qualquer dúvida estamos à disposição!`;
      } else {
        textMessage = 
          `Olá ${customer?.name || 'Cliente'}! Segue a proposta comercial de orçamento da *${companyName}*:\n\n` +
          `*Orçamento:* ${orderNumStr}\n` +
          `*Data de Emissão:* ${emissionDate} (Validade: 15 dias úteis)\n\n` +
          `*Itens:* \n${itemsSummary}\n\n` +
          (discount > 0 ? `*Desconto Aplicado:* -${formatCurrency(discount)}\n` : '') +
          `*VALOR TOTAL:* ${formatCurrency(total)}\n\n` +
          `*Condição Comercial:* Proposta sujeita à sua aprovação. Sem cobrança ou pagamento imediato.\n` +
          docLinkText +
          `O documento oficial em PDF com especificações técnicas completas está anexo. Ficamos à disposição para quaisquer dúvidas ou ajustes!`;
      }

      // 4. Compartilhamento Nativo com Arquivo (Web Share API)
      // Em celulares Android, iPhone/iPad e navegadores com suporte, isso envia o ARQUIVO PDF físico diretamente para o WhatsApp!
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        try {
          await navigator.share({
            title: `${companyName} - ${filename}`,
            text: textMessage,
            files: [pdfFile]
          });
          setWhatsAppNotice(
            `Arquivo PDF oficial (${filename}) compartilhado com sucesso diretamente no WhatsApp!`
          );
          setIsSharingWhatsApp(false);
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            setIsSharingWhatsApp(false);
            return;
          }
          console.warn('Compartilhamento nativo não finalizado, abrindo WhatsApp Web:', shareErr);
        }
      }

      // 5. Fallback para Desktop (WhatsApp Web)
      // Como o protocolo web wa.me não aceita injeção direta de arquivos por segurança do navegador,
      // baixamos o PDF oficial para o computador e abrimos a conversa com o link oficial na mensagem.
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

      const encodedText = encodeURIComponent(textMessage);
      const waUrl = phone ? `https://wa.me/55${phone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
      const waWindow = window.open(waUrl, '_blank');
      if (!waWindow || waWindow.closed || typeof waWindow.closed === 'undefined') {
        const a = document.createElement('a');
        a.href = waUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
      }

      setWhatsAppNotice(
        onlineUrl
          ? `Conversa do WhatsApp aberta com o link de acesso ao PDF! O arquivo (${filename}) também foi baixado no seu computador. No WhatsApp Web, para enviar o documento físico, basta arrastá-lo para a conversa ou clicar em Anexo (📎) > Documento.`
          : `Conversa do WhatsApp aberta e arquivo (${filename}) baixado com sucesso! No WhatsApp Web, basta arrastar o arquivo para a conversa ou clicar em Anexo (📎) > Documento para enviar o PDF.`
      );
    } catch (err: any) {
      console.error('Aviso ao preparar PDF para WhatsApp:', err);
      // Fallback seguro de emergência
      const fallbackMsg = `Olá! Segue o documento referente ao pedido ${orderNumStr} da ${companyName}.`;
      const fallbackUrl = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(fallbackMsg)}` : `https://wa.me/?text=${encodeURIComponent(fallbackMsg)}`;
      window.open(fallbackUrl, '_blank');
      setWhatsAppNotice('Conversa aberta no WhatsApp! Se o arquivo não baixou automaticamente, clique no botão "Baixar PDF" acima.');
    } finally {
      setIsSharingWhatsApp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[96vh]">
        
        {/* Barra Superior / Ações */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/95 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
              includePaymentInfo
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
            }`}>
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base text-zinc-100 uppercase tracking-tight">
                  {includePaymentInfo ? 'Pedido de Produção & Pagamento Pix' : 'Proposta Técnica & Orçamento Comercial'}
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-emerald-400">
                  {orderNumStr}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Layout industrial de alta precisão (Padrão ISO/ASTM 52900)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Botão de Alternância de Dados de Pagamento Pix */}
            <button
              type="button"
              onClick={() => setIncludePaymentInfo(!includePaymentInfo)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border shadow-xs cursor-pointer ${
                includePaymentInfo
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/30'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Ativar ou ocultar dados bancários e QR Code Pix no PDF"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-400" />
              <span>{includePaymentInfo ? 'Pix Ativo no PDF' : 'Ativar Pix no PDF'}</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 ${
                downloadSuccess 
                  ? 'bg-emerald-500 text-zinc-950 font-black' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gerando PDF...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>PDF Baixado!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Baixar PDF</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center gap-1.5 transition-colors"
              title="Imprimir documento A4"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>

            <button
              onClick={handleSendWhatsAppPdf}
              disabled={isSharingWhatsApp}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-xs"
              title="Enviar PDF no WhatsApp"
            >
              {isSharingWhatsApp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Preparando PDF...</span>
                </>
              ) : (
                <>
                  <MessageCircle className="w-4 h-4 text-emerald-400" />
                  <span>Enviar no WhatsApp</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra Informativa do Modo Atual */}
        <div className="px-4 py-2.5 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full ${includePaymentInfo ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
            <span className="text-[11px] font-bold text-zinc-200">
              {includePaymentInfo ? 'Documento de Pedido com Dados Pix' : 'Orçamento Comercial Pré-Aprovação'}
            </span>
            <span className="text-[10px] text-zinc-500">•</span>
            <span className="text-[10px] text-zinc-400">
              {includePaymentInfo 
                ? 'QR Code, Chave Pix e instruções de recebimento exibidos' 
                : 'Sem vínculo de pagamento ou cobrança gerada • Sujeito à aprovação do cliente'}
            </span>
          </div>

          <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
            {includePaymentInfo ? (isPaid ? 'Situação: Pago' : 'Situação: Aprovado') : `Validade: 15 dias (${validityInfo.short})`}
          </span>
        </div>

        {/* Banner Informativo quando o WhatsApp e download são acionados */}
        {whatsAppNotice && (
          <div className="bg-emerald-950/90 border-b border-emerald-500/30 p-3.5 px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-200 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <p className="leading-snug font-medium text-emerald-100">
                  {whatsAppNotice}
                </p>
                {lastPdfUrl && (
                  <p className="text-[11px] text-emerald-300/80 font-mono break-all">
                    Link do PDF: <span className="underline select-all">{lastPdfUrl}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {lastPdfUrl && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(lastPdfUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2500);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link'}</span>
                </button>
              )}
              <button
                onClick={() => setWhatsAppNotice(null)}
                className="p-1 rounded-lg hover:bg-emerald-900/60 text-emerald-400 hover:text-emerald-100 flex-shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Pré-visualização da Folha A4 do Orçamento (Fiel a pdf-2_64ef64aa.jpg) */}
        <div className="p-3 sm:p-6 bg-zinc-950 overflow-y-auto flex justify-center">
          <div 
            id="quote-printable-sheet" 
            className="w-full max-w-[210mm] bg-white text-slate-900 rounded-lg shadow-2xl p-6 sm:p-10 font-sans border border-slate-200 text-[13px] leading-relaxed select-text"
            style={{ minHeight: '297mm' }}
          >
            
            {/* 1. BARRA TÉCNICA DO ORÇAMENTO */}
            <div className="flex flex-wrap items-center justify-between text-[10px] font-bold tracking-wider text-slate-500 uppercase pb-2 border-b border-slate-200 mb-6 gap-2">
              <div className="flex items-center gap-2 text-slate-800 font-mono text-[10px]">
                <span className="w-2 h-2 rounded-[2px] bg-emerald-500 inline-block"></span>
                <span>PRINTFLOW 3D</span>
                <span className="text-slate-300 mx-1">|</span>
                <span className="text-slate-500 font-normal">ORÇAMENTO DE MANUFATURA ADITIVA</span>
              </div>
              <div className="bg-slate-950 text-white font-mono text-[9px] px-2.5 py-0.5 rounded font-bold">
                REF: {orderNumStr}
              </div>
            </div>

            {/* 2. CABEÇALHO / MARCA & QUADRO DO ORÇAMENTO (CARD PRETO #0B0F19) */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
              <div className="space-y-1.5 max-w-md">
                <div className="flex items-center gap-3 flex-wrap">
                  {business.logoUrl ? (
                    <div className="h-12 max-w-[170px] flex items-center">
                      <img 
                        src={business.logoUrl} 
                        alt="Logo" 
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-slate-950 text-emerald-400 font-black flex items-center justify-center text-sm shadow-sm">
                        3D
                      </div>
                      <h1 className="font-black text-xl tracking-tight text-slate-950">
                        {companyName}
                      </h1>
                    </div>
                  )}
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Impressão 3D & Prototipagem
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal pt-1">
                  {business.address || 'Serviços especializados em manufatura aditiva sob demanda'}
                </p>
              </div>

              {/* Caixa Escura de Número e Validade/Situação (#0B0F19) */}
              <div className="bg-slate-950 text-white rounded-xl p-3 sm:text-right min-w-[210px] space-y-1.5 shadow-md">
                <div className="flex items-center justify-between text-[10px] font-mono pb-1 border-b border-slate-800">
                  <span className="text-slate-400">{includePaymentInfo ? 'PEDIDO Nº' : 'ORÇAMENTO Nº'}</span>
                  <strong className="text-emerald-400 text-xs tracking-wider">{orderNumStr}</strong>
                </div>
                <div className="flex justify-between items-center text-[10px] pt-0.5">
                  <span className="text-slate-400">EMISSÃO:</span>
                  <span className="font-bold text-slate-200">{emissionDate}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400">{includePaymentInfo ? 'SITUAÇÃO:' : 'VALIDADE:'}</span>
                  <span className="font-bold text-slate-200">
                    {includePaymentInfo ? (
                      <span className="text-emerald-400">{isPaid ? 'Pago' : 'Aprovado'}</span>
                    ) : (
                      <>15 dias <span className="text-emerald-400">({validityInfo.short})</span></>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. CARDS: CLIENTE / SOLICITANTE & PROPOSTA TÉCNICA (CARD ESCURO) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-6">
              {/* Card Cliente */}
              <div className="sm:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                      Cliente / Solicitante
                    </h4>
                  </div>
                  <span className="text-[9px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    {includePaymentInfo ? 'Pedido em Produção' : 'Proposta Comercial'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] pt-1">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">
                      Nome do Cliente:
                    </span>
                    <strong className="text-slate-900 block text-sm truncate">
                      {customer?.name || 'Cliente Balcão'}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase">
                      Telefone / WhatsApp:
                    </span>
                    <strong className="text-emerald-700 font-mono block text-sm truncate">
                      {customer?.phone || 'Não informado'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Card Proposta Técnica (Dark Card #0B0F19) */}
              <div className="sm:col-span-5 bg-slate-950 text-white rounded-xl p-4 flex flex-col justify-between space-y-2 shadow-md">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">
                      {includePaymentInfo ? 'Ordem de Produção' : 'Proposta Técnica'}
                    </span>
                    <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                      {order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'ITEM' : 'ITENS'}
                    </span>
                  </div>
                  <h2 className="text-base font-black text-white tracking-tight">
                    {includePaymentInfo ? 'PEDIDO & PRODUÇÃO' : 'ORÇAMENTO COMERCIAL'}
                  </h2>
                  <p className="text-[10px] text-slate-400 leading-snug pt-0.5">
                    {includePaymentInfo
                      ? 'Pedido aprovado para fabricação sob demanda dos itens conforme parâmetros validados.'
                      : 'Itens personalizados sob demanda conforme especificações digitais aprovadas.'}
                  </p>
                </div>
                <div className="border-l-2 border-emerald-500 pl-2 py-0.5 mt-1">
                  <p className="text-[9.5px] italic text-slate-300 leading-tight">
                    {includePaymentInfo 
                      ? 'Produção autorizada com rigor técnico e qualidade.' 
                      : 'Precisão nos detalhes e qualidade em cada camada.'}
                  </p>
                </div>
              </div>
            </div>

            {/* 4. DISCRIMINAÇÃO DOS ITENS E SERVIÇOS COM CABEÇALHO ESCURO */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                    01. Discriminação dos Itens e Serviços
                  </h4>
                  <span className="text-[8.5px] font-bold uppercase px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">
                    {(order.items || []).length} { (order.items || []).length === 1 ? 'item validado' : 'itens validados' }
                  </span>
                </div>
                <span className="text-[9px] font-bold uppercase text-slate-400 font-mono">
                  Moeda: BRL (R$)
                </span>
              </div>

              {/* Tabela com Cabeçalho Preto */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-white font-bold text-[10px] uppercase">
                      <th className="py-2.5 px-3 w-14 text-center">Ref</th>
                      <th className="py-2.5 px-3">Especificação do Produto & Parâmetros de Produção</th>
                      <th className="py-2.5 px-3 w-16 text-center">Qtd</th>
                      <th className="py-2.5 px-3 w-24 text-right">Unitário</th>
                      <th className="py-2.5 px-3 w-28 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {(order.items || []).map((item, idx) => {
                      const part = parts.find(p => p.id === item.partId);
                      const title = item.name || part?.name || `Item 3D #${idx + 1}`;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                          {/* Referência */}
                          <td className="py-4 px-3 text-center font-mono font-bold text-slate-400 text-xs">
                            #{String(idx + 1).padStart(2, '0')}
                          </td>

                          {/* Foto Ampliada (31mm / 100px) e Especificação */}
                          <td className="py-4 px-3">
                            <div className="flex items-center gap-4">
                              {/* Foto */}
                              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-slate-100 border border-slate-200 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
                                {part?.imageUrl ? (
                                  <img 
                                    src={part.imageUrl} 
                                    alt={title} 
                                    className="w-full h-full object-cover" 
                                  />
                                ) : (
                                  <div className="text-center p-2 text-slate-400">
                                    <Layers className="w-8 h-8 mx-auto mb-1 text-slate-300" />
                                    <span className="text-[10px] font-bold">Foto 3D</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 py-1">
                                <strong className="text-slate-950 font-bold text-sm block">
                                  {title}
                                </strong>
                              </div>
                            </div>
                          </td>

                          {/* Quantidade */}
                          <td className="py-4 px-3 text-center font-bold text-slate-800 font-mono text-xs">
                            {String(item.quantity).padStart(2, '0')} <span className="text-[10px] font-normal text-slate-400">un</span>
                          </td>

                          {/* Unitário */}
                          <td className="py-4 px-3 text-right font-mono text-slate-600 text-xs">
                            {formatCurrency(item.unitPrice)}
                          </td>

                          {/* Total */}
                          <td className="py-4 px-3 text-right font-mono font-black text-slate-950 text-sm">
                            {formatCurrency(item.unitPrice * item.quantity)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5. CONDIÇÕES TÉCNICAS (ESQUERDA) & RESUMO FINANCEIRO (DIREITA - CARD ESCURO) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-6">
              
              {/* Condições Técnicas e Fabricação (Fundo Claro) */}
              <div className="sm:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                        Condições do Pedido
                      </h4>
                    </div>
                    <span className="text-[8px] font-mono font-bold text-slate-400">PRINTFLOW</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-xs">
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">Prazo de Produção:</span>
                      <strong className="text-slate-800 font-bold text-[11px]">A combinar</strong>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-xs">
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">
                        {includePaymentInfo ? 'Situação do Pedido:' : 'Condição Comercial:'}
                      </span>
                      <strong className="text-slate-800 font-bold text-[11px] truncate block">
                        {includePaymentInfo ? (isPaid ? 'Pago / Liberado' : 'Aprovado / Em Produção') : 'Sujeita à Aprovação'}
                      </strong>
                    </div>
                    <div className="col-span-2 bg-white border border-slate-200 rounded-lg p-2 shadow-xs">
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">Entrega / Retirada:</span>
                      <strong className="text-slate-800 font-bold text-[11px]">A combinar</strong>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <span className="block text-[8.5px] font-bold uppercase text-slate-700">Nota de Manufatura:</span>
                  <p className="text-[8.5px] text-slate-500 leading-tight">
                    Peças fabricadas sob demanda conforme arquivo digital validado pelo contratante. Microestrias superficiais são características físicas intrínsecas ao processo de manufatura aditiva (FDM/FFF).
                  </p>
                </div>
              </div>

              {/* Resumo Financeiro (Card Escuro #0B0F19 com Destaque Verde) */}
              <div className="sm:col-span-5 bg-slate-950 text-white rounded-xl p-4 flex flex-col justify-between space-y-2 shadow-md">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    Resumo Financeiro
                  </h4>
                  <span className="text-[8.5px] font-mono text-slate-400">
                    {includePaymentInfo ? 'PEDIDO' : 'PROPOSTA'} {orderNumStr}
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal dos Itens:</span>
                    <span className="font-mono font-bold text-white">{formatCurrency(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-400 font-bold">
                      <span className="flex items-center gap-1">
                        Desconto Aplicado:
                        {subtotal > 0 && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950 border border-emerald-500/30 text-emerald-300">
                            -{Math.round((discount / subtotal) * 100)}%
                          </span>
                        )}
                      </span>
                      <span className="font-mono">- {formatCurrency(discount)}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-[8.5px] font-bold uppercase text-slate-400 block">
                        Valor Total:
                      </span>
                      <span className="text-[8.5px] text-emerald-400">
                        {includePaymentInfo 
                          ? (isPaid ? 'Pagamento confirmado em caixa' : 'Aguardando pagamento via Pix')
                          : (discount > 0 ? 'Com desconto aplicado' : 'Orçamento sujeito à aprovação')}
                      </span>
                    </div>
                    <span className="text-2xl font-black font-mono text-white tracking-tight">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5.3 SEÇÃO: DADOS PARA PAGAMENTO PIX (QUANDO ATIVO) OU TERMO INFORMATIVO (QUANDO ORÇAMENTO) */}
            {includePaymentInfo ? (
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 mb-6 shadow-xs">
                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-emerald-200 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                      Dados para Pagamento via Pix (Banco Central do Brasil)
                    </h4>
                    <span className={`text-[8.5px] font-bold uppercase px-2 py-0.5 rounded border ${
                      isPaid 
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                        : 'bg-teal-50 text-teal-800 border-teal-200'
                    }`}>
                      {isPaid ? 'Pagamento Confirmado (Pago)' : 'Aguardando Pagamento Pix'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-800">
                    Total: {formatCurrency(total)}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {pixPreview?.qrCodeDataUrl ? (
                    <div className="w-24 h-24 bg-white p-1 rounded-lg border border-emerald-200 flex-shrink-0 shadow-xs flex items-center justify-center">
                      <img src={pixPreview.qrCodeDataUrl} alt="QR Code Pix" className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-24 h-24 bg-emerald-100/60 rounded-lg border border-emerald-200 flex-shrink-0 flex items-center justify-center text-emerald-700">
                      <QrCode className="w-8 h-8 opacity-70" />
                    </div>
                  )}

                  <div className="flex-1 space-y-1.5 text-[11px]">
                    <div>
                      <span className="text-[9px] font-bold uppercase text-slate-500 block">
                        Chave Pix {business.pixKeyType ? `(${business.pixKeyType.toUpperCase()})` : ''}:
                      </span>
                      <span className="font-mono font-bold text-slate-900 text-xs bg-white px-2.5 py-1 rounded border border-slate-200 inline-block shadow-xs">
                        {pixPreview?.formattedKey || business.pixKey || 'Chave Pix a combinar com a oficina'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-slate-600 text-[10.5px]">
                      {business.pixReceiverName && (
                        <span>Favorecido: <strong>{business.pixReceiverName}</strong></span>
                      )}
                      {business.pixBank && (
                        <span>Banco: <strong>{business.pixBank}</strong></span>
                      )}
                    </div>

                    <p className="text-[9.5px] text-slate-500 pt-0.5">
                      Abra o app do seu banco, escolha <strong>Pix &gt; Ler QR Code</strong> ou <strong>Copia e Cola</strong> com a chave acima. Após o pagamento, envie o comprovante.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 shadow-xs">
                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                      Informações Comerciais & Validade do Orçamento
                    </h4>
                    <span className="text-[8.5px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Proposta Informativa
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-500">
                    Validade: 15 dias úteis ({validityInfo.short})
                  </span>
                </div>

                <div className="space-y-1.5 text-[10.5px] text-slate-600 leading-relaxed">
                  <p>
                    • Este documento constitui um orçamento prévio exclusivamente comercial e informativo, emitido para conhecimento dos custos e especificações técnicas dos serviços de manufatura aditiva 3D solicitados.
                  </p>
                  <p>
                    • A emissão desta proposta <strong>não gera cobrança, débito pendente nem alteração de caixa</strong>. O documento informa apenas os preços estimados do serviço.
                  </p>
                  <p>
                    • Proposta comercial <strong>sujeita à aprovação formal do cliente</strong>. O início da produção e a definição das condições de pagamento ocorrerão após o aceite formal.
                  </p>
                </div>
              </div>
            )}

            {/* 6. RODAPÉ COMERCIAL & VALIDAÇÃO */}
            <div className="pt-3 border-t border-slate-200 text-[10px] text-slate-500 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-slate-900 uppercase tracking-wider">{companyName}</strong>
                <div className="flex flex-wrap items-center gap-3 text-slate-600 text-[10px]">
                  {business.whatsapp && <span>WhatsApp: <strong>{business.whatsapp}</strong></span>}
                  {business.instagram && <span>Instagram: <strong>{business.instagram}</strong></span>}
                  {business.email && <span>{business.email}</span>}
                  {business.cityState && <span>{business.cityState} • Brasil</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between text-[8px] text-slate-400 italic pt-1 border-t border-slate-100 gap-1">
                <span>"Obrigado pela oportunidade de fabricar sua ideia."</span>
                <span>GERADO EM {emissionDate} • HASH DE VALIDAÇÃO ELETRÔNICA: {order.id.slice(0, 8).toUpperCase()}-V2</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
