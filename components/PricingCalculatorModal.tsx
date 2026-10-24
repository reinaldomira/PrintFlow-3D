import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, calculatePartCosts } from '../constants';
import { calculateSalePrice, PricingBreakdown } from '../utils/pricingCalculator';
import { 
  Calculator, X, AlertTriangle, CheckCircle2, TrendingUp, DollarSign, 
  Percent, Package, CreditCard, ShoppingCart, Receipt, ShieldAlert, 
  HelpCircle, Copy, Check, ArrowRight, Sparkles, RefreshCw
} from 'lucide-react';

interface PricingCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItems?: { partId: string; quantity: number }[];
  initialFinancials?: {
    embalagem?: number;
    outrosCustos?: number;
    taxaPagamento?: number;
    comissaoMarketplace?: number;
    imposto?: number;
    margemLucro?: number;
    repassarTaxas?: boolean;
    embalagemPorUnidade?: boolean;
  };
  onApplyToOrder?: (data: {
    productionCost: number;
    financials: {
      embalagem: number;
      outrosCustos: number;
      taxaPagamento: number;
      comissaoMarketplace: number;
      imposto: number;
      margemLucro: number;
      repassarTaxas?: boolean;
      embalagemPorUnidade?: boolean;
    };
    suggestedUnitPrice: number;
    totalSuggestedPrice: number;
    suggestedPrice: number;
    breakdown: PricingBreakdown;
    selectedParts?: { partId: string; quantity: number }[];
  }) => void;
}

