import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, calculatePartCosts } from '../constants';
import { useNavigate } from 'react-router-dom';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import { 
  LayoutGrid, Filter, Calendar, AlertTriangle, TrendingUp, Activity, Package,
  Clock, Truck, FileText, ChevronLeft, ChevronRight, DollarSign, Monitor, 
  X, Plus, Bell, ArrowRight, Database, Trash2, Settings2, GripVertical,
  Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw, Droplets, Layers,
  ArrowUpRight, CheckCircle2, PackageCheck
} from 'lucide-react';
import { OrderStatus, PrintFailure, DashboardCardConfig } from '../types';

const FAILURE_REASONS = [
  'Descolamento da mesa (Warping)',
  'Entupimento do bico (Clog)',
  'Filamento partido / acabou',
  'Queda de energia',
  'Erro de fatiamento / Slicer',
  'Problema de aderência de camada',
  'Outro'
];

const INITIAL_FAILURES: PrintFailure[] = [];

export const DEFAULT_DASHBOARD_CARDS: DashboardCardConfig[] = [
  { id: 'kpi_strip', title: 'Indicadores Chave (Faturamento, Lucro, Custos, Lotes)', category: 'kpi', visible: true, order: 0 },
  { id: 'pipeline_strip', title: 'Funil de Produção & Entregas', category: 'pipeline', visible: true, order: 1 },
  { id: 'widget_filament_stock', title: 'Panorama do Estoque de Filamentos', category: 'widgets', visible: true, order: 2 },
  { id: 'widget_supplies_stock', title: 'Estoque de Insumos & Componentes', category: 'widgets', visible: true, order: 3 },
  { id: 'chart_profit_evolution', title: 'Evolução do Lucro Líquido', category: 'charts', visible: true, order: 4 },
  { id: 'chart_cost_breakdown', title: 'Composição dos Custos de Produção', category: 'charts', visible: true, order: 5 },
  { id: 'list_top_products', title: 'Top Produtos em Faturamento', category: 'lists', visible: true, order: 6 },
  { id: 'chart_sales_channel', title: 'Distribuição de Vendas por Canal', category: 'charts', visible: true, order: 7 },
  { id: 'list_printers_status', title: 'Desempenho & Horas das Impressoras', category: 'lists', visible: true, order: 8 },
  { id: 'list_failures', title: 'Controle de Falhas & Sucata', category: 'lists', visible: true, order: 9 }
];

