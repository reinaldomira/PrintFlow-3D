import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Supply } from '../types';
import { supabase } from '../services/supabase';
import { SUPPLY_CATEGORIES, formatCurrency } from '../constants';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { 
  Plus, Search, Trash2, Edit2, PackageCheck, AlertTriangle, CheckCircle2, 
  ShoppingCart, ExternalLink, TrendingUp, Layers, X, Loader2, ArrowUpRight, 
  Copy, Check, Wrench, ShieldAlert, Sparkles, Filter, ChevronRight, Minus, 
  PlusCircle, RefreshCw, Box
} from 'lucide-react';

export const Supplies: React.FC = () => {
  const { supplies, setSupplies, filaments, failures, user, refreshData } = useApp();

  // Tab ativa: 'supplies' (Insumos) | 'shopping_list' (Lista de Compras) | 'brand_efficiency' (Eficiência de Marcas)
  const [activeTab, setActiveTab] = useState<'supplies' | 'shopping_list' | 'brand_efficiency'>('supplies');

  // Filtros de Insumos
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Modais de Insumos
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupply, setEditingSupply] = useState<Partial<Supply> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modal de Ajuste Rápido de Estoque (+/-)
  const [stockAdjustItem, setStockAdjustItem] = useState<Supply | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number | ''>('');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Modal de Exclusão
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feedback e notificações
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedShoppingList, setCopiedShoppingList] = useState(false);

  // Insumos filtrados
  const filteredSupplies = useMemo(() => {
    return (supplies || []).filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.supplier || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchesLowStock = !onlyLowStock || item.quantity <= item.minQuantity;

      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [supplies, searchTerm, selectedCategory, onlyLowStock]);

  // Indicadores dos Insumos
  const metrics = useMemo(() => {
    const list = supplies || [];
    const totalItems = list.length;
    const totalUnits = list.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    const totalInvested = list.reduce((sum, s) => sum + ((Number(s.quantity) || 0) * (Number(s.unitCost) || 0)), 0);
    const lowStockCount = list.filter(s => s.quantity <= s.minQuantity).length;

    return { totalItems, totalUnits, totalInvested, lowStockCount };
  }, [supplies]);

  // Itens para a Lista de Compras Automática
  const shoppingList = useMemo(() => {
    // 1. Filamentos em estoque crítico (<= 20% do peso total)
    const criticalFilaments = (filaments || []).filter(f => {
      const total = f.weight || 1000;
      const remaining = f.remainingWeight ?? total;
      return (remaining / total) <= 0.20;
    }).map(f => {
      const remaining = f.remainingWeight ?? f.weight ?? 1000;
      const pct = Math.round((remaining / (f.weight || 1000)) * 100);
      return {
        id: f.id,
        type: 'filament' as const,
        name: `${f.brand} - ${f.material} (${f.colorName})`,
        colorHex: f.colorHex,
        currentStock: `${remaining}g (${pct}%)`,
        suggestedBuy: '1 carretel (1000g)',
        estimatedCost: Number(f.pricePaid) || 120,
        supplier: f.brand,
        link: undefined
      };
    });

    // 2. Insumos em estoque crítico (quantity <= minQuantity)
    const criticalSupplies = (supplies || []).filter(s => s.quantity <= s.minQuantity).map(s => {
      const neededUnits = Math.max(1, (s.packageUnits || 50));
      const packagePrice = s.packagePrice || (s.unitCost * neededUnits);
      return {
        id: s.id,
        type: 'supply' as const,
        name: s.name,
        category: s.category,
        currentStock: `${s.quantity} un (Mín: ${s.minQuantity})`,
        suggestedBuy: s.packageUnits ? `1 pacote (${s.packageUnits} un)` : `${neededUnits} un`,
        estimatedCost: Number(packagePrice) || (s.unitCost * neededUnits),
        supplier: s.supplier || 'Fornecedor habitual',
        link: s.link
      };
    });

    const totalEstimatedCost = [...criticalFilaments, ...criticalSupplies].reduce((sum, item) => sum + item.estimatedCost, 0);

    return {
      filaments: criticalFilaments,
      supplies: criticalSupplies,
      totalCount: criticalFilaments.length + criticalSupplies.length,
      totalEstimatedCost
    };
  }, [filaments, supplies]);

  // Relatório de Eficiência por Marca de Filamento
  const brandEfficiencyReport = useMemo(() => {
    // Agrupa todos os carretéis por marca
    const brandMap: Record<string, {
      totalSpools: number;
      totalWeightGrams: number;
      totalInvested: number;
      failuresCount: number;
      gramsLost: number;
      costLost: number;
      reasons: Record<string, number>;
    }> = {};

    (filaments || []).forEach(f => {
      const brand = (f.brand || 'Outra Marca').trim();
      if (!brandMap[brand]) {
        brandMap[brand] = {
          totalSpools: 0,
          totalWeightGrams: 0,
          totalInvested: 0,
          failuresCount: 0,
          gramsLost: 0,
          costLost: 0,
          reasons: {}
        };
      }
      brandMap[brand].totalSpools += 1;
      brandMap[brand].totalWeightGrams += (f.weight || 1000);
      brandMap[brand].totalInvested += Number(f.pricePaid) || 0;
    });

    // Cruza com registros de falhas
    (failures || []).forEach(fail => {
      let brandFound = 'Outra Marca';
      if (fail.filamentId) {
        const fil = (filaments || []).find(f => f.id === fail.filamentId);
        if (fil?.brand) brandFound = fil.brand.trim();
      } else if (fail.filamentName) {
        // Tenta inferir da string do filamento
        const matched = Object.keys(brandMap).find(b => fail.filamentName?.toLowerCase().includes(b.toLowerCase()));
        if (matched) brandFound = matched;
      }

      if (!brandMap[brandFound]) {
        brandMap[brandFound] = {
          totalSpools: 0,
          totalWeightGrams: 0,
          totalInvested: 0,
          failuresCount: 0,
          gramsLost: 0,
          costLost: 0,
          reasons: {}
        };
      }

      brandMap[brandFound].failuresCount += 1;
      brandMap[brandFound].gramsLost += (fail.gramsLost || 0);
      brandMap[brandFound].costLost += (fail.costLost || 0);
      
      const r = fail.reason || 'Outro';
      brandMap[brandFound].reasons[r] = (brandMap[brandFound].reasons[r] || 0) + 1;
    });

    return Object.entries(brandMap).map(([brand, data]) => {
      const totalGramsHandled = Math.max(data.totalWeightGrams, data.gramsLost);
      const lossRatio = totalGramsHandled > 0 ? (data.gramsLost / totalGramsHandled) * 100 : 0;
      const successRate = Math.max(0, Math.min(100, 100 - lossRatio));

      // Motivo de falha mais comum
      let topReason = 'Nenhuma falha reportada';
      let topCount = 0;
      Object.entries(data.reasons).forEach(([r, count]) => {
        if (count > topCount) {
          topCount = count;
          topReason = r;
        }
      });

      return {
        brand,
        totalSpools: data.totalSpools,
        totalInvested: data.totalInvested,
        failuresCount: data.failuresCount,
        gramsLost: data.gramsLost,
        costLost: data.costLost,
        successRate: Number(successRate.toFixed(1)),
        topReason
      };
    }).sort((a, b) => b.totalSpools - a.totalSpools);
  }, [filaments, failures]);

  // Salvar novo insumo ou editar
  const handleSaveSupply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupply?.name || !user) return;
    setIsSaving(true);

    try {
      const packagePrice = Number(editingSupply.packagePrice) || 0;
      const packageUnits = Math.max(1, Number(editingSupply.packageUnits) || 1);
      
      // Se informou preço e unidades do pacote, calcula custo unitário automaticamente
      let unitCost = Number(editingSupply.unitCost);
      if (packagePrice > 0 && packageUnits > 0) {
        unitCost = Number((packagePrice / packageUnits).toFixed(4));
      }

      const payload: any = {
        name: editingSupply.name.trim(),
        category: editingSupply.category || SUPPLY_CATEGORIES[0],
        quantity: Math.max(0, Number(editingSupply.quantity) || 0),
        min_quantity: Math.max(0, Number(editingSupply.minQuantity) || 10),
        unit_cost: unitCost || 0,
        package_price: packagePrice,
        package_units: packageUnits,
        supplier: editingSupply.supplier?.trim() || null,
        link: editingSupply.link?.trim() || null,
        notes: editingSupply.notes?.trim() || null,
        user_id: user.id,
        updated_at: new Date().toISOString()
      };

      let savedId = editingSupply.id;
      let errorOccurred = false;

      try {
        if (editingSupply.id) {
          const { error } = await supabase.from('supplies').update(payload).eq('id', editingSupply.id);
          if (error) throw error;
        } else {
          payload.created_at = new Date().toISOString();
          const { data, error } = await supabase.from('supplies').insert([payload]).select().single();
          if (error) throw error;
          if (data?.id) savedId = data.id;
        }
      } catch (dbErr: any) {
        console.warn('Tabela supplies remota ainda ausente ou com erro, salvando no cache local resiliente:', dbErr);
        errorOccurred = true;
      }

      // Atualiza estado local imediatamente para o usuário
      const finalizedItem: Supply = {
        id: savedId || `sup_${Date.now()}`,
        name: payload.name,
        category: payload.category,
        quantity: payload.quantity,
        minQuantity: payload.min_quantity,
        unitCost: payload.unit_cost,
        packagePrice: payload.package_price,
        packageUnits: payload.package_units,
        supplier: payload.supplier || undefined,
        link: payload.link || undefined,
        notes: payload.notes || undefined,
        createdAt: payload.created_at || new Date().toISOString()
      };

      if (editingSupply.id) {
        setSupplies(supplies.map(s => s.id === editingSupply.id ? finalizedItem : s));
      } else {
        setSupplies([finalizedItem, ...supplies]);
      }

      setIsModalOpen(false);
      setEditingSupply(null);
      setActionNotice({ 
        type: 'success', 
        message: errorOccurred 
          ? 'Insumo salvo localmente! (Para sincronizar com a nuvem, execute o script SQL de atualização nas Configurações).' 
          : 'Insumo salvo com sucesso no banco de dados!' 
      });
      setTimeout(() => setActionNotice(null), 4000);
      await refreshData();
    } catch (err: any) {
      console.error('Erro ao salvar insumo:', err);
      setActionNotice({ type: 'error', message: 'Erro ao salvar: ' + (err.message || 'Falha na conexão.') });
    } finally {
      setIsSaving(false);
    }
  };

  // Ajuste rápido de estoque (+/-)
  const handleQuickAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockAdjustItem || adjustAmount === '' || Number(adjustAmount) <= 0) return;
    setIsAdjusting(true);

    try {
      const delta = adjustType === 'add' ? Number(adjustAmount) : -Number(adjustAmount);
      const newQuantity = Math.max(0, stockAdjustItem.quantity + delta);

      // Atualização otimista
      setSupplies(supplies.map(s => s.id === stockAdjustItem.id ? { ...s, quantity: newQuantity } : s));

      try {
        await supabase
          .from('supplies')
          .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
          .eq('id', stockAdjustItem.id);
      } catch (err) {
        console.warn('Erro ao atualizar remoto, persistido no cache local:', err);
      }

      setActionNotice({
        type: 'success',
        message: adjustType === 'add'
          ? `+${adjustAmount} un adicionadas ao estoque de "${stockAdjustItem.name}"!`
          : `-${adjustAmount} un baixadas do estoque de "${stockAdjustItem.name}".`
      });
      setTimeout(() => setActionNotice(null), 3500);
      setStockAdjustItem(null);
      setAdjustAmount('');
    } catch (err: any) {
      setActionNotice({ type: 'error', message: 'Erro ao ajustar estoque: ' + err.message });
    } finally {
      setIsAdjusting(false);
    }
  };

  // Excluir insumo
  const confirmDeleteSupply = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const idToDelete = deleteTarget.id;

    try {
      setSupplies(supplies.filter(s => s.id !== idToDelete));
      try {
        await supabase.from('supplies').delete().eq('id', idToDelete);
      } catch (err) {
        console.warn('Removido do cache local:', err);
      }

      setActionNotice({ type: 'success', message: `Insumo "${deleteTarget.name}" excluído com sucesso!` });
      setTimeout(() => setActionNotice(null), 3000);
      setDeleteTarget(null);
      await refreshData();
    } catch (err: any) {
      setActionNotice({ type: 'error', message: 'Erro ao excluir insumo: ' + err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  // Copiar Lista de Compras para WhatsApp
  const handleCopyShoppingList = () => {
    const lines: string[] = [
      `🛒 *LISTA DE REPOSIÇÃO - PRINTFLOW 3D*`,
      `📅 Data: ${new Date().toLocaleDateString('pt-BR')}`,
      `💰 Total Estimado: ${formatCurrency(shoppingList.totalEstimatedCost)}`,
      `---------------------------------------`
    ];

    if (shoppingList.filaments.length > 0) {
      lines.push(`\n🧵 *FILAMENTOS EM NÍVEL CRÍTICO (≤20%):*`);
      shoppingList.filaments.forEach(f => {
        lines.push(`• *${f.name}*`);
        lines.push(`  Restante: ${f.currentStock} | Comprar: ${f.suggestedBuy} (~${formatCurrency(f.estimatedCost)})`);
      });
    }

    if (shoppingList.supplies.length > 0) {
      lines.push(`\n🔩 *INSUMOS & COMPONENTES EM FALTA:*`);
      shoppingList.supplies.forEach(s => {
        lines.push(`• *${s.name}* (${s.category || 'Geral'})`);
        lines.push(`  Saldo: ${s.currentStock} | Sugestão: ${s.suggestedBuy} (~${formatCurrency(s.estimatedCost)})`);
        if (s.supplier) lines.push(`  Fornecedor: ${s.supplier}`);
        if (s.link) lines.push(`  Link: ${s.link}`);
      });
    }

    lines.push(`\n---------------------------------------`);
    lines.push(`_Gerado automaticamente pelo PrintFlow 3D_`);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedShoppingList(true);
    setTimeout(() => setCopiedShoppingList(false), 2500);
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Insumos & Estoque Inteligente
          </h1>
          <p className="text-xs text-slate-400">
            Controle de ferragens, ímãs, botões, lista de compras e eficiência de materiais
          </p>
        </div>

        {activeTab === 'supplies' && (
          <button
            onClick={() => {
              setEditingSupply({
                name: '',
                category: SUPPLY_CATEGORIES[0],
                quantity: 0,
                minQuantity: 10,
                unitCost: 0,
                packagePrice: 0,
                packageUnits: 50,
                supplier: '',
                link: '',
                notes: ''
              });
              setIsModalOpen(true);
            }}
            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-sm shrink-0"
          >
            <Plus className="w-5 h-5" /> Novo Insumo
          </button>
        )}
      </div>

      {/* Alerta de Ação */}
      {actionNotice && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border animate-in fade-in ${
          actionNotice.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{actionNotice.message}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-zinc-400 hover:text-white p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs de Navegação da Aba */}
      <div className="flex items-center gap-1.5 p-1 bg-[#121927] border border-[#1e2a42] rounded-2xl w-full sm:w-fit overflow-x-auto">
        <button
          onClick={() => setActiveTab('supplies')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'supplies'
              ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>Insumos & Componentes</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
            {supplies.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('shopping_list')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'shopping_list'
              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Lista de Compras</span>
          {shoppingList.totalCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500 text-zinc-950 font-black">
              {shoppingList.totalCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('brand_efficiency')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'brand_efficiency'
              ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Eficiência por Marca</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: CATÁLOGO DE INSUMOS                                                */}
      {/* ========================================================================= */}
      {activeTab === 'supplies' && (
        <div className="space-y-6">
          {/* Métricas do Estoque de Insumos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Insumos Cadastrados</span>
              <span className="text-2xl font-black text-slate-100 font-mono">{metrics.totalItems}</span>
              <p className="text-[11px] text-slate-500 mt-0.5">{metrics.totalUnits} unidades totais</p>
            </div>

            <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Capital Imobilizado</span>
              <span className="text-2xl font-black text-cyan-400 font-mono">{formatCurrency(metrics.totalInvested)}</span>
              <p className="text-[11px] text-slate-500 mt-0.5">Em peças e ferragens</p>
            </div>

            <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Estoque Crítico (≤ Mín)</span>
              <span className={`text-2xl font-black font-mono ${metrics.lowStockCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {metrics.lowStockCount} <span className="text-xs font-normal text-slate-500">itens</span>
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">Precisam de reposição</p>
            </div>

            <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Status Geral</span>
              <span className={`text-xl font-bold ${metrics.lowStockCount === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {metrics.lowStockCount === 0 ? 'Abastecido' : 'Atenção aos Lotes'}
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">Gestão de chaveiros e extras</p>
            </div>
          </div>

          {/* Filtros e Busca */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por nome, fornecedor ou detalhe (ex: argola, ímã 6x2, clicker)..."
                className="w-full pl-9 pr-4 py-2.5 bg-[#121927] border border-[#1e2a42] rounded-xl outline-none text-xs text-white focus:border-cyan-500 transition-colors"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <select
                className="bg-[#121927] border border-[#1e2a42] rounded-xl px-3 py-2.5 text-xs text-slate-300 font-semibold outline-none cursor-pointer"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
              >
                <option value="ALL">Todas as Categorias</option>
                {SUPPLY_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setOnlyLowStock(!onlyLowStock)}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  onlyLowStock
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                    : 'bg-[#121927] text-slate-400 border-[#1e2a42] hover:text-white'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Apenas Críticos</span>
              </button>
            </div>
          </div>

          {/* Grid de Insumos */}
          {filteredSupplies.length === 0 ? (
            <div className="text-center py-16 bg-[#121927]/60 border border-dashed border-[#1e2a42] rounded-3xl space-y-3">
              <PackageCheck className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">Nenhum insumo encontrado.</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Cadastre aqui argolas de chaveiro, ímãs, botões clickers, parafusos e outros componentes para controle exato de estoque.
              </p>
              <button
                onClick={() => {
                  setEditingSupply({
                    name: '',
                    category: SUPPLY_CATEGORIES[0],
                    quantity: 0,
                    minQuantity: 10,
                    unitCost: 0,
                    packagePrice: 0,
                    packageUnits: 50,
                    supplier: '',
                    link: '',
                    notes: ''
                  });
                  setIsModalOpen(true);
                }}
                className="text-xs font-bold text-emerald-400 hover:underline uppercase tracking-wider pt-2 inline-block"
              >
                + Cadastrar primeiro insumo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSupplies.map(supply => {
                const isCritical = supply.quantity <= supply.minQuantity;
                const isDepleted = supply.quantity === 0;

                return (
                  <div
                    key={supply.id}
                    className={`bg-[#121927] border rounded-2xl p-5 shadow-lg shadow-black/20 flex flex-col justify-between transition-all hover:border-[#2a3c5d] group ${
                      isDepleted 
                        ? 'border-rose-500/40 bg-gradient-to-b from-rose-950/10 to-[#121927]' 
                        : isCritical
                        ? 'border-amber-500/40'
                        : 'border-[#1e2a42]'
                    }`}
                  >
                    <div>
                      {/* Top Header do Card */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            {supply.category}
                          </span>
                          <h3 className="text-sm font-bold text-slate-100 truncate mt-0.5" title={supply.name}>
                            {supply.name}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setEditingSupply(supply);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a263d] transition-colors"
                            title="Editar insumo"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ id: supply.id, name: supply.name })}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Excluir insumo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Display de Saldo em Estoque */}
                      <div className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-3 mb-3.5 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Estoque Atual</span>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className={`text-2xl font-black font-mono ${
                              isDepleted ? 'text-rose-400' : isCritical ? 'text-amber-400' : 'text-emerald-400'
                            }`}>
                              {supply.quantity}
                            </span>
                            <span className="text-xs text-slate-500">unidades</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            isDepleted 
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : isCritical
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            {isDepleted ? 'Esgotado' : isCritical ? 'Crítico (Repor)' : 'Em Estoque'}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-1">Mínimo: {supply.minQuantity} un</span>
                        </div>
                      </div>

                      {/* Detalhes Financeiros */}
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-3 pb-3 border-b border-[#1e2a42]/80">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Custo Unitário</span>
                          <strong className="text-slate-200 font-mono text-sm">{formatCurrency(supply.unitCost)}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Valor Imobilizado</span>
                          <strong className="text-cyan-400 font-mono text-sm">{formatCurrency(supply.quantity * supply.unitCost)}</strong>
                        </div>
                      </div>

                      {/* Informações de Compra / Fornecedor */}
                      {(supply.supplier || supply.packagePrice) && (
                        <div className="text-[11px] text-slate-400 space-y-1 mb-3">
                          {supply.supplier && (
                            <p className="truncate">
                              <span className="text-slate-500">Fornecedor:</span> {supply.supplier}
                            </p>
                          )}
                          {supply.packagePrice ? (
                            <p className="text-[10px] text-slate-500 font-mono">
                              Pacote: {formatCurrency(supply.packagePrice)} ({supply.packageUnits || 1} un)
                            </p>
                          ) : null}
                          {supply.link && (
                            <a
                              href={supply.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:underline flex items-center gap-1 text-[11px] pt-0.5"
                            >
                              <span>Ver link de compra</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ações de Ajuste Rápido de Estoque (+/-) */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#1e2a42]">
                      <button
                        type="button"
                        onClick={() => {
                          setStockAdjustItem(supply);
                          setAdjustType('add');
                          setAdjustAmount(supply.packageUnits || 50);
                        }}
                        className="flex-1 py-1.5 px-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all active:scale-95"
                        title="Adicionar entrada de pacote ou peças"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>+ Entrada</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setStockAdjustItem(supply);
                          setAdjustType('subtract');
                          setAdjustAmount(1);
                        }}
                        className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-[#1e2a42] rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all active:scale-95"
                        title="Baixar unidades utilizadas"
                      >
                        <Minus className="w-3.5 h-3.5" />
                        <span>- Baixa</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: LISTA DE COMPRAS AUTOMÁTICA                                        */}
      {/* ========================================================================= */}
      {activeTab === 'shopping_list' && (
        <div className="space-y-6">
          {/* Card Resumo com Botão de Compartilhar / Copiar */}
          <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
                Total para Reposição Imediata
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-amber-400 font-mono">
                  {formatCurrency(shoppingList.totalEstimatedCost)}
                </span>
                <span className="text-xs text-slate-400 font-semibold">
                  ({shoppingList.totalCount} {shoppingList.totalCount === 1 ? 'item necessário' : 'itens necessários'})
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Calculado com base nos carretéis com ≤20% de peso e insumos abaixo da quantidade mínima.
              </p>
            </div>

            <button
              onClick={handleCopyShoppingList}
              disabled={shoppingList.totalCount === 0}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {copiedShoppingList ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedShoppingList ? 'Copiado para o WhatsApp!' : 'Copiar Lista para WhatsApp'}</span>
            </button>
          </div>

          {shoppingList.totalCount === 0 ? (
            <div className="text-center py-20 bg-[#121927]/60 border border-dashed border-[#1e2a42] rounded-3xl space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-slate-200">Estoque 100% Abastecido!</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Nenhum carretel de filamento está no limite crítico (≤20%) e todos os insumos estão acima do estoque mínimo configurado.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Seção 1: Filamentos Críticos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <span>Filamentos para Repor ({shoppingList.filaments.length})</span>
                  </h3>
                  <span className="text-xs text-slate-500">Regra: ≤20% do peso</span>
                </div>

                {shoppingList.filaments.length === 0 ? (
                  <div className="p-4 bg-[#121927] border border-[#1e2a42] rounded-xl text-xs text-slate-500 text-center">
                    Todos os carretéis possuem mais de 20% de material disponível.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {shoppingList.filaments.map(fil => (
                      <div key={fil.id} className="bg-[#121927] border border-amber-500/30 rounded-xl p-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span 
                            className="w-4 h-4 rounded-full border border-white/20 shrink-0" 
                            style={{ backgroundColor: fil.colorHex || '#10b981' }} 
                          />
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-200 truncate">{fil.name}</h4>
                            <p className="text-[10px] text-amber-400">Saldo Restante: {fil.currentStock}</p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-bold font-mono text-slate-100 block">
                            ~{formatCurrency(fil.estimatedCost)}
                          </span>
                          <span className="text-[10px] text-slate-500">{fil.suggestedBuy}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Seção 2: Insumos Críticos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-emerald-400" />
                    <span>Insumos & Peças para Repor ({shoppingList.supplies.length})</span>
                  </h3>
                  <span className="text-xs text-slate-500">Regra: Saldo ≤ Mínimo</span>
                </div>

                {shoppingList.supplies.length === 0 ? (
                  <div className="p-4 bg-[#121927] border border-[#1e2a42] rounded-xl text-xs text-slate-500 text-center">
                    Todos os insumos e ferragens estão com saldo confortável.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {shoppingList.supplies.map(sup => (
                      <div key={sup.id} className="bg-[#121927] border border-rose-500/30 rounded-xl p-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-slate-500">{sup.category}</span>
                            {sup.supplier && <span className="text-[10px] text-slate-400">• {sup.supplier}</span>}
                          </div>
                          <h4 className="text-xs font-bold text-slate-200 truncate">{sup.name}</h4>
                          <p className="text-[10px] text-rose-400">Estoque Atual: {sup.currentStock}</p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-bold font-mono text-slate-100 block">
                            ~{formatCurrency(sup.estimatedCost)}
                          </span>
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[10px] text-slate-500">{sup.suggestedBuy}</span>
                            {sup.link && (
                              <a 
                                href={sup.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-cyan-400 hover:text-cyan-300" 
                                title="Abrir link de compra"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: RELATÓRIO DE EFICIÊNCIA POR MARCA DE FILAMENTO                     */}
      {/* ========================================================================= */}
      {activeTab === 'brand_efficiency' && (
        <div className="space-y-6">
          <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <span>Desempenho & Desperdício por Marca</span>
            </h3>
            <p className="text-xs text-slate-400">
              Cruza todos os carretéis adquiridos com o histórico de falhas e sucata da sua oficina para indicar as marcas mais confiáveis.
            </p>
          </div>

          {brandEfficiencyReport.length === 0 ? (
            <div className="text-center py-20 bg-[#121927]/60 border border-dashed border-[#1e2a42] rounded-3xl space-y-2">
              <Layers className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">Sem dados de filamento suficientes.</p>
              <p className="text-xs text-slate-500">Cadastre carretéis na aba Filamentos para visualizar este relatório.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {brandEfficiencyReport.map(b => (
                <div key={b.brand} className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-100">{b.brand}</h4>
                      <p className="text-[11px] text-slate-400">{b.totalSpools} carretéis cadastrados</p>
                    </div>

                    <div className="text-right">
                      <span className={`text-base font-mono font-black ${
                        b.successRate >= 95 ? 'text-emerald-400' : b.successRate >= 85 ? 'text-cyan-400' : 'text-amber-400'
                      }`}>
                        {b.successRate}%
                      </span>
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Taxa de Sucesso</span>
                    </div>
                  </div>

                  {/* Barra de Progresso de Eficiência */}
                  <div className="w-full bg-[#0b111e] h-2 rounded-full overflow-hidden border border-[#1e2a42]">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        b.successRate >= 95 ? 'bg-emerald-500' : b.successRate >= 85 ? 'bg-cyan-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${b.successRate}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs bg-[#0b111e] p-3 rounded-xl border border-[#1e2a42]">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Falhas Registradas</span>
                      <strong className="text-slate-200 font-mono">{b.failuresCount} incidentes</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Sucata / Perda</span>
                      <strong className={`font-mono ${b.gramsLost > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {b.gramsLost}g ({formatCurrency(b.costLost)})
                      </strong>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 pt-1">
                    <span className="text-slate-500">Falha mais frequente:</span>
                    <p className="text-slate-300 font-semibold truncate mt-0.5">{b.topReason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NOVO / EDITAR INSUMO                                               */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-[#1e2a42] flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {editingSupply?.id ? 'Editar Insumo' : 'Novo Insumo & Componente'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1a2333]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupply} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                  Nome do Insumo *
                </label>
                <input
                  required
                  placeholder="Ex: Argola p/ Chaveiro com Corrente 25mm"
                  className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  value={editingSupply?.name || ''}
                  onChange={e => setEditingSupply(prev => ({ ...prev!, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Categoria
                  </label>
                  <select
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    value={editingSupply?.category || SUPPLY_CATEGORIES[0]}
                    onChange={e => setEditingSupply(prev => ({ ...prev!, category: e.target.value }))}
                  >
                    {SUPPLY_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Estoque Atual (unidades)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    value={editingSupply?.quantity ?? 0}
                    onChange={e => setEditingSupply(prev => ({ ...prev!, quantity: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {/* Bloco de Pacote e Cálculo Automático de Custo Unitário */}
              <div className="p-3 bg-[#0b111e] border border-[#1e2a42] rounded-xl space-y-3">
                <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider block">
                  Cálculo de Custo por Pacote / Lote
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Preço do Pacote (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ex: 25.00"
                      className="w-full bg-[#121927] border border-[#1e2a42] rounded-lg px-3 py-2 text-xs text-white font-mono"
                      value={editingSupply?.packagePrice || ''}
                      onChange={e => {
                        const price = Number(e.target.value) || 0;
                        const units = Math.max(1, Number(editingSupply?.packageUnits) || 1);
                        setEditingSupply(prev => ({
                          ...prev!,
                          packagePrice: price,
                          unitCost: Number((price / units).toFixed(4))
                        }));
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Unidades no Pacote</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Ex: 100"
                      className="w-full bg-[#121927] border border-[#1e2a42] rounded-lg px-3 py-2 text-xs text-white font-mono"
                      value={editingSupply?.packageUnits || ''}
                      onChange={e => {
                        const units = Math.max(1, Number(e.target.value) || 1);
                        const price = Number(editingSupply?.packagePrice) || 0;
                        setEditingSupply(prev => ({
                          ...prev!,
                          packageUnits: units,
                          unitCost: Number((price / units).toFixed(4))
                        }));
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-[#1e2a42]">
                  <span className="text-slate-400">Custo Unitário Calculado:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {formatCurrency(editingSupply?.unitCost || 0)} / unidade
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Estoque Mínimo (Alerta)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    value={editingSupply?.minQuantity ?? 10}
                    onChange={e => setEditingSupply(prev => ({ ...prev!, minQuantity: Number(e.target.value) }))}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Fornecedor / Loja
                  </label>
                  <input
                    placeholder="Ex: Shopee / Mercado Livre"
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    value={editingSupply?.supplier || ''}
                    onChange={e => setEditingSupply(prev => ({ ...prev!, supplier: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                  Link de Compra Direto (Opcional)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  value={editingSupply?.link || ''}
                  onChange={e => setEditingSupply(prev => ({ ...prev!, link: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                  Observações / Medidas (Opcional)
                </label>
                <input
                  placeholder="Ex: Diâmetro 25mm, niquelado antiferrugem"
                  className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  value={editingSupply?.notes || ''}
                  onChange={e => setEditingSupply(prev => ({ ...prev!, notes: e.target.value }))}
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1e2a42]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#1e2a42] text-xs font-semibold text-slate-300 hover:bg-[#1a2333]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                  <span>{editingSupply?.id ? 'Atualizar Insumo' : 'Cadastrar Insumo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: AJUSTE RÁPIDO DE ESTOQUE (+/-)                                     */}
      {/* ========================================================================= */}
      {stockAdjustItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#1e2a42]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                {adjustType === 'add' ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <PlusCircle className="w-4 h-4" /> Entrada de Estoque
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <Minus className="w-4 h-4" /> Baixa Manual de Estoque
                  </span>
                )}
              </h3>
              <button onClick={() => setStockAdjustItem(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-[#0b111e] border border-[#1e2a42] rounded-xl text-xs space-y-1">
              <span className="text-slate-400 block font-semibold">{stockAdjustItem.name}</span>
              <p className="text-[11px] text-slate-500">
                Saldo atual: <strong className="text-slate-200 font-mono">{stockAdjustItem.quantity} un</strong>
              </p>
            </div>

            <form onSubmit={handleQuickAdjust} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                  Quantidade a {adjustType === 'add' ? 'Adicionar (+)' : 'Subtrair (-)'}
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-3 text-sm text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  autoFocus
                />
              </div>

              {adjustAmount !== '' && Number(adjustAmount) > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-900 border border-[#1e2a42] text-[11px] text-slate-400 flex justify-between items-center">
                  <span>Novo saldo previsto:</span>
                  <strong className="font-mono text-cyan-400 font-bold text-sm">
                    {Math.max(0, stockAdjustItem.quantity + (adjustType === 'add' ? Number(adjustAmount) : -Number(adjustAmount)))} un
                  </strong>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStockAdjustItem(null)}
                  className="px-3.5 py-2 rounded-xl border border-[#1e2a42] text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isAdjusting}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50 ${
                    adjustType === 'add'
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20'
                      : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-500/20'
                  }`}
                >
                  {isAdjusting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{adjustType === 'add' ? 'Confirmar Entrada' : 'Confirmar Baixa'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Insumo */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        title="Excluir Insumo"
        itemName={deleteTarget?.name}
        description="Deseja realmente excluir este insumo permanentemente do seu estoque? Esta ação não pode ser desfeita."
        confirmText="Sim, Excluir Insumo"
        isLoading={isDeleting}
        onConfirm={confirmDeleteSupply}
        onClose={() => setDeleteTarget(null)}
      />

    </div>
  );
};

export default Supplies;