export const PricingCalculatorModal: React.FC<PricingCalculatorModalProps> = ({
  isOpen,
  onClose,
  initialItems,
  initialFinancials,
  onApplyToOrder
}) => {
  const { parts, filaments, printers, settings, supplies } = useApp();

  // Modo de cálculo de custo base: Catálogo ou Manual
  const [costMode, setCostMode] = useState<'manual' | 'catalog'>('manual');
  
  // Custo manual direto e quantidade manual
  const [manualCost, setManualCost] = useState<number>(35.00);
  const [manualQuantity, setManualQuantity] = useState<number>(1);

  // Seleção de peças do catálogo
  const [selectedParts, setSelectedParts] = useState<{ partId: string; quantity: number }[]>([]);

  // Configurações financeiras
  const [embalagem, setEmbalagem] = useState<number>(settings.defaultPackagingCost ?? 2.50);
  const [embalagemPorUnidade, setEmbalagemPorUnidade] = useState<boolean>(true);
  const [outrosCustos, setOutrosCustos] = useState<number>(settings.defaultOtherCosts ?? 0.00);
  const [taxaPagamento, setTaxaPagamento] = useState<number>(settings.defaultPaymentFeePercent ?? 3.99);
  const [comissaoMarketplace, setComissaoMarketplace] = useState<number>(settings.defaultMarketplaceFeePercent ?? 0.00);
  const [imposto, setImposto] = useState<number>(settings.defaultTaxPercent ?? 6.00);
  const [margemLucro, setMargemLucro] = useState<number>(settings.defaultProfitMargin ?? 100);
  const [arredondamento, setArredondamento] = useState<boolean>(false);
  const [repassarTaxas, setRepassarTaxas] = useState<boolean>(false);

  // Sincroniza estado quando o modal abre com itens pré-existentes do pedido
  React.useEffect(() => {
    if (isOpen) {
      if (initialItems && initialItems.length > 0) {
        setSelectedParts(initialItems.map(i => ({ partId: i.partId, quantity: Math.max(1, i.quantity) })));
        setCostMode('catalog');
      }
      if (initialFinancials) {
        if (initialFinancials.embalagem !== undefined) setEmbalagem(initialFinancials.embalagem);
        if (initialFinancials.embalagemPorUnidade !== undefined) setEmbalagemPorUnidade(initialFinancials.embalagemPorUnidade);
        if (initialFinancials.outrosCustos !== undefined) setOutrosCustos(initialFinancials.outrosCustos);
        if (initialFinancials.taxaPagamento !== undefined) setTaxaPagamento(initialFinancials.taxaPagamento);
        if (initialFinancials.comissaoMarketplace !== undefined) setComissaoMarketplace(initialFinancials.comissaoMarketplace);
        if (initialFinancials.imposto !== undefined) setImposto(initialFinancials.imposto);
        if (initialFinancials.margemLucro !== undefined) setMargemLucro(initialFinancials.margemLucro);
        if (initialFinancials.repassarTaxas !== undefined) setRepassarTaxas(initialFinancials.repassarTaxas);
      }
    }
  }, [isOpen, initialItems, initialFinancials]);

  // Desconto comercial simulado
  const [descontoTipo, setDescontoTipo] = useState<'reais' | 'percentual'>('reais');
  const [descontoValor, setDescontoValor] = useState<number>(0);

  const [copied, setCopied] = useState<boolean>(false);

  // Quantidade total de peças calculadas
  const effectiveQuantity = useMemo(() => {
    if (costMode === 'catalog') {
      const sum = selectedParts.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0);
      return Math.max(1, sum);
    }
    return Math.max(1, Math.round(Number(manualQuantity) || 1));
  }, [costMode, selectedParts, manualQuantity]);

  // Custo de fabricação e preço com lucro calculado caso use peças do catálogo
  const catalogTotals = useMemo(() => {
    let cost = 0;
    let price = 0;
    selectedParts.forEach(item => {
      const part = parts.find(p => p.id === item.partId);
      if (!part) return;
      const costs = calculatePartCosts(part, filaments, printers, settings, supplies);
      cost += costs.totalCost * item.quantity;
      price += costs.suggestedPrice * item.quantity;
    });
    return { cost, price };
  }, [selectedParts, parts, filaments, printers, settings, supplies]);

  const effectiveProductionCost = costMode === 'catalog' ? catalogTotals.cost : (manualCost * effectiveQuantity);
  const effectiveCatalogPrice = costMode === 'catalog' ? catalogTotals.price : 0;

  // Cálculo avançado via pricingCalculator (sem duplicar lucro do catálogo e preservando valor por unidade)
  const breakdown: PricingBreakdown = useMemo(() => {
    return calculateSalePrice({
      custoProducao: effectiveProductionCost,
      precoTabelaOriginal: effectiveCatalogPrice > 0 ? effectiveCatalogPrice : undefined,
      quantidade: effectiveQuantity,
      embalagem,
      embalagemPorUnidade,
      outrosCustos,
      imposto,
      taxaPagamento,
      comissaoMarketplace,
      margemLucro,
      desconto: descontoTipo === 'reais' ? descontoValor : undefined,
      descontoPercentual: descontoTipo === 'percentual' ? descontoValor : undefined,
      arredondamentoComercial: arredondamento,
      repassarTaxas
    });
  }, [
    effectiveProductionCost,
    effectiveCatalogPrice,
    effectiveQuantity,
    embalagem,
    embalagemPorUnidade,
    outrosCustos,
    imposto,
    taxaPagamento,
    comissaoMarketplace,
    margemLucro,
    descontoTipo,
    descontoValor,
    arredondamento,
    repassarTaxas
  ]);

  // Preço mínimo de venda (Break-even: Lucro líquido = 0)
  const breakEvenPrice = useMemo(() => {
    const totalTaxas = (imposto + taxaPagamento + comissaoMarketplace) / 100;
    if (totalTaxas >= 1) return 0;
    const custoEmbalagemTotal = embalagemPorUnidade ? (embalagem * effectiveQuantity) : embalagem;
    const custoBase = effectiveProductionCost + custoEmbalagemTotal + outrosCustos;
    return Number((custoBase / (1 - totalTaxas)).toFixed(2));
  }, [effectiveProductionCost, effectiveQuantity, embalagem, embalagemPorUnidade, outrosCustos, imposto, taxaPagamento, comissaoMarketplace]);

  const copyCommercialSummary = () => {
    const text = `*SIMULAÇÃO DE PRECIFICAÇÃO PRINTFLOW 3D*\n` +
      `----------------------------------------\n` +
      `• Custo Produção 3D: ${formatCurrency(breakdown.custoProducao)}\n` +
      `• Embalagem: ${formatCurrency(breakdown.embalagem)}\n` +
      `• Custo Base Total: ${formatCurrency(breakdown.custoBase)}\n` +
      `• Impostos (${breakdown.impostoPercentual}%): ${formatCurrency(breakdown.impostoValor)}\n` +
      `• Taxa de Pagamento (${breakdown.taxaPagamentoPercentual}%): ${formatCurrency(breakdown.taxaPagamentoValor)}\n` +
      (breakdown.marketplacePercentual > 0 ? `• Comissão Mktplace (${breakdown.marketplacePercentual}%): ${formatCurrency(breakdown.marketplaceValor)}\n` : '') +
      `• Preço Sugerido: ${formatCurrency(breakdown.precoBaseVenda)}\n` +
      (breakdown.descontoValor > 0 ? `• Desconto: - ${formatCurrency(breakdown.descontoValor)} (${breakdown.descontoPercentual}%)\n` : '') +
      `*• Preço Final de Venda:* ${formatCurrency(breakdown.totalFinal)}\n` +
      `*• Lucro Líquido Real:* ${formatCurrency(breakdown.lucroLiquido)}\n` +
      `*• Margem Efetiva sobre Venda:* ${breakdown.margemEfetiva}%\n` +
      `----------------------------------------\n` +
      (breakdown.alertaPrejuizo ? `⚠️ ATENÇÃO: Esta venda gera prejuízo de ${formatCurrency(Math.abs(breakdown.lucroLiquido))}!` : `✅ Venda lucrativa e saudável.`);

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto custom-scrollbar shadow-2xl flex flex-col text-zinc-100">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                Calculadora Financeira Avançada
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono">
                  pricingCalculator
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Custos de embalagem, taxas de meio de pagamento, comissão de marketplace, impostos e lucro real
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-9 h-9 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-6">

          {/* Banner de Alerta Crítico de Prejuízo */}
          {breakdown.alertaPrejuizo && (
            <div className="p-4 sm:p-5 rounded-2xl bg-red-500/15 border-2 border-red-500/60 text-red-200 animate-pulse flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-red-500/10">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-7 h-7 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-black text-sm uppercase tracking-wide text-red-400">
                    Alerta de Prejuízo Operacional Detectado!
                  </h4>
                  <p className="text-xs text-red-200/90 mt-1 leading-relaxed">
                    Você terá um prejuízo real de <strong className="text-white underline font-black">{formatCurrency(Math.abs(breakdown.lucroLiquido))}</strong> ({breakdown.margemEfetiva}%) nesta venda. O valor cobrado não cobre o custo de fabricação, a embalagem e as taxas somadas.
                  </p>
                </div>
              </div>
              <div className="bg-red-950/80 px-4 py-2 rounded-xl border border-red-500/40 text-center flex-shrink-0 w-full sm:w-auto">
                <span className="block text-[10px] uppercase font-bold text-red-300">Preço Mínimo (Zero a Zero)</span>
                <strong className="text-base font-black text-white">{formatCurrency(breakEvenPrice)}</strong>
              </div>
            </div>
          )}

          {/* Banner de Alerta de Margem Baixa (< 15%) */}
          {breakdown.alertaMargemBaixa && !breakdown.alertaPrejuizo && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-center gap-3 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <strong className="font-bold text-amber-300">Atenção para Margem Reduzida ({breakdown.margemEfetiva}%): </strong>
                O lucro líquido é de {formatCurrency(breakdown.lucroLiquido)}. Qualquer falha de impressão ou suporte adicional consumirá toda a margem da encomenda.
              </div>
            </div>
          )}

          {/* Grid Principal: Configurações na esquerda, Dashboard de Resultados na direita */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Coluna 1: Entradas Financeiras (7 colunas no desktop) */}
            <div className="lg:col-span-7 space-y-5">
              
              {/* 1. Origem do Custo de Fabricação 3D */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center">1</span>
                    Custo de Fabricação 3D
                  </label>
                  <div className="flex bg-zinc-900 p-0.5 rounded-xl border border-zinc-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setCostMode('manual')}
                      className={`px-3 py-1 rounded-lg font-bold transition ${
                        costMode === 'manual' ? 'bg-emerald-500 text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Custo Direto (R$)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCostMode('catalog')}
                      className={`px-3 py-1 rounded-lg font-bold transition ${
                        costMode === 'catalog' ? 'bg-emerald-500 text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Peças do Catálogo
                    </button>
                  </div>
                </div>

                {costMode === 'manual' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                          Custo de Fabricação Unitário (R$):
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">R$</span>
                          <input 
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-500"
                            value={manualCost || ''}
                            onChange={e => setManualCost(Math.max(0, Number(e.target.value) || 0))}
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                          Quantidade de Peças:
                        </label>
                        <div className="flex items-center bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setManualQuantity(Math.max(1, manualQuantity - 1))}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={manualQuantity}
                            onChange={e => setManualQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className="w-full text-center bg-transparent text-sm font-black text-white outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setManualQuantity(manualQuantity + 1)}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 text-zinc-400">
                      <span>Custo de produção total ({effectiveQuantity} un):</span>
                      <strong className="text-emerald-400 font-mono text-sm">{formatCurrency(effectiveProductionCost)}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {parts.length === 0 ? (
                      <p className="text-xs text-zinc-500">Nenhuma peça cadastrada no catálogo.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                        {parts.map(part => {
                          const cost = calculatePartCosts(part, filaments, printers, settings, supplies);
                          const sel = selectedParts.find(p => p.partId === part.id);
                          const qty = sel?.quantity || 0;
                          return (
                            <div 
                              key={part.id} 
                              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition ${
                                qty > 0 ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-zinc-900/60 border-zinc-800'
                              }`}
                            >
                              <div className="truncate max-w-[220px]">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="font-bold text-white truncate">{part.name}</span>
                                  {part.unitsPerPrint && part.unitsPerPrint > 1 && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-emerald-400 font-bold shrink-0">
                                      {part.unitsPerPrint} un/mesa
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono mt-0.5">
                                  <span>Custo: {formatCurrency(cost.totalCost)}</span>
                                  <span>•</span>
                                  <span className="text-emerald-400">Catálogo: {formatCurrency(cost.suggestedPrice)}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (qty <= 1) {
                                      setSelectedParts(prev => prev.filter(p => p.partId !== part.id));
                                    } else {
                                      setSelectedParts(prev => prev.map(p => p.partId === part.id ? { ...p, quantity: qty - 1 } : p));
                                    }
                                  }}
                                  className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700"
                                >
                                  -
                                </button>
                                <span className="w-7 text-center font-bold text-emerald-400">{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (qty === 0) {
                                      setSelectedParts(prev => [...prev, { partId: part.id, quantity: 1 }]);
                                    } else {
                                      setSelectedParts(prev => prev.map(p => p.partId === part.id ? { ...p, quantity: qty + 1 } : p));
                                    }
                                  }}
                                  className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold hover:bg-zinc-700"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex justify-between text-xs pt-1.5 border-t border-zinc-800 text-zinc-400">
                      <span>Total selecionado: <strong className="text-white">{effectiveQuantity} {effectiveQuantity === 1 ? 'peça' : 'peças'}</strong></span>
                      <span>Custo de produção: <strong className="text-emerald-400 font-mono">{formatCurrency(catalogTotals.cost)}</strong></span>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Custos de Embalagem e Insumos */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center">2</span>
                    Custos de Embalagem & Insumos Operacionais
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <label className="text-zinc-400 cursor-pointer flex items-center gap-1.5">
                      <input 
                        type="checkbox"
                        checked={embalagemPorUnidade}
                        onChange={e => setEmbalagemPorUnidade(e.target.checked)}
                        className="rounded accent-emerald-500"
                      />
                      <span>Por unidade</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 block mb-1 flex items-center justify-between">
                      <span>Embalagem {embalagemPorUnidade ? '(R$ / unidade)' : '(R$ / encomenda)'}</span>
                      <span className="text-[10px] text-zinc-500">Caixa, plástico bolha</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">R$</span>
                      <input 
                        type="number"
                        step="0.10"
                        min="0"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-8 pr-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-500"
                        value={embalagem}
                        onChange={e => setEmbalagem(Math.max(0, Number(e.target.value) || 0))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 block mb-1 flex items-center justify-between">
                      <span>Outros Custos (R$)</span>
                      <span className="text-[10px] text-zinc-500">Adesivo, brinde, fita</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">R$</span>
                      <input 
                        type="number"
                        step="0.10"
                        min="0"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-8 pr-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-500"
                        value={outrosCustos}
                        onChange={e => setOutrosCustos(Math.max(0, Number(e.target.value) || 0))}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 text-zinc-400">
                  <span>Custo Base Unitário: <strong className="text-zinc-200 font-mono">{formatCurrency(breakdown.custoBaseUnitario)} / un</strong></span>
                  <span>Custo Base Total: <strong className="text-white font-mono">{formatCurrency(breakdown.custoBase)}</strong></span>
                </div>
              </div>

              {/* 3. Taxas de Meio de Pagamento, Marketplace e Impostos */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
                <label className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center">3</span>
                  Taxas de Venda & Impostos (%)
                </label>

                {/* Taxas de Pagamento */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-300">Taxa de Meio de Pagamento:</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">{taxaPagamento}%</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: 'Pix 0%', val: 0 },
                      { label: 'Cartão 1x 3.99%', val: 3.99 },
                      { label: 'Cartão 3x 5.5%', val: 5.50 },
                      { label: 'Boleto 2%', val: 2.00 }
                    ].map(btn => (
                      <button
                        type="button"
                        key={btn.label}
                        onClick={() => setTaxaPagamento(btn.val)}
                        className={`py-1 px-2 rounded-lg text-[10px] font-bold border transition ${
                          taxaPagamento === btn.val 
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="15" 
                    step="0.1" 
                    value={taxaPagamento} 
                    onChange={e => setTaxaPagamento(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                {/* Comissão de Marketplace */}
                <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-300">Comissão de Marketplace:</span>
                    <span className="text-xs font-mono font-bold text-cyan-400">{comissaoMarketplace}%</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: 'Direto 0%', val: 0 },
                      { label: 'Shopee 14%', val: 14.00 },
                      { label: 'M. Livre 18%', val: 18.00 },
                      { label: 'Elo7 12%', val: 12.00 }
                    ].map(btn => (
                      <button
                        type="button"
                        key={btn.label}
                        onClick={() => setComissaoMarketplace(btn.val)}
                        className={`py-1 px-2 rounded-lg text-[10px] font-bold border transition ${
                          comissaoMarketplace === btn.val 
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="25" 
                    step="0.5" 
                    value={comissaoMarketplace} 
                    onChange={e => setComissaoMarketplace(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>

                {/* Impostos */}
                <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-300">Impostos / Simples / MEI:</span>
                    <span className="text-xs font-mono font-bold text-amber-400">{imposto}%</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: 'Isento 0%', val: 0 },
                      { label: 'MEI 0%', val: 0 },
                      { label: 'Simples 6%', val: 6.00 },
                      { label: 'Comércio 4%', val: 4.00 }
                    ].map(btn => (
                      <button
                        type="button"
                        key={btn.label}
                        onClick={() => setImposto(btn.val)}
                        className={`py-1 px-2 rounded-lg text-[10px] font-bold border transition ${
                          imposto === btn.val 
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="20" 
                    step="0.5" 
                    value={imposto} 
                    onChange={e => setImposto(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>

              {/* 4. Margem Desejada & Desconto Comercial */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <label className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center">4</span>
                  {costMode === 'catalog' ? 'Auditoria de Lucro & Repasse de Taxas' : 'Margem de Lucro Desejada & Desconto'}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {costMode === 'catalog' ? (
                    <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5">
                      <span className="text-[11px] font-bold text-zinc-300 block">
                        Preço Original de Catálogo:
                      </span>
                      <strong className="text-emerald-400 font-mono text-base block">
                        {formatCurrency(effectiveCatalogPrice)}
                      </strong>
                      <p className="text-[10px] text-zinc-400 leading-tight">
                        Este preço já contém o lucro definido nas peças.
                      </p>
                      <div className="pt-1.5 border-t border-zinc-800 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="repassarTaxasCheckModal"
                          checked={repassarTaxas}
                          onChange={e => setRepassarTaxas(e.target.checked)}
                          className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
                        />
                        <label htmlFor="repassarTaxasCheckModal" className="text-[11px] text-cyan-300 font-bold cursor-pointer">
                          Repassar taxas no anúncio (Preço: {formatCurrency(breakdown.precoSugeridoMarketplace)})
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                        Markup sobre o Custo Base (%):
                      </label>
                      <div className="relative">
                        <input 
                          type="number"
                          step="5"
                          min="0"
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-500"
                          value={margemLucro}
                          onChange={e => setMargemLucro(Math.max(0, Number(e.target.value) || 0))}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">%</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-zinc-400">Simular Desconto:</label>
                      <div className="flex text-[10px] bg-zinc-900 rounded-md border border-zinc-800 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setDescontoTipo('reais')}
                          className={`px-1.5 py-0.5 ${descontoTipo === 'reais' ? 'bg-zinc-700 text-white font-bold' : 'text-zinc-500'}`}
                        >
                          R$
                        </button>
                        <button
                          type="button"
                          onClick={() => setDescontoTipo('percentual')}
                          className={`px-1.5 py-0.5 ${descontoTipo === 'percentual' ? 'bg-zinc-700 text-white font-bold' : 'text-zinc-500'}`}
                        >
                          %
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <input 
                        type="number"
                        step="0.5"
                        min="0"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-500"
                        value={descontoValor || ''}
                        placeholder="0,00"
                        onChange={e => setDescontoValor(Math.max(0, Number(e.target.value) || 0))}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">
                        {descontoTipo === 'reais' ? 'R$' : '%'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input 
                    type="checkbox" 
                    id="arredondarCheck"
                    checked={arredondamento}
                    onChange={e => setArredondamento(e.target.checked)}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="arredondarCheck" className="text-xs text-zinc-400 cursor-pointer">
                    Arredondamento comercial para terminação <strong className="text-white">,90</strong>
                  </label>
                </div>
              </div>

            </div>

            {/* Coluna 2: Dashboard e Resultados Finais (5 colunas no desktop) */}
            <div className="lg:col-span-5 space-y-4">
              
              <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <span className="text-xs font-black uppercase text-zinc-400 tracking-wider">
                    Demonstrativo Financeiro Real
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Taxas: {breakdown.totalTaxasPercentual}%
                  </span>
                </div>

                {/* Preço de Venda Final */}
                <div className="text-center p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    <span>{effectiveQuantity > 1 ? 'Preço Total Cobrado' : 'Preço Final Cobrado'}</span>
                    {effectiveQuantity > 1 && (
                      <span className="text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        {formatCurrency(breakdown.precoUnitarioFinal)} / un
                      </span>
                    )}
                  </div>
                  <div className="text-3xl font-black text-white font-mono tracking-tight">
                    {formatCurrency(breakdown.totalFinal)}
                  </div>
                  {breakdown.descontoValor > 0 && (
                    <span className="text-[11px] text-zinc-500 line-through block">
                      De {formatCurrency(breakdown.precoBaseVenda)} (-{formatCurrency(breakdown.descontoValor)})
                    </span>
                  )}
                  {effectiveQuantity > 1 && (
                    <span className="text-[11px] text-zinc-400 block pt-0.5">
                      {effectiveQuantity} unidades a {formatCurrency(breakdown.precoUnitarioFinal)} cada
                    </span>
                  )}
                </div>

                {/* Card de Lucro Líquido Real & Margem Efetiva */}
                <div className={`p-4 rounded-2xl border text-center transition-all ${
                  breakdown.alertaPrejuizo 
                    ? 'bg-red-500/20 border-red-500 text-red-300' 
                    : breakdown.alertaMargemBaixa
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                }`}>
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider opacity-80">
                    <span>Lucro Líquido Real em Caixa</span>
                    {effectiveQuantity > 1 && (
                      <span className="font-mono">{formatCurrency(breakdown.lucroLiquidoUnitario)} / un</span>
                    )}
                  </div>
                  <div className="text-2xl sm:text-3xl font-black font-mono my-1">
                    {formatCurrency(breakdown.lucroLiquido)}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs font-bold">
                    <span>Margem Efetiva:</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-black ${
                      breakdown.alertaPrejuizo 
                        ? 'bg-red-500 text-white' 
                        : breakdown.alertaMargemBaixa
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-emerald-500 text-zinc-950'
                    }`}>
                      {breakdown.margemEfetiva}%
                    </span>
                  </div>
                </div>

                {/* Discriminação Detalhada de Custos e Taxas */}
                <div className="space-y-2 text-xs text-zinc-400 bg-zinc-900/60 p-3.5 rounded-2xl border border-zinc-800/80">
                  <div className="flex justify-between py-1 border-b border-zinc-800/50">
                    <span>1. Custo de Produção 3D:</span>
                    <strong className="text-white font-mono">{formatCurrency(breakdown.custoProducao)}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800/50">
                    <span>2. Embalagem & Insumos:</span>
                    <strong className="text-white font-mono">{formatCurrency(breakdown.embalagem + breakdown.outrosCustos)}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800/50">
                    <span>3. Impostos ({breakdown.impostoPercentual}%):</span>
                    <span className="text-amber-400 font-mono">- {formatCurrency(breakdown.impostoValor)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800/50">
                    <span>4. Meio de Pagamento ({breakdown.taxaPagamentoPercentual}%):</span>
                    <span className="text-emerald-400 font-mono">- {formatCurrency(breakdown.taxaPagamentoValor)}</span>
                  </div>
                  {breakdown.marketplacePercentual > 0 && (
                    <div className="flex justify-between py-1 border-b border-zinc-800/50">
                      <span>5. Marketplace ({breakdown.marketplacePercentual}%):</span>
                      <span className="text-cyan-400 font-mono">- {formatCurrency(breakdown.marketplaceValor)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1 pt-2 font-bold text-zinc-200">
                    <span>Total de Taxas Retidas:</span>
                    <span className="text-red-400 font-mono">- {formatCurrency(breakdown.totalTaxasValor)}</span>
                  </div>
                </div>

                {/* Preço Mínimo de Equilíbrio (Break-Even) */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
                  <span className="text-zinc-400">Preço Mínimo (Break-Even):</span>
                  <div className="text-right">
                    <span className="font-mono font-bold text-white">{formatCurrency(breakEvenPrice)}</span>
                    {effectiveQuantity > 1 && (
                      <span className="block text-[10px] text-zinc-500 font-mono">
                        ({formatCurrency(breakEvenPrice / effectiveQuantity)} / un)
                      </span>
                    )}
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="space-y-2 pt-2">
                  {onApplyToOrder && (
                    <button
                      type="button"
                      onClick={() => {
                        onApplyToOrder({
                          productionCost: effectiveProductionCost,
                          financials: {
                            embalagem,
                            outrosCustos,
                            taxaPagamento,
                            comissaoMarketplace,
                            imposto,
                            margemLucro,
                            repassarTaxas,
                            embalagemPorUnidade
                          },
                          suggestedUnitPrice: breakdown.precoUnitarioFinal,
                          totalSuggestedPrice: breakdown.totalFinal,
                          suggestedPrice: breakdown.totalFinal,
                          breakdown,
                          selectedParts: costMode === 'catalog' ? selectedParts : undefined
                        });
                        onClose();
                      }}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black rounded-xl text-sm transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                    >
                      <span>Aplicar este Valor ao Pedido</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={copyCommercialSummary}
                    className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-xl text-xs transition border border-zinc-700 flex items-center justify-center gap-2"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Resumo Copiado para a Área de Transferência!' : 'Copiar Resumo Comercial para WhatsApp'}</span>
                  </button>
                </div>

              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