export const Dashboard: React.FC = () => {
  const { orders, parts, filaments, printers, supplies, settings, user, dbError, failures, setFailures } = useApp();
  const navigate = useNavigate();

  // Persist selected month across navigation, defaulting to current month (mês vigente)
  const [viewDate, setViewDate] = useState<Date>(() => {
    try {
      const stored = sessionStorage.getItem('printflow_dashboard_month');
      if (stored) {
        const parsed = new Date(stored);
        if (!isNaN(parsed.getTime())) {
          return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
        }
      }
    } catch (e) {
      // ignore
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('printflow_dashboard_month', viewDate.toISOString());
    } catch (e) {
      // ignore
    }
  }, [viewDate]);

  // Card customization state persisted per user
  const storageKey = useMemo(() => `printflow_dashboard_layout_${user?.id || 'guest'}`, [user?.id]);

  const [cardsConfig, setCardsConfig] = useState<DashboardCardConfig[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: DashboardCardConfig[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge with default cards to ensure newly introduced cards exist
          const merged: DashboardCardConfig[] = [];
          const existingIds = new Set(parsed.map(c => c.id));
          
          parsed.forEach((c, idx) => {
            const def = DEFAULT_DASHBOARD_CARDS.find(d => d.id === c.id);
            if (def) {
              merged.push({
                ...def,
                visible: typeof c.visible === 'boolean' ? c.visible : def.visible,
                order: typeof c.order === 'number' ? c.order : idx
              });
            }
          });

          // Add any missing default cards
          DEFAULT_DASHBOARD_CARDS.forEach(def => {
            if (!existingIds.has(def.id)) {
              merged.push({ ...def, order: merged.length });
            }
          });

          return merged.sort((a, b) => a.order - b.order);
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar layout customizado do dashboard:', e);
    }
    return DEFAULT_DASHBOARD_CARDS;
  });

  // Re-sync with user-specific storage when user changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: DashboardCardConfig[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged: DashboardCardConfig[] = [];
          const existingIds = new Set(parsed.map(c => c.id));
          
          parsed.forEach((c, idx) => {
            const def = DEFAULT_DASHBOARD_CARDS.find(d => d.id === c.id);
            if (def) {
              merged.push({
                ...def,
                visible: typeof c.visible === 'boolean' ? c.visible : def.visible,
                order: typeof c.order === 'number' ? c.order : idx
              });
            }
          });

          DEFAULT_DASHBOARD_CARDS.forEach(def => {
            if (!existingIds.has(def.id)) {
              merged.push({ ...def, order: merged.length });
            }
          });

          setCardsConfig(merged.sort((a, b) => a.order - b.order));
          return;
        }
      }
      setCardsConfig(DEFAULT_DASHBOARD_CARDS);
    } catch (e) {
      setCardsConfig(DEFAULT_DASHBOARD_CARDS);
    }
  }, [storageKey]);

  const saveCardsConfig = (newConfig: DashboardCardConfig[]) => {
    setCardsConfig(newConfig);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newConfig));
    } catch (e) {
      console.warn('Falha ao salvar layout:', e);
    }
  };

  const handleToggleCard = (id: string) => {
    const updated = cardsConfig.map(c => c.id === id ? { ...c, visible: !c.visible } : c);
    saveCardsConfig(updated);
  };

  const handleMoveCard = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= cardsConfig.length) return;

    const newArr = [...cardsConfig];
    const temp = newArr[index];
    newArr[index] = newArr[targetIndex];
    newArr[targetIndex] = temp;

    // Normalize order index
    const reordered = newArr.map((item, idx) => ({ ...item, order: idx }));
    saveCardsConfig(reordered);
  };

  const handleResetDefaultLayout = () => {
    saveCardsConfig(DEFAULT_DASHBOARD_CARDS);
  };

  const isCardVisible = (id: string) => {
    const found = cardsConfig.find(c => c.id === id);
    return found ? found.visible : true;
  };

  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
  const [isFailureModalOpen, setIsFailureModalOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);

  // Failure Form State
  const [failPrinter, setFailPrinter] = useState('');
  const [failReason, setFailReason] = useState(FAILURE_REASONS[0]);
  const [failFilament, setFailFilament] = useState('');
  const [failGrams, setFailGrams] = useState<number | ''>(50);
  const [failHours, setFailHours] = useState<number | ''>(2.5);
  const [failNotes, setFailNotes] = useState('');

  // Auto-calculated failure cost
  const calculatedFailCost = useMemo(() => {
    const grams = typeof failGrams === 'number' ? failGrams : 0;
    const hours = typeof failHours === 'number' ? failHours : 0;

    let filamentCostPerGram = 0.12; // default R$ 120/kg -> R$ 0.12/g
    if (failFilament) {
      const fil = filaments.find(f => f.id === failFilament);
      if (fil && fil.weight > 0) {
        filamentCostPerGram = fil.pricePaid / fil.weight;
      }
    }

    const materialCost = grams * filamentCostPerGram;
    const energyRate = settings.defaultEnergyCost || 0.85;
    const maintenanceRate = settings.hourlyMaintenanceCost || 1.50;
    const printerObj = printers.find(p => p.id === failPrinter);
    const powerKW = ((printerObj ? printerObj.power : 350)) / 1000;
    const energyCost = powerKW * hours * energyRate;
    const maintenanceCost = hours * maintenanceRate;

    return Number((materialCost + energyCost + maintenanceCost).toFixed(2));
  }, [failGrams, failHours, failFilament, failPrinter, filaments, printers, settings]);

  const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return viewDate.getFullYear() === now.getFullYear() && viewDate.getMonth() === now.getMonth();
  }, [viewDate]);

  const handleCurrentMonth = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const planValidityDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toLocaleDateString('pt-BR');
  }, []);

  // Filter orders for selected month
  const filteredOrders = useMemo(() => {
    const selectedMonth = viewDate.getMonth();
    const selectedYear = viewDate.getFullYear();
    return orders.filter(o => {
      const orderDate = new Date(o.createdAt);
      return orderDate.getMonth() === selectedMonth && orderDate.getFullYear() === selectedYear;
    });
  }, [orders, viewDate]);

  // Statistics calculation with realistic fallback if database is empty for this month
  const stats = useMemo(() => {
    let revenue = 0;
    let totalCost = 0;
    let pieces = 0;
    let filamentCostTotal = 0;
    let energyCostTotal = 0;
    let maintenanceCostTotal = 0;
    let extrasCostTotal = 0;

    filteredOrders.forEach(order => {
      revenue += order.totalValue;
      (order.items || []).forEach(item => {
        pieces += item.quantity;
        const part = parts.find(p => p.id === item.partId);
        if (part) {
          const partCosts = calculatePartCosts(part, filaments, printers, settings, supplies);
          totalCost += partCosts.totalCost * item.quantity;
          filamentCostTotal += partCosts.materialCost * item.quantity;
          energyCostTotal += partCosts.energyCost * item.quantity;
          maintenanceCostTotal += partCosts.maintenanceCost * item.quantity;
          extrasCostTotal += (partCosts.wasteCost + partCosts.laborCost + (partCosts.suppliesCost || 0)) * item.quantity;
        } else {
          totalCost += (item.unitPrice * 0.4) * item.quantity;
          filamentCostTotal += (item.unitPrice * 0.2) * item.quantity;
          energyCostTotal += (item.unitPrice * 0.08) * item.quantity;
          maintenanceCostTotal += (item.unitPrice * 0.05) * item.quantity;
          extrasCostTotal += (item.unitPrice * 0.07) * item.quantity;
        }
      });
    });

    const totalFailuresCost = failures.reduce((acc, f) => acc + (f.costLost || 0), 0);
    extrasCostTotal += totalFailuresCost;
    totalCost += totalFailuresCost;

    const netProfit = Math.max(0, revenue - totalCost);
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      revenue,
      profit: netProfit,
      productionCost: totalCost,
      pieces,
      filamentCost: filamentCostTotal,
      energyCost: energyCostTotal,
      maintenanceCost: maintenanceCostTotal,
      extrasCost: extrasCostTotal,
      marginPercent: Math.round(margin),
      isDemo: false
    };
  }, [filteredOrders, orders, parts, filaments, printers, supplies, settings, failures]);

  // Filament Inventory Overview widget data
  const filamentInventoryStats = useMemo(() => {
    let totalWeightGrams = 0;
    let totalInvested = 0;
    let lowStockCount = 0;
    let inStockCount = 0;

    (filaments || []).forEach(f => {
      totalWeightGrams += f.remainingWeight || 0;
      if (f.weight > 0) {
        totalInvested += (f.pricePaid / f.weight) * (f.remainingWeight || 0);
      }
      const pct = f.weight > 0 ? (f.remainingWeight / f.weight) * 100 : 0;
      if (pct <= 20) {
        lowStockCount++;
      } else {
        inStockCount++;
      }
    });

    return {
      totalSpools: (filaments || []).length,
      totalWeightKg: (totalWeightGrams / 1000).toFixed(2),
      totalInvested,
      lowStockCount,
      inStockCount
    };
  }, [filaments]);

  // Supplies Inventory Overview widget data
  const suppliesInventoryStats = useMemo(() => {
    const list = supplies || [];
    let totalUnits = 0;
    let totalInvested = 0;
    let lowStockCount = 0;
    let inStockCount = 0;

    list.forEach(s => {
      const q = Number(s.quantity) || 0;
      const min = Number(s.minQuantity) || 0;
      const unitCost = Number(s.unitCost) || 0;

      totalUnits += q;
      totalInvested += q * unitCost;

      if (q <= min) {
        lowStockCount++;
      } else {
        inStockCount++;
      }
    });

    const criticalItems = [...list]
      .filter(s => (Number(s.quantity) || 0) <= (Number(s.minQuantity) || 0))
      .sort((a, b) => (Number(a.quantity) || 0) - (Number(b.quantity) || 0))
      .slice(0, 4);

    return {
      totalItems: list.length,
      totalUnits,
      totalInvested,
      lowStockCount,
      inStockCount,
      criticalItems
    };
  }, [supplies]);

  // Production Pipeline / Kanban breakdown
  const pipeline = useMemo(() => {
    const pendingQuotes = orders.filter(o => (o.payments || []).length === 0 && o.status !== OrderStatus.DELIVERED);
    const inProduction = orders.filter(o => o.status === OrderStatus.PRODUCTION);
    const readyToShip = orders.filter(o => o.status === OrderStatus.READY);
    const inTransit = orders.filter(o => o.status === OrderStatus.DELIVERED);

    return {
      pendingQuotes,
      inProduction,
      readyToShip,
      inTransit
    };
  }, [orders]);

  // Evolução do Lucro (Chart data) - Dinâmico para os 4 meses terminando no mês selecionado
  const profitEvolutionData = useMemo(() => {
    const result = [];
    const currentViewYear = viewDate.getFullYear();
    const currentViewMonth = viewDate.getMonth();

    for (let i = 3; i >= 0; i--) {
      const d = new Date(currentViewYear, currentViewMonth - i, 1);
      const rawMonthName = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      const monthFormatted = rawMonthName.charAt(0).toUpperCase() + rawMonthName.slice(1);
      const yearShort = d.getFullYear().toString().slice(-2);
      const label = `${monthFormatted}/${yearShort}`;

      const monthOrders = orders.filter(o => {
        const orderDate = new Date(o.createdAt);
        return orderDate.getMonth() === d.getMonth() && orderDate.getFullYear() === d.getFullYear();
      });

      let monthProfit = 0;
      if (monthOrders.length > 0) {
        monthOrders.forEach(o => {
          let orderCost = 0;
          (o.items || []).forEach(item => {
            const part = parts.find(p => p.id === item.partId);
            if (part) {
              const partCosts = calculatePartCosts(part, filaments, printers, settings);
              orderCost += partCosts.totalCost * item.quantity;
            } else {
              orderCost += (item.unitPrice * 0.4) * item.quantity;
            }
          });
          monthProfit += Math.max(0, o.totalValue - orderCost);
        });
      } else if (i === 0) {
        monthProfit = Math.round(stats.profit);
      } else {
        monthProfit = 0;
      }

      result.push({
        name: label,
        lucro: Math.round(monthProfit)
      });
    }

    return result;
  }, [viewDate, orders, parts, filaments, printers, settings, stats.profit]);

  // Cost breakdown for Donut Chart
  const costDonutData = useMemo(() => {
    return [
      { name: 'Deprec.', value: Math.round(stats.maintenanceCost || 0), color: '#f59e0b' },
      { name: 'Energia', value: Math.round(stats.energyCost || 0), color: '#06b6d4' },
      { name: 'Extras', value: Math.round(stats.extrasCost || 0), color: '#f97316' },
      { name: 'Filamento', value: Math.round(stats.filamentCost || 0), color: '#3b82f6' }
    ];
  }, [stats]);

  // Top Products calculation
  const topProducts = useMemo(() => {
    const productRevenue: Record<string, { name: string; revenue: number; qty: number }> = {};

    filteredOrders.forEach(order => {
      (order.items || []).forEach(item => {
        const part = parts.find(p => p.id === item.partId);
        const name = item.name || part?.name || 'Peça Personalizada';
        const rev = item.unitPrice * item.quantity;
        if (!productRevenue[name]) {
          productRevenue[name] = { name, revenue: 0, qty: 0 };
        }
        productRevenue[name].revenue += rev;
        productRevenue[name].qty += item.quantity;
      });
    });

    const sorted = Object.values(productRevenue).sort((a, b) => b.revenue - a.revenue);
    return sorted.slice(0, 4);
  }, [filteredOrders, parts]);

  const maxProductRevenue = useMemo(() => {
    return Math.max(...topProducts.map(p => p.revenue), 1);
  }, [topProducts]);

  // Sales by Channel
  const salesByChannelData = useMemo(() => {
    let direct = 0;
    let ml = 0;
    let shopee = 0;
    let insta = 0;

    filteredOrders.forEach(o => {
      const method = (o.paymentMethod || '').toLowerCase();
      if (method.includes('pix') || method.includes('dinheiro')) {
        direct += o.totalValue;
      } else if (method.includes('cartão') || method.includes('cartao') || method.includes('card')) {
        ml += o.totalValue;
      } else {
        direct += o.totalValue;
      }
    });

    return [
      { channel: 'Venda Direta', total: direct },
      { channel: 'M. Livre', total: ml },
      { channel: 'Shopee', total: shopee },
      { channel: 'Instagram', total: insta }
    ];
  }, [filteredOrders]);

  // Top Printers
  const topPrintersList = useMemo(() => {
    if (printers.length === 0) return [];

    const printerHoursMap: Record<string, number> = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        const part = parts.find(p => p.id === item.partId);
        if (part && part.printerId) {
          printerHoursMap[part.printerId] = (printerHoursMap[part.printerId] || 0) + ((part.printTime || 0) * (item.quantity || 1));
        }
      });
    });

    return printers.map(p => {
      const hours = printerHoursMap[p.id] ? `${Number(printerHoursMap[p.id].toFixed(1))}h` : '0h';
      return {
        id: p.id,
        name: `${p.brand} ${p.model}`,
        hours,
        status: p.status || 'Ativa'
      };
    });
  }, [printers, orders, parts]);

  // Total failures stats
  const failuresStats = useMemo(() => {
    const totalCount = failures.length;
    const totalCost = failures.reduce((sum, f) => sum + (f.costLost || 0), 0);
    
    const byPrinter: Record<string, { count: number; cost: number }> = {};
    failures.forEach(f => {
      const p = f.printerName || 'Impressora';
      if (!byPrinter[p]) byPrinter[p] = { count: 0, cost: 0 };
      byPrinter[p].count += 1;
      byPrinter[p].cost += f.costLost || 0;
    });

    return {
      count: totalCount,
      totalCost,
      byPrinter: Object.entries(byPrinter).map(([name, data]) => ({ name, ...data }))
    };
  }, [failures]);

  // Handle saving failure
  const handleSaveFailure = (e: React.FormEvent) => {
    e.preventDefault();
    const printerObj = printers.find(p => p.id === failPrinter);
    const filObj = filaments.find(f => f.id === failFilament);

    const newFailure: PrintFailure = {
      id: `fail-${Date.now()}`,
      printerId: failPrinter || undefined,
      printerName: printerObj ? `${printerObj.brand} ${printerObj.model}` : (failPrinter || 'Bambu 01'),
      reason: failReason,
      filamentId: failFilament || undefined,
      filamentName: filObj ? `${filObj.brand} ${filObj.material} (${filObj.colorName})` : undefined,
      gramsLost: Number(failGrams) || 0,
      printTimeHoursLost: Number(failHours) || 0,
      costLost: calculatedFailCost,
      date: new Date().toISOString().split('T')[0],
      notes: failNotes
    };

    setFailures(prev => [newFailure, ...prev]);
    setIsFailureModalOpen(false);
    setFailNotes('');
  };

  const handleDeleteFailure = (id: string) => {
    setFailures(prev => prev.filter(f => f.id !== id));
  };

  if (dbError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mb-6 border border-amber-500/20">
          <Database className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-black mb-2 text-white">Banco de Dados não pronto</h2>
        <p className="text-slate-400 max-w-md mb-8 text-sm">
          Detectamos que as tabelas ou colunas necessárias ainda não existem no seu Supabase:<br/>
          <span className="text-amber-400 font-bold mt-2 block">{dbError}</span>
        </p>
        <button 
          onClick={() => navigate('/settings')}
          className="bg-emerald-500 text-slate-950 font-black px-8 py-3.5 rounded-xl flex items-center gap-2 shadow-xl shadow-emerald-500/20 active:scale-95 transition-all text-sm"
        >
          VER SQL DE CONFIGURAÇÃO <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Ordered visible card rendering
  const renderCardById = (id: string) => {
    switch (id) {
      case 'kpi_strip':
        return (
          <div key="kpi_strip" className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                <span>Métricas Operacionais & Financeiras</span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">Consolidado ({monthLabel})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Faturamento Total */}
              <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-black/20 hover:border-emerald-500/40 transition-all group">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      FATURAMENTO TOTAL
                    </p>
                  </div>
                  <p className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                    {formatCurrency(stats.revenue)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                    <span>Período selecionado</span>
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl font-bold shadow-inner group-hover:scale-105 transition-transform">
                  $
                </div>
              </div>

              {/* Card 2: Lucro Líquido */}
              <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-black/20 hover:border-cyan-500/40 transition-all group">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      LUCRO LÍQUIDO
                    </p>
                  </div>
                  <p className="text-2xl font-black text-cyan-400 font-mono tracking-tight">
                    {formatCurrency(stats.profit)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Margem real: <span className="text-cyan-300 font-semibold">{stats.marginPercent}%</span>
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-inner group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>

              {/* Card 3: Custo Produção */}
              <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-black/20 hover:border-rose-500/40 transition-all group">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      CUSTO PRODUÇÃO
                    </p>
                  </div>
                  <p className="text-2xl font-black text-rose-400 font-mono tracking-tight">
                    {formatCurrency(stats.productionCost)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Filamento, energia & falhas
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-inner group-hover:scale-105 transition-transform">
                  <Activity className="w-5 h-5" />
                </div>
              </div>

              {/* Card 4: Lotes Produzidos */}
              <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-black/20 hover:border-purple-500/40 transition-all group">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                      LOTES / PEÇAS
                    </p>
                  </div>
                  <p className="text-2xl font-black text-purple-300 font-mono tracking-tight">
                    {stats.pieces} <span className="text-xs font-normal text-slate-500">un.</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {filteredOrders.length} pedidos no mês
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-inner group-hover:scale-105 transition-transform">
                  <Package className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>
        );

      case 'pipeline_strip':
        return (
          <div key="pipeline_strip" className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                <span>Funil de Produção (Pipeline Kanban)</span>
              </div>
              <button 
                onClick={() => navigate('/orders')}
                className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
              >
                Ver todos os pedidos <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Col 1: Orçamentos Pendentes */}
              <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4 flex flex-col justify-between min-h-[160px] shadow-sm hover:border-[#2a3c5d] transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <FileText className="w-4 h-4 text-amber-400" />
                      <span>Orçamentos Pendentes</span>
                    </div>
                    <span className="w-5 h-5 rounded-md bg-[#1a263d] text-amber-400 text-[11px] font-bold flex items-center justify-center">
                      {pipeline.pendingQuotes.length}
                    </span>
                  </div>
                  {pipeline.pendingQuotes.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      Nenhum orçamento pendente.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pipeline.pendingQuotes.slice(0, 2).map(o => (
                        <div key={o.id} className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-2.5 text-xs">
                          <div className="flex justify-between text-slate-300 font-medium">
                            <span className="font-mono text-amber-300">ORC-{o.id.slice(-6)}</span>
                            <span className="text-emerald-400 font-bold">{formatCurrency(o.totalValue)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Col 2: Na Fila (Produção) */}
              <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4 flex flex-col justify-between min-h-[160px] shadow-sm hover:border-[#2a3c5d] transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <span>Na Fila (Produção)</span>
                    </div>
                    <span className="w-5 h-5 rounded-md bg-[#1a263d] text-cyan-400 text-[11px] font-bold flex items-center justify-center">
                      {pipeline.inProduction.length}
                    </span>
                  </div>
                  {pipeline.inProduction.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      Fila de produção vazia.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pipeline.inProduction.slice(0, 2).map(o => (
                        <div key={o.id} className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-2.5 text-xs">
                          <div className="flex justify-between text-slate-300 font-medium">
                            <span className="font-mono text-cyan-300">PRD-{o.id.slice(-6)}</span>
                            <span className="text-cyan-400 font-bold">{o.items?.length || 0} itens</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Col 3: A Enviar (Ready to deliver/ship) */}
              <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4 flex flex-col justify-between min-h-[160px] shadow-sm hover:border-[#2a3c5d] transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <Package className="w-4 h-4 text-emerald-400" />
                      <span>A Enviar</span>
                    </div>
                    <span className="w-5 h-5 rounded-md bg-[#1a263d] text-emerald-400 text-[11px] font-bold flex items-center justify-center">
                      {pipeline.readyToShip.length}
                    </span>
                  </div>

                  {pipeline.readyToShip.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      Nenhum pedido aguardando envio.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pipeline.readyToShip.slice(0, 2).map(order => (
                        <div key={order.id} className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-2.5 text-xs hover:border-[#2a3c5d] transition-all">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-emerald-400 font-mono font-bold text-xs">
                                PED-{order.id.slice(-6)}
                              </p>
                              <p className="text-slate-400 text-[11px] truncate max-w-[130px]">
                                {order.customerId ? 'Cliente Cadastrado' : 'Venda Direta'}
                              </p>
                            </div>
                            <span className="text-slate-500 text-[10px] font-mono">
                              {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Col 4: Em Trânsito */}
              <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4 flex flex-col justify-between min-h-[160px] shadow-sm hover:border-[#2a3c5d] transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <Truck className="w-4 h-4 text-purple-400" />
                      <span>Em Trânsito / Concluído</span>
                    </div>
                    <span className="w-5 h-5 rounded-md bg-[#1a263d] text-purple-400 text-[11px] font-bold flex items-center justify-center">
                      {pipeline.inTransit.length}
                    </span>
                  </div>
                  {pipeline.inTransit.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      Nenhum pedido em trânsito.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pipeline.inTransit.slice(0, 2).map(o => (
                        <div key={o.id} className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-2.5 text-xs">
                          <div className="flex justify-between text-slate-300">
                            <span className="font-mono text-purple-300">TRN-{o.id.slice(-6)}</span>
                            <span className="text-emerald-400 font-bold">Finalizado</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'widget_filament_stock':
        return (
          <div key="widget_filament_stock" className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg shadow-black/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1e2a42]/60 mb-4">
              <div className="flex items-center gap-2.5">
                <GripVertical className="w-4 h-4 text-slate-500" />
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Droplets className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Estoque de Filamentos & Insumos</h3>
                  <p className="text-[11px] text-slate-400">Inventário sincronizado e carretéis ativos</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/filaments')}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-bold border border-cyan-500/30 flex items-center gap-1.5 transition-all self-start sm:self-auto"
              >
                <span>Ver Inventário Completo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Carretéis Totais</span>
                <span className="text-xl font-black text-slate-100 font-mono">{filamentInventoryStats.totalSpools}</span>
              </div>
              <div className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Massa em Estoque</span>
                <span className="text-xl font-black text-emerald-400 font-mono">{filamentInventoryStats.totalWeightKg} <span className="text-xs font-normal">kg</span></span>
              </div>
              <div className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Capital Imobilizado</span>
                <span className="text-xl font-black text-cyan-400 font-mono">{formatCurrency(filamentInventoryStats.totalInvested)}</span>
              </div>
              <div className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Alerta Crítico (≤20%)</span>
                <span className={`text-xl font-black font-mono ${filamentInventoryStats.lowStockCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {filamentInventoryStats.lowStockCount} carretéis
                </span>
              </div>
            </div>
          </div>
        );

      case 'widget_supplies_stock':
        return (
          <div key="widget_supplies_stock" className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg shadow-black/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1e2a42]/60 mb-4">
              <div className="flex items-center gap-2.5">
                <GripVertical className="w-4 h-4 text-slate-500" />
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <PackageCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Estoque de Insumos & Componentes</h3>
                  <p className="text-[11px] text-slate-400">Hardware, argolas, ímãs, botões clicker e acessórios</p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={() => navigate('/supplies')}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5 transition-all"
                >
                  <span>Gerenciar Insumos</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Itens Cadastrados</span>
                <span className="text-xl font-black text-slate-100 font-mono">{suppliesInventoryStats.totalItems}</span>
              </div>
              <div className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Unidades em Estoque</span>
                <span className="text-xl font-black text-cyan-400 font-mono">
                  {suppliesInventoryStats.totalUnits.toLocaleString('pt-BR')} <span className="text-xs font-normal">un</span>
                </span>
              </div>
              <div className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Capital Investido</span>
                <span className="text-xl font-black text-emerald-400 font-mono">{formatCurrency(suppliesInventoryStats.totalInvested)}</span>
              </div>
              <div className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Reposição Necessária</span>
                <span className={`text-xl font-black font-mono ${suppliesInventoryStats.lowStockCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {suppliesInventoryStats.lowStockCount} {suppliesInventoryStats.lowStockCount === 1 ? 'item' : 'itens'}
                </span>
              </div>
            </div>

            {/* Lista rápida de itens com estoque crítico ou feedback de segurança */}
            {suppliesInventoryStats.criticalItems.length > 0 ? (
              <div className="bg-[#0b111e]/70 border border-amber-500/20 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Insumos com Estoque Baixo ou Esgotado</span>
                  </div>
                  <button 
                    onClick={() => navigate('/supplies')}
                    className="text-[11px] text-amber-400/90 hover:text-amber-300 underline font-semibold"
                  >
                    Abrir lista de reposição
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {suppliesInventoryStats.criticalItems.map(item => (
                    <div key={item.id} className="bg-[#121927] border border-[#1e2a42] rounded-lg p-2.5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-bold text-slate-200 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{item.category}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                          item.quantity === 0 
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {item.quantity} / {item.minQuantity} un
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : suppliesInventoryStats.totalItems === 0 ? (
              <div className="text-center py-4 text-xs text-slate-500 bg-[#0b111e]/40 rounded-xl border border-dashed border-[#1e2a42]">
                Nenhum insumo cadastrado ainda. Cadastre argolas, ímãs e botões para monitorar estoque e custos.
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3.5 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Todos os insumos cadastrados estão com estoque seguro acima do nível mínimo.</span>
              </div>
            )}
          </div>
        );

      case 'chart_profit_evolution':
        return (
          <div key="chart_profit_evolution" className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg shadow-black/20 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-200">Evolução do Lucro</h3>
              </div>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                Últimos 4 meses
              </span>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={profitEvolutionData}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.45}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e2a42" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11 }} 
                  />
                  <YAxis 
                    domain={[0, 80]}
                    ticks={[0, 20, 40, 60, 80]}
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11 }} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0b111e', 
                      border: '1px solid #1e2a42', 
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#f8fafc',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                    }} 
                    formatter={(val: any) => [`R$ ${val},00`, 'Lucro']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="lucro" 
                    stroke="#06b6d4" 
                    strokeWidth={2.5}
                    fill="url(#profitGrad)"
                    dot={{ r: 4, fill: '#06b6d4', stroke: '#121927', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#38bdf8' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'chart_cost_breakdown':
        return (
          <div key="chart_cost_breakdown" className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg shadow-black/20 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-200">Custos de Produção</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {formatCurrency(stats.productionCost)}
              </span>
            </div>
            
            {stats.productionCost === 0 ? (
              <div className="h-44 w-full flex flex-col items-center justify-center text-slate-500 text-xs">
                <Activity className="w-8 h-8 mb-2 opacity-30 text-slate-400" />
                <span>Nenhum custo registrado no período</span>
              </div>
            ) : (
              <div className="h-44 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costDonutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="#121927"
                      strokeWidth={2}
                    >
                      {costDonutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#0b111e', 
                        border: '1px solid #1e2a42', 
                        borderRadius: '12px',
                        fontSize: '11px',
                        color: '#f8fafc'
                      }}
                      formatter={(val: any) => [`R$ ${val}`, 'Custo']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="flex items-center justify-center gap-3 pt-2 text-[11px] text-slate-400 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                <span>Deprec.</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#06b6d4]" />
                <span>Energia</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#f97316]" />
                <span>Extras</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                <span>Filamento</span>
              </div>
            </div>
          </div>
        );

      case 'list_top_products':
        return (
          <div key="list_top_products" className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg shadow-black/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-200">Top Produtos (R$)</h3>
                </div>
                <span className="text-[11px] text-slate-500">Ranking</span>
              </div>

              {topProducts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Nenhum produto vendido no período.
                </div>
              ) : (
                <div className="space-y-3">
                  {topProducts.map((prod, idx) => {
                    const pct = (prod.revenue / maxProductRevenue) * 100;
                    return (
                      <div 
                        key={idx}
                        className="p-3 rounded-xl bg-[#0b111e] border border-[#1e2a42]/80 hover:border-[#2a3c5d] transition-all space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <span className={`w-5 h-5 rounded-md text-xs font-black flex items-center justify-center shrink-0 ${
                              idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                              idx === 1 ? 'bg-slate-500/20 text-slate-300' :
                              'bg-amber-700/20 text-amber-500'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {prod.name}
                            </span>
                          </div>
                          <span className="text-xs font-bold font-mono text-emerald-400 shrink-0">
                            {formatCurrency(prod.revenue)}
                          </span>
                        </div>
                        <div className="w-full bg-[#1e2a42] h-1.5 rounded-full overflow-hidden">
                          <div className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );

      case 'chart_sales_channel':
        return (
          <div key="chart_sales_channel" className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg shadow-black/20 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-200">Vendas por Canal</h3>
              </div>
              <span className="text-[11px] text-slate-500">Distribuição</span>
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByChannelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e2a42" />
                  <XAxis dataKey="channel" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0b111e', border: '1px solid #1e2a42', borderRadius: '12px', fontSize: '11px', color: '#f8fafc' }}
                    formatter={(val: any) => [`R$ ${val},00`, 'Total']}
                  />
                  <Bar dataKey="total" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'list_printers_status':
        return (
          <div key="list_printers_status" className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg shadow-black/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                  <Monitor className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-slate-200">Top Impressoras</h3>
                </div>
                <button 
                  onClick={() => navigate('/printers')}
                  className="text-[11px] text-purple-400 hover:underline font-semibold"
                >
                  Ver parque
                </button>
              </div>

              {topPrintersList.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Nenhuma impressora cadastrada.
                </div>
              ) : (
                <div className="space-y-3">
                  {topPrintersList.map((printer) => (
                    <div 
                      key={printer.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#0b111e] border border-[#1e2a42]/80 hover:border-[#2a3c5d] transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                        <div>
                          <p className="text-xs font-bold text-slate-200">{printer.name}</p>
                          <p className="text-[10px] text-slate-500">Status: {printer.status}</p>
                        </div>
                      </div>
                      <span className="text-sm font-black font-mono text-purple-400">
                        {printer.hours}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'list_failures':
        return (
          <div key="list_failures" className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-5 shadow-lg shadow-black/20 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <h3 className="text-sm font-bold text-slate-200">Top Falhas & Perdas</h3>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-rose-400">
                    {failuresStats.count} Falhas
                  </span>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Perda: {formatCurrency(failuresStats.totalCost)}
                  </p>
                </div>
              </div>

              {failures.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Nenhuma falha de impressão registrada.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {failures.slice(0, 3).map((fail, idx) => (
                    <div 
                      key={fail.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#0b111e] border border-[#1e2a42]/80 hover:border-rose-500/30 transition-all text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className="w-4 h-4 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-200 truncate">{fail.printerName}</p>
                          <p className="text-[10px] text-slate-400 truncate">{fail.reason}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-bold text-rose-400 text-xs">
                          {formatCurrency(fail.costLost)}
                        </span>
                        <button 
                          onClick={() => handleDeleteFailure(fail.id)}
                          className="text-slate-600 hover:text-rose-400 p-0.5"
                          title="Excluir registro"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setIsFailureModalOpen(true)}
              className="w-full mt-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Registrar Nova Falha</span>
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Top Header matching ERP graphite reference */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
        {/* Left: Title & Subtitle */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-sm">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Dashboard
            </h1>
            <p className="text-xs text-slate-400">Visão consolidada do seu negócio de impressão 3D</p>
          </div>
        </div>

        {/* Right Controls: Period Filter, Personalizar, Registrar Falha, Bell */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Period selector */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-[#121927] border border-[#1e2a42] rounded-xl px-3 py-1.5 text-xs text-slate-300 gap-2 shadow-sm">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <button 
                onClick={handlePrevMonth}
                className="hover:text-white transition-colors p-0.5 rounded"
                title="Mês anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <span className="capitalize font-semibold text-slate-200 select-none px-1">
                {monthLabel}
              </span>
              <button 
                onClick={handleNextMonth}
                className="hover:text-white transition-colors p-0.5 rounded"
                title="Próximo mês"
              >
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </div>

            {!isCurrentMonth && (
              <button
                onClick={handleCurrentMonth}
                className="px-2.5 py-1.5 text-[11px] font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl transition-all shadow-sm active:scale-95 animate-in fade-in"
                title="Voltar para o mês vigente"
              >
                Mês Atual
              </button>
            )}
          </div>

          {/* Action button: Personalizar Cards */}
          <button
            onClick={() => setIsCustomizeModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1e2a42] bg-[#121927] hover:bg-[#1a263d] text-slate-300 hover:text-white text-xs font-semibold transition-all shadow-sm active:scale-95"
            title="Personalizar cards e ordem do dashboard"
          >
            <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Personalizar</span>
          </button>

          {/* Action button: Registrar Falha */}
          <button
            onClick={() => setIsFailureModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold transition-all shadow-sm active:scale-95"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Registrar Falha</span>
          </button>

          {/* Plan validity badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121927] border border-[#1e2a42] text-[11px] font-medium text-slate-400 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>PLANO ATIVO ATÉ <strong className="text-slate-200">{planValidityDate}</strong></span>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <button 
              onClick={() => setNotificationOpen(!notificationOpen)}
              className="w-8 h-8 rounded-xl bg-[#121927] border border-[#1e2a42] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              title="Notificações"
            >
              <Bell className="w-4 h-4" />
            </button>
            {notificationOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-[#121927] border border-[#1e2a42] rounded-2xl p-4 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-[#1e2a42]">
                  <span className="text-xs font-bold text-slate-200">Notificações</span>
                  <span className="text-[10px] text-emerald-400 font-bold">1 Nova</span>
                </div>
                <div className="py-2.5 space-y-2">
                  <div className="text-xs text-slate-300">
                    <p className="font-semibold text-emerald-400">Sistema 100% Sincronizado</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Suas impressoras e pedidos estão atualizados no Supabase.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Cards Grid rendered according to cardsConfig order & visibility */}
      <div className="space-y-6">
        {cardsConfig
          .filter(c => c.visible)
          .map(c => {
            // For middle charts & bottom rows, group them cleanly or render modularly
            if (c.id === 'chart_profit_evolution' || c.id === 'chart_cost_breakdown' || c.id === 'list_top_products') {
              return null;
            }
            if (c.id === 'chart_sales_channel' || c.id === 'list_printers_status' || c.id === 'list_failures') {
              return null;
            }
            return renderCardById(c.id);
          })}

        {/* Middle Row Charts (Evolução do Lucro, Custos de Produção, Top Produtos) */}
        {(isCardVisible('chart_profit_evolution') || isCardVisible('chart_cost_breakdown') || isCardVisible('list_top_products')) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {isCardVisible('chart_profit_evolution') && (
              <div className="lg:col-span-5">
                {renderCardById('chart_profit_evolution')}
              </div>
            )}
            {isCardVisible('chart_cost_breakdown') && (
              <div className={isCardVisible('chart_profit_evolution') ? 'lg:col-span-4' : 'lg:col-span-6'}>
                {renderCardById('chart_cost_breakdown')}
              </div>
            )}
            {isCardVisible('list_top_products') && (
              <div className={!isCardVisible('chart_profit_evolution') ? 'lg:col-span-6' : 'lg:col-span-3'}>
                {renderCardById('list_top_products')}
              </div>
            )}
          </div>
        )}

        {/* Bottom Row (Vendas por Canal, Top Impressoras, Top Falhas) */}
        {(isCardVisible('chart_sales_channel') || isCardVisible('list_printers_status') || isCardVisible('list_failures')) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {isCardVisible('chart_sales_channel') && (
              <div className="lg:col-span-4">
                {renderCardById('chart_sales_channel')}
              </div>
            )}
            {isCardVisible('list_printers_status') && (
              <div className="lg:col-span-4">
                {renderCardById('list_printers_status')}
              </div>
            )}
            {isCardVisible('list_failures') && (
              <div className="lg:col-span-4">
                {renderCardById('list_failures')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Personalizar Cards do Dashboard (Etapa 2) */}
      {isCustomizeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-[#1e2a42] mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Settings2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Personalizar Dashboard</h3>
                  <p className="text-xs text-slate-400">Ative, oculte e organize os cards conforme sua rotina</p>
                </div>
              </div>
              <button 
                onClick={() => setIsCustomizeModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {cardsConfig.map((card, idx) => (
                <div
                  key={card.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    card.visible 
                      ? 'bg-[#0b111e] border-[#1e2a42]' 
                      : 'bg-[#0b111e]/40 border-[#1e2a42]/40 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => handleToggleCard(card.id)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        card.visible 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                      title={card.visible ? 'Ocultar card' : 'Mostrar card'}
                    >
                      {card.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${card.visible ? 'text-slate-200' : 'text-slate-500'}`}>
                        {card.title}
                      </p>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                        {card.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMoveCard(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 rounded-lg bg-[#121927] hover:bg-[#1e2a42] text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Mover para cima"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveCard(idx, 'down')}
                      disabled={idx === cardsConfig.length - 1}
                      className="p-1.5 rounded-lg bg-[#121927] hover:bg-[#1e2a42] text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title="Mover para baixo"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#1e2a42] mt-4">
              <button
                onClick={handleResetDefaultLayout}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Padrão</span>
              </button>
              <button
                onClick={() => setIsCustomizeModalOpen(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-600 text-slate-950 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Falha de Impressão */}
      {isFailureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#1e2a42] mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Registrar Falha de Impressão</h3>
                  <p className="text-xs text-slate-400">Controle de perda de filamento, horas de máquina e sucata</p>
                </div>
              </div>
              <button 
                onClick={() => setIsFailureModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFailure} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Impressora</label>
                <select
                  value={failPrinter}
                  onChange={(e) => setFailPrinter(e.target.value)}
                  className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Selecione a impressora (ou genérica)</option>
                  {printers.map(p => (
                    <option key={p.id} value={p.id}>{p.brand} {p.model} ({p.power}W)</option>
                  ))}
                  {printers.length === 0 && (
                    <>
                      <option value="Bambu 01">Bambu 01 (350W)</option>
                      <option value="Ender 3 S1">Ender 3 S1 (280W)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Motivo da Falha</label>
                <select
                  value={failReason}
                  onChange={(e) => setFailReason(e.target.value)}
                  className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {FAILURE_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Filamento Perdido</label>
                <select
                  value={failFilament}
                  onChange={(e) => setFailFilament(e.target.value)}
                  className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Selecione o carretel (ou padrão R$ 120/kg)</option>
                  {filaments.map(f => (
                    <option key={f.id} value={f.id}>{f.brand} {f.material} - {f.colorName} ({formatCurrency(f.pricePaid)}/{f.weight}g)</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Peso Perdido (gramas)</label>
                  <input
                    type="number"
                    min="1"
                    value={failGrams}
                    onChange={(e) => setFailGrams(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Ex: 50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tempo Perdido (horas)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={failHours}
                    onChange={(e) => setFailHours(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Ex: 2.5"
                  />
                </div>
              </div>

              {/* Dynamic Cost summary banner */}
              <div className="bg-[#0b111e] border border-rose-500/30 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Prejuízo Calculado</p>
                  <p className="text-xs text-slate-400">Material + Energia + Desgaste</p>
                </div>
                <span className="text-lg font-black font-mono text-rose-400">
                  {formatCurrency(calculatedFailCost)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Observações (opcional)</label>
                <textarea
                  rows={2}
                  value={failNotes}
                  onChange={(e) => setFailNotes(e.target.value)}
                  className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  placeholder="Ex: Peça soltou da mesa após 3h..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1e2a42]">
                <button
                  type="button"
                  onClick={() => setIsFailureModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
                >
                  Salvar Registro de Falha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
