import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Order, Customer, Part, Filament, Settings, PaymentMethod } from '../types';
import { formatCurrency } from '../constants';
import { downloadQuotePdf, getQuotePdfBlob, getRealisticOrderNumber, resolveOrderPaymentMethod } from '../services/quotePdfGenerator';
import { 
  X, Download, Printer, MessageCircle, FileText, CheckCircle2, 
  Layers, Loader2, Share2, Info, AlertTriangle, QrCode, Settings as SettingsIcon,
  ShieldCheck, CreditCard, Banknote
} from 'lucide-react';
import { 
  isPixPaymentMethod, 
  formatPixKeyForDisplay, 
  getPixKeyTypeLabel, 
  getCompletePixData 
} from '../services/pixService';
import { supabase } from '../services/supabase';
import { useApp } from '../context/AppContext';

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
  const { refreshData } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [whatsAppNotice, setWhatsAppNotice] = useState<string | null>(null);
  const [pixQrCodeUrl, setPixQrCodeUrl] = useState<string | null>(null);
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  // Inicializa a forma de pagamento ativa de forma resiliente
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState<string>(() => resolveOrderPaymentMethod(order));

  // Sincroniza se o pedido mudar
  useEffect(() => {
    setCurrentPaymentMethod(resolveOrderPaymentMethod(order));
  }, [order]);

  const navigate = useNavigate();
  const business = settings.businessInfo || {};
  const companyName = business.companyName || 'PRINT_3Dbr';
  const orderNumStr = getRealisticOrderNumber(order);

  // Pedido ativo com a forma de pagamento atualizada
  const activeOrder: Order = {
    ...order,
    paymentMethod: currentPaymentMethod as any,
    payment_method: currentPaymentMethod as any
  };

  const isPix = isPixPaymentMethod(currentPaymentMethod);
  const hasPixConfigured = Boolean(business.pixKey && business.pixKey.trim() !== '');

  const emissionDate = new Date(order.createdAt).toLocaleDateString('pt-BR');
  
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

  const subtotal = (order.items || []).reduce((acc, i) => acc + (i.unitPrice * i.quantity), 0);
  const discount = order.discount || 0;
  const total = (typeof order.totalValue === 'number' && !isNaN(order.totalValue))
    ? order.totalValue
    : Math.max(0, subtotal - discount);

  // Carrega prévia do QR Code Pix se a modalidade for Pix e houver chave cadastrada
  useEffect(() => {
    let isMounted = true;
    if (isPix && hasPixConfigured) {
      getCompletePixData(business, total, orderNumStr.replace('#', ''))
        .then(res => {
          if (isMounted && res.qrCodeDataUrl) {
            setPixQrCodeUrl(res.qrCodeDataUrl);
          }
        })
        .catch(err => console.warn('Erro ao gerar QR Code para pré-visualização:', err));
    }
    return () => { isMounted = false; };
  }, [isPix, hasPixConfigured, total, orderNumStr, business]);

  const handleGoToSettings = () => {
    onClose();
    navigate('/settings');
  };

  const handleSelectPaymentMethod = async (newMethod: string) => {
    if (newMethod === currentPaymentMethod) return;
    setCurrentPaymentMethod(newMethod);
    setIsUpdatingPayment(true);
    try {
      // Atualiza de forma resiliente tanto payment_method quanto paymentMethod
      const { error } = await supabase
        .from('orders')
        .update({
          payment_method: newMethod,
          paymentMethod: newMethod
        })
        .eq('id', order.id);

      if (error) {
        // Fallback apenas para payment_method caso o schema seja estrito
        await supabase
          .from('orders')
          .update({ payment_method: newMethod })
          .eq('id', order.id);
      }
      if (refreshData) {
        refreshData();
      }
    } catch (err) {
      console.warn('Erro ao atualizar forma de pagamento no banco:', err);
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  const handleDownload = async () => {
    try {
      setIsGenerating(true);
      await downloadQuotePdf({
        order: activeOrder,
        customer,
        parts,
        filaments,
        settings
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
   * Envia o PDF e proposta técnica pelo WhatsApp:
   * 1. Monta a mensagem completa com dados do cliente, itens, total e Pix.
   * 2. Abre a conversa no WhatsApp IMEDIATAMENTE (no clique direto do usuário para evitar bloqueio de pop-up pelo navegador).
   * 3. Faz o download do arquivo PDF oficial para a máquina/celular do usuário anexar na conversa.
   */
  const handleSendWhatsAppPdf = async () => {
    setIsSharingWhatsApp(true);
    setWhatsAppNotice(null);

    const phone = customer?.phone?.replace(/\D/g, '') || business.whatsapp?.replace(/\D/g, '') || '';
    const orderNum = getRealisticOrderNumber(activeOrder);
    const filename = `Orcamento_${orderNum.replace('#', '')}.pdf`;

    const itemsSummary = (activeOrder.items || []).map(i => {
      const part = parts.find(p => p.id === i.partId);
      return `• ${i.quantity}x ${i.name || part?.name || 'Item 3D'} - ${formatCurrency((Number(i.unitPrice) || 0) * (Number(i.quantity) || 1))}`;
    }).join('\n');

    const pixSummary = (isPix && hasPixConfigured)
      ? `\n*DADOS PARA PAGAMENTO VIA PIX:*\n` +
        `• *Chave:* ${formatPixKeyForDisplay(business.pixKey || '', business.pixKeyType || 'cpf')} (${getPixKeyTypeLabel(business.pixKeyType)})\n` +
        `• *Titular:* ${business.pixReceiverName || companyName}\n` +
        (business.pixBank ? `• *Banco:* ${business.pixBank}\n` : '')
      : '';

    const textMessage = 
      `Olá ${customer?.name || 'Cliente'}! Segue a proposta técnica de orçamento da *${companyName}*:\n\n` +
      `*Orçamento:* ${orderNumStr}\n` +
      `*Data de Emissão:* ${emissionDate}\n\n` +
      `*Itens:* \n${itemsSummary}\n\n` +
      (discount > 0 ? `*Desconto em Lote:* -${formatCurrency(discount)}\n` : '') +
      `*VALOR TOTAL:* ${formatCurrency(total)}\n` +
      `*Condição de Pagamento:* ${currentPaymentMethod || 'Pix'}\n` +
      pixSummary +
      `\nO documento oficial em PDF com especificações e QR Code para pagamento está sendo anexado. Qualquer dúvida estamos à disposição!`;

    const encodedText = encodeURIComponent(textMessage);
    const waUrl = phone ? `https://wa.me/55${phone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;

    // 1. Abre a conversa do WhatsApp imediatamente no clique do usuário (evita bloqueio de popup)
    const waWindow = window.open(waUrl, '_blank');
    if (!waWindow || waWindow.closed || typeof waWindow.closed === 'undefined') {
      const a = document.createElement('a');
      a.href = waUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }

    try {
      // 2. Gera o blob binário do PDF e inicia o download para anexar no WhatsApp
      const pdfBlob = await getQuotePdfBlob({
        order: activeOrder,
        customer,
        parts,
        filaments,
        settings
      });

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      setWhatsAppNotice(
        `Conversa do WhatsApp aberta e PDF (${filename}) baixado com sucesso! Basta arrastar o arquivo PDF baixado para a conversa ou clicar no ícone de anexo (📎) para enviar.`
      );
    } catch (err: any) {
      console.warn('Aviso no fluxo do WhatsApp ao gerar PDF:', err);
      try {
        await downloadQuotePdf({ order: activeOrder, customer, parts, filaments, settings });
      } catch (fallbackErr) {
        console.warn('Fallback de download falhou:', fallbackErr);
      }
      setWhatsAppNotice(
        `Conversa do WhatsApp aberta com o orçamento! Se o arquivo não baixou automaticamente, clique no botão "Baixar PDF" acima.`
      );
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
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base text-zinc-100 uppercase tracking-tight">
                  Proposta Técnica & Orçamento Comercial
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
              title="Enviar PDF no WhatsApp (anexa o arquivo direto no celular ou baixa e abre a conversa no PC)"
            >
              {isSharingWhatsApp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Preparando PDF...</span>
                </>
              ) : (
                <>
                  <MessageCircle className="w-4 h-4 text-emerald-400" />
                  <span>Enviar PDF no WhatsApp</span>
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

        {/* Barra de Seleção / Confirmação da Forma de Pagamento no PDF */}
        <div className="px-4 py-2.5 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-zinc-400">Forma de Pagamento no PDF:</span>
            <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => handleSelectPaymentMethod(PaymentMethod.PIX)}
                className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                  isPixPaymentMethod(currentPaymentMethod)
                    ? 'bg-emerald-500 text-zinc-950 font-black shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
                title="Incluir dados Pix e QR Code no PDF"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Pix</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPaymentMethod(PaymentMethod.CARD)}
                className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                  (currentPaymentMethod === PaymentMethod.CARD || currentPaymentMethod?.toLowerCase().includes('cart'))
                    ? 'bg-blue-500 text-white font-black shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
                title="Definir Cartão no PDF (oculta seção Pix)"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Cartão</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPaymentMethod(PaymentMethod.CASH)}
                className={`px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                  (currentPaymentMethod === PaymentMethod.CASH || currentPaymentMethod?.toLowerCase().includes('dinh'))
                    ? 'bg-emerald-600 text-white font-black shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
                title="Definir Dinheiro no PDF (oculta seção Pix)"
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>Dinheiro</span>
              </button>
            </div>
            {isUpdatingPayment && (
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                <span>Atualizando no pedido...</span>
              </span>
            )}
          </div>

          <span className="text-[11px] text-zinc-400 hidden sm:inline">
            {isPixPaymentMethod(currentPaymentMethod)
              ? '✅ Dados Pix e QR Code ativos no documento'
              : 'ℹ️ Seção Pix ocultada para esta modalidade'}
          </span>
        </div>

        {/* Aviso de Dados Pix Ausentes quando o pedido é Pix */}
        {isPix && !hasPixConfigured && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 p-3.5 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <strong className="block font-bold text-amber-300">Dados Pix não cadastrados:</strong>
                <p className="leading-snug text-[11px] text-zinc-300">
                  A forma de pagamento deste pedido é <strong>Pix</strong>, mas a chave Pix da Print_3Dbr ainda não foi cadastrada nas Configurações.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGoToSettings}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all self-start sm:self-auto flex-shrink-0 cursor-pointer shadow-md"
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Cadastrar Chave Pix Agora</span>
            </button>
          </div>
        )}

        {/* Banner Informativo quando o WhatsApp e download são acionados */}
        {whatsAppNotice && (
          <div className="bg-emerald-950/90 border-b border-emerald-500/30 p-3.5 px-6 flex items-center justify-between gap-3 text-xs text-emerald-200 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="leading-snug">
                {whatsAppNotice}
              </p>
            </div>
            <button
              onClick={() => setWhatsAppNotice(null)}
              className="p-1 rounded-lg hover:bg-emerald-900/60 text-emerald-400 hover:text-emerald-100 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
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

              {/* Caixa Escura de Número e Validade (#0B0F19) */}
              <div className="bg-slate-950 text-white rounded-xl p-3 sm:text-right min-w-[210px] space-y-1.5 shadow-md">
                <div className="flex items-center justify-between text-[10px] font-mono pb-1 border-b border-slate-800">
                  <span className="text-slate-400">ORÇAMENTO Nº</span>
                  <strong className="text-emerald-400 text-xs tracking-wider">{orderNumStr}</strong>
                </div>
                <div className="flex justify-between items-center text-[10px] pt-0.5">
                  <span className="text-slate-400">EMISSÃO:</span>
                  <span className="font-bold text-slate-200">{emissionDate}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400">VALIDADE:</span>
                  <span className="font-bold text-slate-200">
                    15 dias <span className="text-emerald-400">({validityInfo.short})</span>
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
                    Proposta Comercial
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
                      Proposta Técnica
                    </span>
                    <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                      {order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'ITEM' : 'ITENS'}
                    </span>
                  </div>
                  <h2 className="text-base font-black text-white tracking-tight">
                    ORÇAMENTO COMERCIAL
                  </h2>
                  <p className="text-[10px] text-slate-400 leading-snug pt-0.5">
                    Itens personalizados sob demanda conforme especificações digitais aprovadas.
                  </p>
                </div>
                <div className="border-l-2 border-emerald-500 pl-2 py-0.5 mt-1">
                  <p className="text-[9.5px] italic text-slate-300 leading-tight">
                    Precisão nos detalhes e qualidade em cada camada.
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
                      <span className="block text-[8px] font-bold text-slate-400 uppercase">Forma de Pagamento:</span>
                      <strong className="text-slate-800 font-bold text-[11px] truncate block">{currentPaymentMethod || 'A combinar'}</strong>
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
                    PROPOSTA {orderNumStr}
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
                        {discount > 0 ? 'Com desconto aplicado' : 'Valor final do pedido'}
                      </span>
                    </div>
                    <span className="text-2xl font-black font-mono text-white tracking-tight">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5.3 SEÇÃO: DADOS PARA PAGAMENTO VIA PIX (EXIBIDA APENAS SE FORMA DE PAGAMENTO FOR PIX) */}
            {isPix && (
              <div className="bg-slate-50 border-2 border-emerald-500/70 rounded-xl p-4 mb-6 shadow-xs">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                      Dados para Pagamento via Pix
                    </h4>
                    <span className="text-[8.5px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Banco Central do Brasil
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-700">
                    Liquidação Imediata
                  </span>
                </div>

                {hasPixConfigured ? (
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="space-y-2.5 flex-1 text-[11px] w-full">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                          <span className="block text-[8px] font-bold text-slate-400 uppercase">Valor do Pedido:</span>
                          <strong className="text-emerald-700 font-mono font-black text-sm block">
                            {formatCurrency(total)}
                          </strong>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                          <span className="block text-[8px] font-bold text-slate-400 uppercase">Tipo de Chave:</span>
                          <strong className="text-slate-800 font-bold text-xs block">
                            {getPixKeyTypeLabel(business.pixKeyType)}
                          </strong>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-2.5 sm:col-span-1">
                          <span className="block text-[8px] font-bold text-slate-400 uppercase">Chave Pix Completa:</span>
                          <strong className="text-slate-950 font-mono font-bold text-xs block break-all">
                            {formatPixKeyForDisplay(business.pixKey || '', business.pixKeyType || 'cpf')}
                          </strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                        <div className="bg-white border border-slate-200 rounded-lg p-2.5 sm:col-span-2">
                          <span className="block text-[8px] font-bold text-slate-400 uppercase">Nome do Titular:</span>
                          <strong className="text-slate-900 font-bold text-xs block truncate">
                            {(business.pixReceiverName || companyName).toUpperCase()}
                          </strong>
                          {business.pixReceiverDoc && (
                            <span className="text-[9px] text-slate-500 block pt-0.5">Doc: {business.pixReceiverDoc}</span>
                          )}
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                          <span className="block text-[8px] font-bold text-slate-400 uppercase">Instituição Financeira:</span>
                          <strong className="text-slate-800 font-bold text-xs block truncate">
                            {business.pixBank || 'Não informada'}
                          </strong>
                        </div>
                      </div>

                      <p className="text-[9.5px] italic text-slate-500 pt-1 leading-snug">
                        ℹ️ Abra o aplicativo do seu banco, escolha <strong>Pix &gt; Ler QR Code</strong> ou use a chave Pix acima para efetuar o pagamento.
                      </p>
                    </div>

                    {/* QR Code Container */}
                    <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col items-center justify-center shadow-xs flex-shrink-0 self-center sm:self-start">
                      {pixQrCodeUrl ? (
                        <img 
                          src={pixQrCodeUrl} 
                          alt="QR Code Pix" 
                          className="w-24 h-24 object-contain"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                          <QrCode className="w-10 h-10 animate-pulse text-emerald-600" />
                        </div>
                      )}
                      <span className="text-[8px] font-mono font-bold text-slate-500 uppercase mt-1">
                        QR Code BACEN
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <strong className="block text-amber-900 font-bold">Chave Pix pendente de cadastro</strong>
                      <p className="text-[11px] text-amber-700">
                        Os dados Pix da Print_3Dbr não foram encontrados. Cadastre a chave nas Configurações para vinculá-la automaticamente ao pedido.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleGoToSettings}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] flex-shrink-0 cursor-pointer self-start sm:self-auto"
                    >
                      Configurar Agora
                    </button>
                  </div>
                )}
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
