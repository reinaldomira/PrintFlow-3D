import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../constants';
import { calculateSalePrice } from '../utils/pricingCalculator';
import { Filament, Printer, Supply } from '../types';
import { 
  Zap, X, Copy, Check, MessageCircle, ShoppingBag, Plus, Trash2, 
  Clock, Scale, Sparkles, DollarSign, CheckCircle2, ChevronRight,
  Send, Layers, Printer as PrinterIcon, Package, Calculator, ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface QuickQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConvertToOrder?: (orderDraft: {
    itemName: string;
    unitPrice: number;
    quantity: number;
    weightGrams: number;
    filamentId?: string;
    filamentName?: string;
    printHours?: number;
    customerName?: string;
    customerPhone?: string;
  }) => void;
}

interface AdditionalSupplyRow {
  id: string;
  supplyId?: string;
  name: string;
  unitCost: number;
  quantity: number;
}

export const QuickQuoteModal: React.FC<QuickQuoteModalProps> = ({ isOpen, onClose, onConvertToOrder }) => {
  const { filaments, printers, supplies, settings, customers } = useApp();
  const navigate = useNavigate();

  // Dados do Orçamento Flash
  const [partName, setPartName] = useState('Peça Personalizada');
  const [quantity, setQuantity] = useState<number>(1);
  const [weightGrams, setWeightGrams] = useState<number | ''>(85);
  const [printHours, setPrintHours] = useState<number | ''>(4);
  const [printMinutes, setPrintMinutes] = useState<number | ''>(30);
  const [selectedFilamentId, setSelectedFilamentId] = useState<string>('');
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [profitMargin, setProfitMargin] = useState<number>(() => settings.defaultProfitMargin ?? 100);
  const [paymentType, setPaymentType] = useState<'pix' | 'card' | 'marketplace'>('pix');
  const [deadlineDays, setDeadlineDays] = useState<string>('1 a 2 dias úteis');
  const [includePackaging, setIncludePackaging] = useState<boolean>(true);

  // Cliente opcional para personalizar mensagem
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Insumos Adicionais (ímãs, parafusos, argolas)
  const [additionalSupplies, setAdditionalSupplies] = useState<AdditionalSupplyRow[]>([]);
  const [showSuppliesSelector, setShowSuppliesSelector] = useState(false);

  // Feedback de cópia
  const [copied, setCopied] = useState(false);

  // Inicializa filamento e impressora padrão
  useEffect(() => {
    if (isOpen) {
      if (!selectedFilamentId && filaments.length > 0) {
        setSelectedFilamentId(filaments[0].id);
      }
      if (!selectedPrinterId && printers.length > 0) {
        setSelectedPrinterId(printers[0].id);
      }
    }
  }, [isOpen, filaments, printers]);

  // Total de horas decimais
  const totalPrintHours = useMemo(() => {
    const h = Number(printHours) || 0;
    const m = (Number(printMinutes) || 0) / 60;
    return Math.max(0.1, Number((h + m).toFixed(2)));
  }, [printHours, printMinutes]);

  // Carretel selecionado
  const activeFilament = useMemo(() => {
    return filaments.find(f => f.id === selectedFilamentId) || filaments[0] || null;
  }, [filaments, selectedFilamentId]);

  // Impressora selecionada
  const activePrinter = useMemo(() => {
    return printers.find(p => p.id === selectedPrinterId) || printers[0] || null;
  }, [printers, selectedPrinterId]);

  // Cálculos de custos de fabricação
  const quoteCalculation = useMemo(() => {
    const qty = Math.max(1, Math.round(Number(quantity) || 1));
    const grams = Number(weightGrams) || 0;
    const totalGrams = grams * qty;

    // 1. Custo de Filamento
    const pricePerKg = activeFilament 
      ? ((activeFilament.pricePaid || 100) / (activeFilament.weight || 1000)) * 1000
      : (settings.defaultFilamentCost || 120);
    const costPerGram = pricePerKg / 1000;
    const filamentCost = costPerGram * totalGrams;

    // 2. Custo de Energia
    const powerWatts = activePrinter?.power ?? 350;
    const energyKWhPrice = settings.defaultEnergyCost || 0.85;
    const energyKWh = (powerWatts / 1000) * totalPrintHours * qty;
    const energyCost = energyKWh * energyKWhPrice;

    // 3. Custo de Desgaste / Manutenção da Máquina
    const maintenanceRate = settings.hourlyMaintenanceCost || 1.50;
    const maintenanceCost = totalPrintHours * qty * maintenanceRate;

    // 4. Mão de Obra
    const laborRate = settings.hourlyLaborRate || 25;
    // Estimativa de 15 minutos de preparação humana por modelo/impressão
    const laborCost = 0.25 * laborRate;

    // 5. Taxa de Perda / Risco 3D (padrão 8%)
    const printSubtotal = filamentCost + energyCost + maintenanceCost;
    const wasteCost = printSubtotal * 0.08;

    // 6. Custo de Insumos Adicionais
    const suppliesCost = additionalSupplies.reduce((acc, row) => {
      return acc + ((Number(row.unitCost) || 0) * (Number(row.quantity) || 0));
    }, 0);

    // Custo Total de Fabricação
    const manufacturingCostTotal = filamentCost + energyCost + maintenanceCost + laborCost + wasteCost + suppliesCost;
    const manufacturingCostUnit = manufacturingCostTotal / qty;

    // Taxas financeiras
    const feePercent = paymentType === 'card' 
      ? (settings.defaultPaymentFeePercent ?? 3.99)
      : paymentType === 'marketplace'
      ? (settings.defaultMarketplaceFeePercent ?? 14.0)
      : 0;

    const packagingCost = includePackaging ? ((settings.defaultPackagingCost ?? 2.50) * qty) : 0;

    // Formação de Preço de Venda
    const pricing = calculateSalePrice({
      custoProducao: manufacturingCostTotal,
      quantidade: qty,
      embalagem: packagingCost,
      embalagemPorUnidade: false,
      outrosCustos: 0,
      imposto: paymentType === 'marketplace' ? (settings.defaultTaxPercent ?? 6) : 0,
      taxaPagamento: feePercent,
      margemLucro: profitMargin,
      arredondamentoComercial: true,
      repassarTaxas: true
    });

    return {
      qty,
      gramsPerUnit: grams,
      totalGrams,
      totalPrintHours,
      filamentCost,
      energyCost,
      maintenanceCost,
      laborCost,
      wasteCost,
      suppliesCost,
      packagingCost,
      manufacturingCostTotal,
      manufacturingCostUnit,
      pricePerKg,
      finalSalePrice: pricing.totalFinal,
      unitSalePrice: pricing.precoUnitarioFinal,
      netProfit: pricing.lucroLiquido,
      profitMarginEffective: pricing.margemEfetiva
    };
  }, [
    quantity, weightGrams, totalPrintHours, activeFilament, activePrinter,
    settings, additionalSupplies, paymentType, includePackaging, profitMargin
  ]);

  // Mensagem gerada para WhatsApp
  const generatedWhatsAppText = useMemo(() => {
    const biz = settings.businessInfo || {};
    const companyName = biz.companyName || 'Impressão 3D';
    const greeting = customerName.trim() ? `Olá ${customerName.trim()}!` : 'Olá!';
    const materialLabel = activeFilament ? `${activeFilament.material} (${activeFilament.colorName || 'Cor Padrão'})` : 'PLA Premium';
    const pixText = biz.pixKey ? `\n🔑 *Chave Pix:* ${biz.pixKey} (${biz.pixReceiverName || companyName})` : '';

    const lines = [
      `*${companyName.toUpperCase()} - ORÇAMENTO 3D* ⚡`,
      ``,
      `${greeting} Segue a cotação solicitada para seu projeto:`,
      ``,
      `📌 *Item:* ${partName.trim() || 'Peça Personalizada'}`,
      `🔢 *Quantidade:* ${quoteCalculation.qty} ${quoteCalculation.qty === 1 ? 'unidade' : 'unidades'}`,
      `🧵 *Material:* ${materialLabel}`,
      `⚖️ *Peso Estimado:* ~${quoteCalculation.totalGrams}g`,
      `⏱️ *Tempo de Produção:* ~${totalPrintHours}h de máquina`,
      `📦 *Prazo de Produção:* ${deadlineDays}`,
      ``,
      `💰 *VALOR TOTAL:* ${formatCurrency(quoteCalculation.finalSalePrice)}${quoteCalculation.qty > 1 ? ` (${formatCurrency(quoteCalculation.unitSalePrice)} cada)` : ''}`,
      `💳 *Forma de Pagamento:* ${paymentType === 'pix' ? 'Pix à vista (Sem taxas)' : paymentType === 'card' ? 'Cartão de Crédito/Débito' : 'Link de Pagamento / Marketplace'}${paymentType === 'pix' ? pixText : ''}`,
      ``,
      `✅ *Incluso:* Fabricação aditiva de alta precisão, conferência dimensional e embalagem protetora.`,
      ``,
      `Ficou com alguma dúvida ou gostaria de aprovar para iniciarmos a produção agora?`
    ];

    return lines.join('\n');
  }, [
    settings.businessInfo, customerName, partName, quoteCalculation,
    activeFilament, totalPrintHours, deadlineDays, paymentType
  ]);

  const handleCopyWhatsAppText = async () => {
    try {
      await navigator.clipboard.writeText(generatedWhatsAppText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      // Fallback de seleção
      const textarea = document.createElement('textarea');
      textarea.value = generatedWhatsAppText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleOpenWhatsAppDirectly = () => {
    const cleanPhone = customerPhone.replace(/\D/g, '');
    const encoded = encodeURIComponent(generatedWhatsAppText);
    if (cleanPhone && cleanPhone.length >= 10) {
      window.open(`https://wa.me/55${cleanPhone}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  const handleAddSupplyRow = (supply?: Supply) => {
    const newRow: AdditionalSupplyRow = {
      id: `sup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      supplyId: supply?.id,
      name: supply?.name || 'Insumo Avulso (ex: Ímã, Parafuso)',
      unitCost: supply ? Number(supply.unitCost) || 0 : 0.50,
      quantity: 1
    };
    setAdditionalSupplies(prev => [...prev, newRow]);
    setShowSuppliesSelector(false);
  };

  const handleRemoveSupplyRow = (id: string) => {
    setAdditionalSupplies(prev => prev.filter(r => r.id !== id));
  };

  const handleConvertToOrder = () => {
    const draft = {
      itemName: partName.trim() || 'Peça Personalizada',
      unitPrice: quoteCalculation.unitSalePrice,
      quantity: quoteCalculation.qty,
      weightGrams: quoteCalculation.gramsPerUnit,
      filamentId: selectedFilamentId || undefined,
      filamentName: activeFilament ? `${activeFilament.brand} ${activeFilament.material}` : undefined,
      printHours: totalPrintHours,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined
    };

    onClose();

    if (onConvertToOrder) {
      onConvertToOrder(draft);
    } else {
      // Navega para /orders passando rascunho
      navigate('/orders', { state: { flashQuoteDraft: draft, openNew: true } });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-zinc-900 border border-zinc-700/80 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho do Orçador Flash */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-zinc-900 to-cyan-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-md shadow-emerald-500/20">
              <Zap className="w-5 h-5 fill-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Simulador de Orçamento Flash
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-zinc-950 font-mono">
                  WhatsApp 1-Clique
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Responda cotações de clientes em segundos com cálculo técnico de custos e lucro garantido
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-9 h-9 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo: Duas Colunas (Parâmetros à esquerda / Resultado & WhatsApp à direita) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 custom-scrollbar">
          
          {/* ======================================================== */}
          {/* COLUNA ESQUERDA: PARÂMETROS DA PEÇA (7 colunas)          */}
          {/* ======================================================== */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Nome do Item e Cliente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">
                  Nome da Peça / Arquivo STL:
                </label>
                <input 
                  type="text" 
                  value={partName}
                  onChange={e => setPartName(e.target.value)}
                  placeholder="Ex: Suporte de Fone, Lithophane..."
                  className="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">
                  Cliente (opcional p/ personalizar):
                </label>
                <div className="flex gap-1.5">
                  <input 
                    type="text" 
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Primeiro nome..."
                    className="flex-1 bg-zinc-800/90 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                  />
                  {customers.length > 0 && (
                    <select
                      className="w-10 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-400 text-xs text-center cursor-pointer"
                      title="Puxar cliente cadastrado"
                      onChange={e => {
                        const found = customers.find(c => c.id === e.target.value);
                        if (found) {
                          setCustomerName(found.name.split(' ')[0]);
                          if (found.phone) setCustomerPhone(found.phone);
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>▼</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Linha de Gramas, Tempo e Quantidade (Os 3 principais do Fatiador) */}
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-2xl space-y-3">
              <span className="text-[11px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-emerald-400" />
                <span>Dados Obtidos do Fatiador (Bambu / Cura / Prusa)</span>
              </span>

              <div className="grid grid-cols-3 gap-3">
                {/* Peso em Gramas */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                    Peso Unitário (g):
                  </label>
                  <div className="relative">
                    <input 
                      type="number"
                      step="1"
                      min="1"
                      value={weightGrams}
                      onChange={e => setWeightGrams(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                      placeholder="85"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-3 pr-7 py-2.5 text-sm font-bold text-white outline-none focus:border-emerald-500"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-xs">g</span>
                  </div>
                </div>

                {/* Tempo de Impressão */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                    Tempo de Máquina:
                  </label>
                  <div className="flex gap-1">
                    <div className="relative flex-1">
                      <input 
                        type="number"
                        min="0"
                        value={printHours}
                        onChange={e => setPrintHours(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                        placeholder="4"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-2 pr-5 py-2.5 text-sm font-bold text-white outline-none focus:border-emerald-500 text-center"
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px] font-bold">h</span>
                    </div>
                    <div className="relative flex-1">
                      <input 
                        type="number"
                        min="0"
                        max="59"
                        value={printMinutes}
                        onChange={e => setPrintMinutes(e.target.value === '' ? '' : Math.max(0, Math.min(59, Number(e.target.value))))}
                        placeholder="30"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-2 pr-5 py-2.5 text-sm font-bold text-white outline-none focus:border-emerald-500 text-center"
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px] font-bold">m</span>
                    </div>
                  </div>
                </div>

                {/* Quantidade */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                    Quantidade:
                  </label>
                  <input 
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-emerald-500 text-center"
                  />
                </div>
              </div>
            </div>

            {/* Filamento e Máquina */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Filamento / Material:</span>
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {formatCurrency(quoteCalculation.pricePerKg)}/kg
                  </span>
                </label>
                <select
                  value={selectedFilamentId}
                  onChange={e => setSelectedFilamentId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-500"
                >
                  {filaments.length === 0 ? (
                    <option value="">PLA Padrão (R$ 120/kg)</option>
                  ) : (
                    filaments.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.brand} - {f.material} ({f.colorName || 'Cor Padrão'}) • {formatCurrency(f.pricePaid || 100)}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <PrinterIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Impressora:</span>
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {activePrinter?.power || 350}W
                  </span>
                </label>
                <select
                  value={selectedPrinterId}
                  onChange={e => setSelectedPrinterId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-amber-500"
                >
                  {printers.length === 0 ? (
                    <option value="">Impressora Padrão (350W)</option>
                  ) : (
                    printers.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.brand} {p.model} ({p.power}W)
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Insumos Adicionais (Ímãs, Parafusos, Argolas) */}
            <div className="p-3.5 bg-zinc-950/60 border border-zinc-800 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-orange-400" />
                  <span>Componentes / Insumos Extras</span>
                  {additionalSupplies.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-orange-500/20 text-orange-400 font-mono">
                      +{formatCurrency(quoteCalculation.suppliesCost)}
                    </span>
                  )}
                </span>

                <button
                  type="button"
                  onClick={() => setShowSuppliesSelector(!showSuppliesSelector)}
                  className="text-[11px] font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Adicionar Insumo</span>
                </button>
              </div>

              {/* Menu dropdown de adicionar da lista de insumos */}
              {showSuppliesSelector && (
                <div className="p-2.5 bg-zinc-900 border border-zinc-700 rounded-xl space-y-2 animate-in fade-in">
                  <p className="text-[10px] text-zinc-400">Escolha um item do seu estoque ou crie um avulso:</p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {supplies.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleAddSupplyRow(s)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700 flex items-center gap-1"
                      >
                        <span>{s.name}</span>
                        <span className="text-[10px] text-orange-400 font-mono">({formatCurrency(s.unitCost)})</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleAddSupplyRow()}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs border border-emerald-500/30 font-bold"
                    >
                      + Item Manual Avulso
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de Insumos Adicionados */}
              {additionalSupplies.length === 0 ? (
                <p className="text-[11px] text-zinc-500 italic">
                  Nenhum componente extra (ímã, parafuso, argola). Toque em "+ Adicionar Insumo" caso a peça precise.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {additionalSupplies.map(row => (
                    <div key={row.id} className="flex items-center gap-2 bg-zinc-900/90 p-2 rounded-xl border border-zinc-800 text-xs">
                      <input 
                        type="text" 
                        value={row.name}
                        onChange={e => {
                          const val = e.target.value;
                          setAdditionalSupplies(prev => prev.map(r => r.id === row.id ? { ...r, name: val } : r));
                        }}
                        className="flex-1 bg-transparent text-zinc-200 outline-none font-medium"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-zinc-500 text-[10px]">Qtd:</span>
                        <input 
                          type="number" 
                          min="1"
                          value={row.quantity}
                          onChange={e => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            setAdditionalSupplies(prev => prev.map(r => r.id === row.id ? { ...r, quantity: val } : r));
                          }}
                          className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-center text-white font-bold"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-zinc-500 text-[10px]">R$:</span>
                        <input 
                          type="number" 
                          step="0.10"
                          min="0"
                          value={row.unitCost}
                          onChange={e => {
                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                            setAdditionalSupplies(prev => prev.map(r => r.id === row.id ? { ...r, unitCost: val } : r));
                          }}
                          className="w-16 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-center text-white font-bold"
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveSupplyRow(row.id)}
                        className="text-zinc-500 hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Margem de Lucro e Forma de Pagamento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">
                  Margem de Lucro Desejada (%):
                </label>
                <div className="flex items-center gap-1.5">
                  {[60, 80, 100, 150].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setProfitMargin(m)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        profitMargin === m 
                          ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-sm' 
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                      }`}
                    >
                      {m}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">
                  Meio de Pagamento Previsto:
                </label>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => setPaymentType('pix')}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      paymentType === 'pix' 
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500' 
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    Pix (0%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentType('card')}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      paymentType === 'card' 
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500' 
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    Cartão
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentType('marketplace')}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      paymentType === 'marketplace' 
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500' 
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    ML / Shopee
                  </button>
                </div>
              </div>
            </div>

            {/* Prazo e Embalagem */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                  Prazo de Produção Informado:
                </label>
                <input 
                  type="text"
                  value={deadlineDays}
                  onChange={e => setDeadlineDays(e.target.value)}
                  placeholder="Ex: 1 a 2 dias úteis"
                  className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-medium text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                  WhatsApp do Cliente (opcional):
                </label>
                <input 
                  type="text"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-medium text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* COLUNA DIREITA: RESULTADO E WHATSAPP (5 colunas)         */}
          {/* ======================================================== */}
          <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
            
            {/* Card Principal de Preço de Venda e Lucro */}
            <div className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-[#0e1a17] border-2 border-emerald-500/40 rounded-3xl p-5 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>Preço Sugerido Final</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                  Margem: {quoteCalculation.profitMarginEffective}%
                </span>
              </div>

              <div className="mb-4">
                <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight flex items-baseline gap-1.5">
                  <span className="text-emerald-400">{formatCurrency(quoteCalculation.finalSalePrice)}</span>
                  {quoteCalculation.qty > 1 && (
                    <span className="text-xs text-zinc-400 font-normal">
                      ({formatCurrency(quoteCalculation.unitSalePrice)}/un)
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-400/90 font-semibold mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>Lucro Líquido Real: {formatCurrency(quoteCalculation.netProfit)}</span>
                </p>
              </div>

              {/* Decomposição Rápida de Custos */}
              <div className="pt-3 border-t border-zinc-800/80 space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>🧵 Filamento ({quoteCalculation.totalGrams}g):</span>
                  <span className="font-mono text-zinc-200">{formatCurrency(quoteCalculation.filamentCost)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>⚡ Energia ({quoteCalculation.totalPrintHours}h de mesa/bico):</span>
                  <span className="font-mono text-zinc-200">{formatCurrency(quoteCalculation.energyCost)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>⚙️ Desgaste & Manutenção:</span>
                  <span className="font-mono text-zinc-200">{formatCurrency(quoteCalculation.maintenanceCost)}</span>
                </div>
                {quoteCalculation.suppliesCost > 0 && (
                  <div className="flex justify-between text-orange-400">
                    <span>📦 Componentes / Insumos:</span>
                    <span className="font-mono text-orange-300">{formatCurrency(quoteCalculation.suppliesCost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-zinc-300 font-bold pt-1.5 border-t border-zinc-800">
                  <span>Custo Total de Fabricação:</span>
                  <span className="font-mono text-white">{formatCurrency(quoteCalculation.manufacturingCostTotal)}</span>
                </div>
              </div>
            </div>

            {/* Caixa com Prévia da Mensagem Formatada para WhatsApp */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mensagem Pronta para WhatsApp</span>
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">Formatada</span>
              </div>

              <div className="bg-zinc-900/90 rounded-xl p-3 border border-zinc-800/80 text-xs text-zinc-300 font-sans max-h-36 overflow-y-auto whitespace-pre-line leading-relaxed custom-scrollbar selection:bg-emerald-500 selection:text-black">
                {generatedWhatsAppText}
              </div>

              {/* Botões de Ação do WhatsApp */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyWhatsAppText}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm ${
                    copied 
                      ? 'bg-emerald-500 text-zinc-950 font-black'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-zinc-950" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-emerald-400" />
                      <span>Copiar Texto</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleOpenWhatsAppDirectly}
                  className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                >
                  <Send className="w-4 h-4" />
                  <span>Enviar no Whats</span>
                </button>
              </div>
            </div>

            {/* Ação de Conversão Direta em Pedido */}
            <button
              type="button"
              onClick={handleConvertToOrder}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-zinc-800 to-cyan-500/15 hover:from-emerald-500/25 hover:to-cyan-500/25 border border-emerald-500/40 text-emerald-300 hover:text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md"
            >
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
              <span>Transformar em Pedido Oficial</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
