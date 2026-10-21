import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Order, OrderStatus, PaymentMethod, OrderItem, Customer, FinancialConfig, PricingBreakdown } from '../types';
import { supabase } from '../services/supabase';
import { formatCurrency, calculatePartCosts } from '../constants';
import { STATUS_LIST, getStatusConfig, normalizeOrderStatus, isOrderActive } from '../utils/statusUtils';
import { calculateSalePrice } from '../utils/pricingCalculator';
import { 
  Plus, Search, Trash2, ShoppingBag, X, User as UserIcon, Minus, 
  ChevronDown, ChevronUp, Package, Tag, Loader2, CreditCard, Banknote, 
  QrCode, MessageCircle, Printer as PrinterIcon, Edit2, CheckCircle2, UserPlus, 
  Wrench, AlertCircle, FileText, Calculator, TrendingUp, SlidersHorizontal, 
  AlertTriangle, Percent, DollarSign, Clock, ShieldAlert, Sparkles
} from 'lucide-react';
import { QuotePdfModal } from '../components/QuotePdfModal';
import { PricingCalculatorModal } from '../components/PricingCalculatorModal';

export const Orders: React.FC = () => {
  const { orders, refreshData, customers, parts, filaments, printers, settings, user } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPricingCalculatorOpen, setIsPricingCalculatorOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'All'>('All');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<{ type: 'warning' | 'error' | 'success'; message: string } | null>(null);

  // Quick Customer Creation inline
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Custom Item inline adding
  const [isCustomItemOpen, setIsCustomItemOpen] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState<number | ''>('');
  const [customItemQty, setCustomItemQty] = useState<number | ''>(1);

  // Printable Receipt Modal
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  // Quote PDF Modal
  const [quoteModalOrder, setQuoteModalOrder] = useState<Order | null>(null);

  // Form de Pedido com Status Completo
  const [orderForm, setOrderForm] = useState<{
    customerId: string;
    items: OrderItem[];
    discount: number;
    paymentMethod: PaymentMethod;
    status: OrderStatus;
  }>({
    customerId: '',
    items: [],
    discount: 0,
    paymentMethod: PaymentMethod.PIX,
    status: OrderStatus.QUEUE
  });

  // Configurações Financeiras Avançadas da Venda Atual (pricingCalculator)
  const [financialForm, setFinancialForm] = useState<FinancialConfig>({
    embalagem: settings.defaultPackagingCost ?? 2.50,
    outrosCustos: settings.defaultOtherCosts ?? 0.00,
    taxaPagamento: settings.defaultPaymentFeePercent ?? 3.99,
    comissaoMarketplace: settings.defaultMarketplaceFeePercent ?? 0.00,
    imposto: settings.defaultTaxPercent ?? 6.00,
    margemLucro: settings.defaultProfitMargin ?? 100,
    arredondamentoComercial: false
  });
  const [showAdvancedPricing, setShowAdvancedPricing] = useState(false);

  const location = useLocation();

  // Abrir modal de novo pedido automaticamente se veio da tela de Clientes
  useEffect(() => {
    const state = location.state as { customerId?: string; openNew?: boolean } | null;
    if (state?.openNew && state?.customerId) {
      setEditingOrderId(null);
      setFormError(null);
      setOrderForm({
        customerId: state.customerId,
        items: [],
        discount: 0,
        paymentMethod: PaymentMethod.PIX,
        status: OrderStatus.QUEUE
      });
      setIsQuickCustomerOpen(false);
      setIsCustomItemOpen(false);
      setIsModalOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const toggleExpand = (id: string) => {
    setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const normalized = normalizeOrderStatus(o.status);
      if (filterStatus === 'All') {
        return normalized !== OrderStatus.DELIVERED && normalized !== OrderStatus.CANCELLED;
      }
      return normalized === filterStatus;
    }).filter(o => {
      const customer = customers.find(c => c.id === o.customerId);
      const customerName = customer?.name || 'Cliente Balcão';
      const matchesCustomer = customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesItem = (o.items || []).some(item => {
        const part = parts.find(p => p.id === item.partId);
        return (part?.name || item.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      });
      return matchesCustomer || matchesItem;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, customers, parts, searchTerm, filterStatus]);

  const orderSubtotal = useMemo(() => {
    return (orderForm.items || []).reduce((sum, item) => sum + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)), 0);
  }, [orderForm.items]);

  const orderTotal = useMemo(() => {
    return Math.max(0, orderSubtotal - (Number(orderForm.discount) || 0));
  }, [orderSubtotal, orderForm.discount]);

  // Custo de fabricação 3D dos itens selecionados no formulário
  const itemsProductionCost = useMemo(() => {
    return (orderForm.items || []).reduce((sum, item) => {
      const part = parts.find(p => p.id === item.partId);
      if (!part) return sum + ((Number(item.unitPrice) || 0) * 0.4 * (Number(item.quantity) || 1));
      const costInfo = calculatePartCosts(part, filaments, printers, settings);
      const unitCost = costInfo.totalCost > 0 ? costInfo.totalCost : ((Number(item.unitPrice) || 0) * 0.4);
      return sum + (unitCost * (Number(item.quantity) || 1));
    }, 0);
  }, [orderForm.items, parts, filaments, printers, settings]);

  // Quantidade total de itens no pedido
  const orderTotalQuantity = useMemo(() => {
    return (orderForm.items || []).reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
  }, [orderForm.items]);

  // Cálculo avançado da formação de preço, lucro líquido e margem real (sem duplicar lucro do catálogo)
  const pricingBreakdown = useMemo(() => {
    return calculateSalePrice({
      custoProducao: itemsProductionCost,
      precoTabelaOriginal: orderSubtotal, // Usa o preço já estabelecido das peças
      quantidade: Math.max(1, orderTotalQuantity),
      embalagem: financialForm.embalagem,
      embalagemPorUnidade: financialForm.embalagemPorUnidade ?? true,
      outrosCustos: financialForm.outrosCustos,
      imposto: financialForm.imposto,
      taxaPagamento: financialForm.taxaPagamento,
      comissaoMarketplace: financialForm.comissaoMarketplace,
      margemLucro: financialForm.margemLucro,
      desconto: Number(orderForm.discount) || 0,
      arredondamentoComercial: financialForm.arredondamentoComercial,
      repassarTaxas: financialForm.repassarTaxas
    });
  }, [itemsProductionCost, orderSubtotal, orderTotalQuantity, financialForm, orderForm.discount]);

  const applySuggestedPriceToItems = () => {
    if (!orderForm.items || orderForm.items.length === 0) return;
    const totalTaxas = (financialForm.imposto + financialForm.taxaPagamento + financialForm.comissaoMarketplace) / 100;
    if (totalTaxas >= 1) return;
    const fator = 1 / (1 - totalTaxas);
    setOrderForm(prev => ({
      ...prev,
      items: prev.items.map(item => {
        const part = parts.find(p => p.id === item.partId);
        const basePrice = part ? calculatePartCosts(part, filaments, printers, settings).suggestedPrice : (Number(item.unitPrice) || 0);
        const newUnitPrice = Number((basePrice * fator).toFixed(2));
        return {
          ...item,
          unitPrice: Math.max(0.01, newUnitPrice)
        };
      })
    }));
  };

  const openNewOrderModal = () => {
    setEditingOrderId(null);
    setFormError(null);
    setOrderForm({
      customerId: customers[0]?.id || '',
      items: [],
      discount: 0,
      paymentMethod: PaymentMethod.PIX,
      status: OrderStatus.QUEUE
    });
    setFinancialForm({
      embalagem: settings.defaultPackagingCost ?? 2.50,
      outrosCustos: settings.defaultOtherCosts ?? 0.00,
      taxaPagamento: settings.defaultPaymentFeePercent ?? 3.99,
      comissaoMarketplace: settings.defaultMarketplaceFeePercent ?? 0.00,
      imposto: settings.defaultTaxPercent ?? 6.00,
      margemLucro: settings.defaultProfitMargin ?? 100,
      arredondamentoComercial: false
    });
    setShowAdvancedPricing(false);
    setIsQuickCustomerOpen(false);
    setIsCustomItemOpen(false);
    setIsModalOpen(true);
  };

  const openEditOrderModal = (order: Order) => {
    setEditingOrderId(order.id);
    setFormError(null);
    setOrderForm({
      customerId: order.customerId || '',
      items: (order.items || []).map(i => ({ ...i })),
      discount: order.discount || 0,
      paymentMethod: order.paymentMethod || PaymentMethod.PIX,
      status: normalizeOrderStatus(order.status)
    });
    if (order.custosFinanceiros) {
      setFinancialForm({ ...order.custosFinanceiros });
    } else {
      setFinancialForm({
        embalagem: settings.defaultPackagingCost ?? 2.50,
        outrosCustos: settings.defaultOtherCosts ?? 0.00,
        taxaPagamento: settings.defaultPaymentFeePercent ?? 3.99,
        comissaoMarketplace: settings.defaultMarketplaceFeePercent ?? 0.00,
        imposto: settings.defaultTaxPercent ?? 6.00,
        margemLucro: settings.defaultProfitMargin ?? 100,
        arredondamentoComercial: false
      });
    }
    setShowAdvancedPricing(false);
    setIsQuickCustomerOpen(false);
    setIsCustomItemOpen(false);
    setIsModalOpen(true);
  };

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCustomerName.trim() || !user) return;
    setIsSavingCustomer(true);
    setFormError(null);

    try {
      const newCust = {
        name: quickCustomerName.trim(),
        phone: quickCustomerPhone.trim() || 'Sem telefone',
        email: '',
        notes: 'Cadastrado direto no Pedido',
        user_id: user.id,
        createdAt: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('customers')
        .insert([newCust])
        .select()
        .single();

      if (error) throw error;

      await refreshData();
      if (data?.id) {
        setOrderForm(prev => ({ ...prev, customerId: data.id }));
      }
      setQuickCustomerName('');
      setQuickCustomerPhone('');
      setIsQuickCustomerOpen(false);
    } catch (err: any) {
      alert('Erro ao criar cliente: ' + (err.message || 'Verifique a tabela customers'));
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const addCustomItemToOrder = () => {
    if (!customItemName.trim() || customItemPrice === '') return;
    const newItem: OrderItem = {
      partId: `custom_${Date.now()}`,
      name: customItemName.trim(),
      quantity: Math.max(1, Math.round(Number(customItemQty) || 1)),
      unitPrice: Number(customItemPrice) || 0
    };

    setOrderForm(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));

    setCustomItemName('');
    setCustomItemPrice('');
    setCustomItemQty(1);
    setIsCustomItemOpen(false);
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setFormError(null);

    if (!orderForm.items || orderForm.items.length === 0) {
      setFormError('Selecione pelo menos uma peça ou adicione um item avulso.');
      return;
    }

    if (!user) {
      setFormError('Sessão de usuário não encontrada. Por favor, recarregue a página.');
      return;
    }

    setIsSaving(true);

    try {
      // Validação estrita de UUID para o campo customerId no PostgreSQL
      const isValidUUID = (str?: string | null) => 
        Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

      const safeCustomerId = isValidUUID(orderForm.customerId) ? orderForm.customerId : null;

      // Sanitiza itens garantindo que a quantidade seja inteira e positiva
      const sanitizedItems = (orderForm.items || []).map(item => ({
        ...item,
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
        unitPrice: Math.max(0, Number(item.unitPrice) || 0)
      }));

      // 1. Salvar ou Atualizar pedido no Supabase PRIMEIRO
      const basePayload: any = {
        customerId: safeCustomerId,
        items: sanitizedItems,
        totalValue: Number(orderTotal) || 0,
        status: orderForm.status || OrderStatus.QUEUE,
        user_id: user.id
      };

      if (!editingOrderId) {
        basePayload.createdAt = new Date().toISOString();
      }

      // Tentativa 1: Payload completo com todos os novos campos
      let fullPayload = {
        ...basePayload,
        discount: Number(orderForm.discount) || 0,
        paymentMethod: orderForm.paymentMethod || PaymentMethod.PIX,
        custosFinanceiros: financialForm,
        detalhesPrecificacao: pricingBreakdown,
        payments: [{
          id: Math.random().toString(36).substring(2, 9),
          amount: Number(orderTotal) || 0,
          date: new Date().toISOString(),
          method: orderForm.paymentMethod || PaymentMethod.PIX
        }]
      };

      const executeSave = async (dataToSave: any) => {
        if (editingOrderId) {
          return await supabase.from('orders').update(dataToSave).eq('id', editingOrderId);
        } else {
          return await supabase.from('orders').insert([dataToSave]);
        }
      };

      let saveResult = await executeSave(fullPayload);

      // Se falhar devido a coluna ausente (PGRST204) no PostgREST cache, aplica fallback dinâmico
      if (saveResult.error && (saveResult.error.code === 'PGRST204' || saveResult.error.message?.includes('column'))) {
        console.warn('Detectada coluna ausente em orders no Supabase, aplicando fallback resiliente:', saveResult.error.message);
        const retryPayload = { ...fullPayload };

        if (saveResult.error.message?.includes('custosFinanceiros') || saveResult.error.message?.includes('custos_financeiros')) {
          delete retryPayload.custosFinanceiros;
        }
        if (saveResult.error.message?.includes('detalhesPrecificacao') || saveResult.error.message?.includes('detalhes_precificacao')) {
          delete retryPayload.detalhesPrecificacao;
        }
        if (saveResult.error.message?.includes('discount')) {
          delete retryPayload.discount;
        }
        if (saveResult.error.message?.includes('paymentMethod')) {
          delete retryPayload.paymentMethod;
        }
        if (saveResult.error.message?.includes('payments')) {
          delete retryPayload.payments;
        }

        saveResult = await executeSave(retryPayload);

        // Se ainda falhar com outro campo não suportado, salva com o payload essencial garantido
        if (saveResult.error && (saveResult.error.code === 'PGRST204' || saveResult.error.message?.includes('column'))) {
          console.warn('Salvando com payload mínimo garantido:', saveResult.error.message);
          saveResult = await executeSave(basePayload);
        }
      }

      // Se o pedido não foi salvo, NÃO prosseguir para a baixa de estoque
      if (saveResult.error) {
        throw new Error(saveResult.error.message || 'Falha ao salvar pedido no Supabase.');
      }

      // 2. Com o pedido CONFIRMADO como salvo, realizar baixa de filamentos APENAS em novos pedidos
      let filamentWarning: string | null = null;

      if (!editingOrderId) {
        const filamentDeductions: Record<string, number> = {};

        sanitizedItems.forEach(orderItem => {
          const part = parts.find(p => p.id === orderItem.partId);
          if (!part) return;

          if (part.recipe && part.recipe.length > 0) {
            part.recipe.forEach(recipeItem => {
              const grams = (recipeItem.grams || 0) * (orderItem.quantity || 1);
              filamentDeductions[recipeItem.filamentId] = (filamentDeductions[recipeItem.filamentId] || 0) + grams;
            });
          } else if (Number(part.weight) > 0 && filaments.length > 0) {
            const matchedFilament = filaments.find(f => f.material.toLowerCase() === (part.material || 'PLA').toLowerCase()) || filaments[0];
            if (matchedFilament) {
              const grams = Number(part.weight) * (orderItem.quantity || 1);
              filamentDeductions[matchedFilament.id] = (filamentDeductions[matchedFilament.id] || 0) + grams;
            }
          }
        });

        const deductionEntries = Object.entries(filamentDeductions);
        if (deductionEntries.length > 0) {
          const updatePromises = deductionEntries.map(async ([filamentId, usedGrams]) => {
            const current = filaments.find(f => f.id === filamentId);
            const currentWeight = current?.remainingWeight ?? current?.weight ?? 1000;
            const newWeight = Math.max(0, currentWeight - usedGrams);

            const { error: updateError } = await supabase
              .from('filaments')
              .update({ remainingWeight: newWeight })
              .eq('id', filamentId);

            return { filamentId, error: updateError };
          });

          const results = await Promise.all(updatePromises);
          const failedUpdates = results.filter(r => r.error);

          if (failedUpdates.length > 0) {
            console.warn('Falha ao atualizar estoque de filamento no Supabase:', failedUpdates);
            filamentWarning = 'O pedido foi registrado com sucesso! Porém, ocorreu uma falha ao atualizar o estoque de filamento no Supabase. Por favor, confira o estoque na aba Filamentos.';
          }
        }
      }

      // 3. Atualizar dados na memória com o estado real confirmado pelo Supabase
      await refreshData();

      // Fechar modal
      setIsModalOpen(false);
      setEditingOrderId(null);

      // Exibir aviso se houve falha no estoque, ou limpar aviso anterior
      if (filamentWarning) {
        setPageNotice({ type: 'warning', message: filamentWarning });
      } else {
        setPageNotice(null);
      }
    } catch (err: any) {
      console.error('Erro salvar pedido:', err);
      setFormError(err.message || 'Erro ao comunicar com o banco de dados.');
    } finally {
      setIsSaving(false);
    }
  };

  const addCatalogPart = (partId: string) => {
    const part = parts.find(p => p.id === partId);
    if (!part) return;
    const costs = calculatePartCosts(part, filaments, printers, settings);
    const existing = orderForm.items.find(i => i.partId === partId);
    if (existing) {
      setOrderForm({
        ...orderForm,
        items: orderForm.items.map(i => i.partId === partId ? { ...i, quantity: i.quantity + 1 } : i)
      });
    } else {
      setOrderForm({
        ...orderForm,
        items: [...orderForm.items, { partId, name: part.name, quantity: 1, unitPrice: costs.suggestedPrice }]
      });
    }
  };

  const setItemQuantity = (partId: string, quantity: number) => {
    setOrderForm(prev => ({
      ...prev,
      items: prev.items.map(i => i.partId === partId ? { ...i, quantity } : i)
    }));
  };

  const updateItemQuantity = (partId: string, delta: number) => {
    const existing = orderForm.items.find(i => i.partId === partId);
    if (!existing) return;
    const currentQty = Number(existing.quantity) || 1;
    const newQty = currentQty + delta;
    if (newQty <= 0) {
      deleteItem(partId);
    } else {
      setOrderForm(prev => ({
        ...prev,
        items: prev.items.map(i => i.partId === partId ? { ...i, quantity: newQty } : i)
      }));
    }
  };

  const updateItemPrice = (partId: string, price: number) => {
    setOrderForm({
      ...orderForm,
      items: orderForm.items.map(i => i.partId === partId ? { ...i, unitPrice: Math.max(0, price) } : i)
    });
  };

  const deleteItem = (partId: string) => {
    setOrderForm({
      ...orderForm,
      items: orderForm.items.filter(i => i.partId !== partId)
    });
  };

  const updateStatus = async (id: string, status: OrderStatus) => {
    await supabase.from('orders').update({ status }).eq('id', id);
    refreshData();
  };

  const deleteOrder = async (id: string) => {
    if (confirm('Excluir este pedido permanentemente?')) {
      await supabase.from('orders').delete().eq('id', id);
      refreshData();
    }
  };

  const sendWhatsAppMessage = (order: Order) => {
    const customer = customers.find(c => c.id === order.customerId);
    const phone = customer?.phone ? customer.phone.replace(/\D/g, '') : '';
    
    const itemsText = (order.items || []).map(i => {
      const part = parts.find(p => p.id === i.partId);
      const name = i.name || part?.name || 'Peça 3D';
      return `• ${i.quantity}x ${name} - ${formatCurrency(i.unitPrice * i.quantity)}`;
    }).join('\n');

    const msg = `*PRINTFLOW 3D - PEDIDO #${order.id.slice(0, 5).toUpperCase()}*\n\n` +
      `Olá ${customer?.name || 'Cliente'}! Segue o resumo do seu pedido:\n\n` +
      `${itemsText}\n\n` +
      `Subtotal: ${formatCurrency((order.items || []).reduce((s, i) => s + (i.unitPrice * i.quantity), 0))}\n` +
      (order.discount > 0 ? `Desconto: - ${formatCurrency(order.discount)}\n` : '') +
      `*Total Final:* ${formatCurrency(order.totalValue)}\n` +
      `*Forma de Pagamento:* ${order.paymentMethod || 'Pix'}\n` +
      `*Status Atual:* ${order.status}\n\n` +
      `Obrigado pela preferência! Qualquer dúvida estamos à disposição.`;

    const encoded = encodeURIComponent(msg);
    if (phone && phone.length >= 10) {
      window.open(`https://wa.me/55${phone}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  const getStatusColor = (status: OrderStatus | string) => {
    return getStatusConfig(status).badgeClass;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Produção & Pedidos</h2>
          <p className="text-zinc-500">Gestão de vendas, encomendas e status de entrega</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button 
            type="button"
            onClick={() => setIsPricingCalculatorOpen(true)} 
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700/80 px-3.5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-sm transition active:scale-95"
            title="Calculadora Financeira Avançada de Venda (pricingCalculator)"
          >
            <Calculator className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Calculadora Financeira</span>
            <span className="sm:hidden">Calc</span>
          </button>
          <button 
            onClick={openNewOrderModal} 
            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-sm"
          >
            <Plus className="w-5 h-5" /> Nova Venda
          </button>
        </div>
      </div>

      {/* Banner de Aviso de Estoque ou Operação */}
      {pageNotice && (
        <div className={`p-4 rounded-2xl flex items-start justify-between gap-3 text-sm animate-in fade-in duration-200 ${
          pageNotice.type === 'warning' 
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
            : pageNotice.type === 'error'
            ? 'bg-red-500/10 border border-red-500/30 text-red-300'
            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
        }`}>
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-bold text-xs uppercase tracking-wider text-amber-400">
                {pageNotice.type === 'warning' ? 'Atenção com o Estoque de Filamento' : 'Aviso do Sistema'}
              </p>
              <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">{pageNotice.message}</p>
            </div>
          </div>
          <button 
            onClick={() => setPageNotice(null)} 
            className="text-zinc-400 hover:text-white p-1 rounded-lg flex-shrink-0"
            title="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Busca e Filtros */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Buscar por cliente ou nome da peça..." 
            className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl outline-none text-white text-sm focus:border-emerald-500 transition-colors"
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            onClick={() => setFilterStatus('All')}
            className={`px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition-all ${
              filterStatus === 'All' 
                ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-sm' 
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
            }`}
          >
            Todos Ativos ({orders.filter(o => isOrderActive(o.status)).length})
          </button>
          {STATUS_LIST.map(st => {
            const count = orders.filter(o => normalizeOrderStatus(o.status) === st.key).length;
            return (
              <button
                key={st.key}
                onClick={() => setFilterStatus(st.key)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  filterStatus === st.key 
                    ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-sm' 
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
                }`}
              >
                <span>{st.emoji}</span>
                <span>{st.shortLabel}</span>
                <span className="opacity-70 text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de Pedidos */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/40 rounded-3xl border border-dashed border-zinc-800 text-zinc-500 space-y-3">
            <ShoppingBag className="w-12 h-12 text-zinc-700 mx-auto" />
            <p className="font-bold text-sm">Nenhum pedido em produção encontrado.</p>
            <button 
              onClick={openNewOrderModal}
              className="text-xs font-bold text-emerald-400 hover:underline uppercase tracking-wider"
            >
              + Criar nova venda agora
            </button>
          </div>
        ) : (
          filteredOrders.map(order => {
            const customer = customers.find(c => c.id === order.customerId);
            const isExpanded = expandedOrders[order.id];
            const totalItemsCount = (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);

            return (
              <div key={order.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm transition-all hover:border-zinc-700">
                <div 
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer" 
                  onClick={() => toggleExpand(order.id)}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-zinc-800/80 rounded-xl flex items-center justify-center text-zinc-400 flex-shrink-0">
                      <ShoppingBag className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base text-zinc-100">{customer?.name || 'Cliente Balcão'}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
                          {order.paymentMethod || 'Pix'}
                        </span>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase">
                          #{order.id.slice(0, 5)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        {customer?.phone && <span className="text-zinc-500 mr-2">{customer.phone}</span>}
                        {new Date(order.createdAt).toLocaleDateString('pt-BR')} • {totalItemsCount} {totalItemsCount === 1 ? 'peça' : 'peças'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 justify-between md:justify-end flex-wrap">
                    <div className="text-right">
                      {order.discount > 0 && (
                        <p className="text-[10px] text-zinc-500 line-through">
                          {formatCurrency(order.totalValue + order.discount)}
                        </p>
                      )}
                      <span className="text-xl font-black text-emerald-500">{formatCurrency(order.totalValue)}</span>
                    </div>

                    {/* Mudança de Status Rápida com emojis e labels de fábrica */}
                    <select 
                      className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${getStatusColor(order.status)}`}
                      value={normalizeOrderStatus(order.status)} 
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateStatus(order.id, e.target.value as OrderStatus)}
                    >
                      {STATUS_LIST.map(st => (
                        <option key={st.key} value={st.key} className="bg-zinc-900 text-zinc-100">
                          {st.emoji} {st.label}
                        </option>
                      ))}
                    </select>

                    {/* Ações Rápidas */}
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={() => setQuoteModalOrder(order)} 
                        title="Gerar Orçamento Oficial em PDF"
                        className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg transition-colors flex items-center gap-1 font-bold text-xs"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="hidden sm:inline text-[11px]">PDF</span>
                      </button>

                      <button 
                        onClick={() => sendWhatsAppMessage(order)} 
                        title="Enviar comprovante no WhatsApp"
                        className="p-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-zinc-950 rounded-lg transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>

                      <button 
                        onClick={() => setReceiptOrder(order)} 
                        title="Ver Comprovante / Cupom"
                        className="p-2 bg-zinc-800 text-zinc-300 hover:text-white rounded-lg transition-colors"
                      >
                        <PrinterIcon className="w-4 h-4" />
                      </button>

                      <button 
                        onClick={() => openEditOrderModal(order)} 
                        title="Editar Pedido"
                        className="p-2 bg-zinc-800 text-zinc-300 hover:text-white rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button 
                        onClick={() => deleteOrder(order.id)} 
                        title="Excluir Pedido"
                        className="p-2 text-zinc-600 hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-zinc-500 pl-1">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-3 border-t border-zinc-800/60 bg-zinc-950/40 space-y-3.5">
                    
                    {/* Stepper do Fluxo de Manufatura 3D */}
                    <div className="bg-zinc-900/90 border border-zinc-800 p-3.5 rounded-2xl">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                          <span>Fluxo da Oficina 3D</span>
                          <span className="text-zinc-600">•</span>
                          <span className="text-emerald-400 font-bold">{getStatusConfig(order.status).label}</span>
                        </span>
                        <span className="text-[10px] text-zinc-500">Toque em qualquer etapa para avançar</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5">
                        {STATUS_LIST.filter(s => s.key !== OrderStatus.CANCELLED).map((st) => {
                          const currentNorm = normalizeOrderStatus(order.status);
                          const isCurrent = currentNorm === st.key;
                          const currentStepOrder = getStatusConfig(currentNorm).stepOrder;
                          const isPassed = currentStepOrder > st.stepOrder;

                          return (
                            <button
                              key={st.key}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStatus(order.id, st.key);
                              }}
                              className={`p-2 rounded-xl text-center border transition-all text-xs font-bold flex flex-col items-center gap-1 ${
                                isCurrent 
                                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/30' 
                                  : isPassed
                                  ? 'bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:border-zinc-500'
                                  : 'bg-zinc-950/80 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                              }`}
                            >
                              <span className="text-base">{st.emoji}</span>
                              <span className="text-[10px] font-bold leading-tight">{st.shortLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Itens da Encomenda */}
                    <div>
                      <p className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Itens da Encomenda:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {(order.items || []).map((item, idx) => {
                          const part = parts.find(p => p.id === item.partId);
                          const itemName = item.name || part?.name || 'Peça';
                          return (
                            <div key={idx} className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                              {part?.imageUrl ? (
                                <img src={part.imageUrl} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-600 flex-shrink-0">
                                  <Package className="w-5 h-5" />
                                </div>
                              )}
                              <div className="flex-1 truncate">
                                <p className="text-xs font-bold text-zinc-200 truncate">{itemName}</p>
                                <p className="text-[10px] text-zinc-500">{item.quantity}x {formatCurrency(item.unitPrice)}</p>
                              </div>
                              <span className="text-xs font-black text-emerald-400">
                                {formatCurrency(item.quantity * item.unitPrice)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Detalhamento Financeiro e Lucro Líquido Real (pricingCalculator) */}
                    {(() => {
                      const orderQty = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0);
                      const orderSub = (order.items || []).reduce((sum, item) => sum + (Number(item.unitPrice || 0) * Number(item.quantity || 1)), 0);
                      const details = order.detalhesPrecificacao || calculateSalePrice({
                        custoProducao: (order.items || []).reduce((sum, item) => {
                          const part = parts.find(p => p.id === item.partId);
                          if (!part) return sum + (item.unitPrice * 0.4 * item.quantity);
                          const costInfo = calculatePartCosts(part, filaments, printers, settings);
                          return sum + (costInfo.totalCost * item.quantity);
                        }, 0),
                        precoTabelaOriginal: orderSub,
                        quantidade: Math.max(1, orderQty),
                        embalagem: order.custosFinanceiros?.embalagem ?? settings.defaultPackagingCost ?? 2.50,
                        embalagemPorUnidade: order.custosFinanceiros?.embalagemPorUnidade ?? true,
                        outrosCustos: order.custosFinanceiros?.outrosCustos ?? settings.defaultOtherCosts ?? 0.00,
                        taxaPagamento: order.custosFinanceiros?.taxaPagamento ?? (order.paymentMethod === PaymentMethod.CARD ? 3.99 : 0),
                        comissaoMarketplace: order.custosFinanceiros?.comissaoMarketplace ?? 0,
                        imposto: order.custosFinanceiros?.imposto ?? 6,
                        desconto: order.discount || 0,
                        repassarTaxas: order.custosFinanceiros?.repassarTaxas ?? false
                      });

                      return (
                        <div className={`p-3.5 rounded-2xl border space-y-2 text-xs transition ${
                          details.alertaPrejuizo
                            ? 'bg-red-500/10 border-red-500/50 text-red-200'
                            : details.alertaMargemBaixa
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                            : 'bg-zinc-950/80 border-zinc-800 text-zinc-300'
                        }`}>
                          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider flex-wrap gap-2">
                            <span className="flex items-center gap-1.5 text-emerald-400">
                              <Calculator className="w-3.5 h-3.5" />
                              Detalhamento Financeiro & Lucro Líquido Real
                            </span>
                            <div className="flex items-center gap-2">
                              {details.alertaPrejuizo && (
                                <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-black animate-pulse">
                                  ⚠️ PREJUÍZO
                                </span>
                              )}
                              <span className={`font-mono font-black ${
                                details.lucroLiquido < 0 ? 'text-red-400' : 'text-emerald-400'
                              }`}>
                                Lucro Real: {formatCurrency(details.lucroLiquido)} ({details.margemEfetiva}%)
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-zinc-400 pt-1 border-t border-zinc-800/60">
                            <div>Custo Produção 3D: <strong className="text-zinc-200 font-mono">{formatCurrency(details.custoProducao)}</strong></div>
                            <div>Embalagem: <strong className="text-zinc-200 font-mono">{formatCurrency(details.embalagem)}</strong></div>
                            <div>Taxas + Impostos: <strong className="text-zinc-200 font-mono">{formatCurrency(details.totalTaxasValor)}</strong></div>
                            <div>Custo Base Total: <strong className="text-zinc-200 font-mono">{formatCurrency(details.custoBase)}</strong></div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-zinc-800/60">
                      <div className="text-[11px] text-zinc-400">
                        Total com desconto: <strong className="text-emerald-400 font-mono text-xs">{formatCurrency(order.totalValue)}</strong>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsPricingCalculatorOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition-colors border border-zinc-700"
                        >
                          <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Simular na Calculadora</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuoteModalOrder(order);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Gerar Orçamento Técnico (PDF)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Criação / Edição de Pedido */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/85 backdrop-blur-md">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-y-auto custom-scrollbar shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-10">
              <div>
                <h3 className="text-xl font-bold uppercase text-white">
                  {editingOrderId ? 'Editar Pedido' : 'Nova Venda / Pedido'}
                </h3>
                <p className="text-xs text-zinc-400">
                  {editingOrderId ? 'Atualize os itens, desconto ou pagamento' : 'Selecione o cliente (ou venda rápida) e adicione as peças'}
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveOrder} className="p-6 space-y-6">
              {/* Banner de Erro caso ocorra */}
              {formError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start gap-3 text-red-400 text-sm animate-in fade-in">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Aviso:</p>
                    <p className="text-xs text-red-300 mt-0.5">{formError}</p>
                  </div>
                </div>
              )}

              {/* 1. SELEÇÃO DE CLIENTE COM ATALHO DE CADASTRO RÁPIDO */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">
                    1. Cliente
                  </label>
                  <button 
                    type="button"
                    onClick={() => setIsQuickCustomerOpen(!isQuickCustomerOpen)}
                    className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {isQuickCustomerOpen ? 'Fechar Cadastro' : '+ Cadastrar Novo Cliente'}
                  </button>
                </div>

                {isQuickCustomerOpen && (
                  <div className="p-4 bg-zinc-950 border border-emerald-500/40 rounded-2xl space-y-3 animate-in fade-in duration-200">
                    <p className="text-xs font-bold text-emerald-400">Cadastro Rápido de Cliente</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input 
                        type="text" 
                        placeholder="Nome do Cliente..."
                        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                        value={quickCustomerName}
                        onChange={e => setQuickCustomerName(e.target.value)}
                      />
                      <input 
                        type="text" 
                        placeholder="WhatsApp / Telefone..."
                        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                        value={quickCustomerPhone}
                        onChange={e => setQuickCustomerPhone(e.target.value)}
                      />
                    </div>
                    <button 
                      type="button"
                      disabled={isSavingCustomer || !quickCustomerName.trim()}
                      onClick={handleQuickCreateCustomer}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl transition disabled:opacity-50"
                    >
                      {isSavingCustomer ? 'Salvando...' : 'Salvar e Selecionar Cliente'}
                    </button>
                  </div>
                )}

                {/* Opções de Clientes em formato de Chips/Pills selecionáveis */}
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                  <button 
                    type="button" 
                    onClick={() => setOrderForm({ ...orderForm, customerId: '' })}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                      !orderForm.customerId 
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-500/30' 
                        : 'border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>Venda Rápida / Balcão</span>
                  </button>

                  {customers.map(c => (
                    <button 
                      type="button" 
                      key={c.id} 
                      onClick={() => setOrderForm({ ...orderForm, customerId: c.id })}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border truncate transition-all flex items-center gap-1.5 ${
                        orderForm.customerId === c.id 
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-500/30' 
                          : 'border-zinc-800 bg-zinc-800/40 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <span>{c.name}</span>
                      {c.phone && <span className="text-[10px] text-zinc-500 font-normal">({c.phone})</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. ADICIONAR PEÇAS OU ITENS AVULSOS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase text-zinc-400 tracking-wider">
                    2. Adicionar Itens ({orderForm.items.length} selecionados)
                  </label>
                  <button 
                    type="button"
                    onClick={() => setIsCustomItemOpen(!isCustomItemOpen)}
                    className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    {isCustomItemOpen ? 'Fechar Avulso' : '+ Item Avulso / Serviço'}
                  </button>
                </div>

                {/* Formulário de Item Personalizado */}
                {isCustomItemOpen && (
                  <div className="p-4 bg-zinc-950 border border-emerald-500/40 rounded-2xl space-y-3 animate-in fade-in duration-200">
                    <p className="text-xs font-bold text-emerald-400">Adicionar Item Avulso / Serviço Sob Medida</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input 
                        type="text" 
                        placeholder="Ex: Impressão STL Batman..."
                        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 sm:col-span-1"
                        value={customItemName}
                        onChange={e => setCustomItemName(e.target.value)}
                      />
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="Preço Unitário (R$)..."
                        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                        value={customItemPrice}
                        onChange={e => setCustomItemPrice(e.target.value ? Number(e.target.value) : '')}
                      />
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          min="1"
                          step="1"
                          placeholder="Qtd"
                          className="w-20 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 text-center"
                          value={customItemQty === '' ? '' : customItemQty}
                          onChange={e => {
                            const val = e.target.value;
                            setCustomItemQty(val === '' ? '' : Math.max(1, Number(val)));
                          }}
                          onBlur={() => {
                            if (!customItemQty || customItemQty < 1) {
                              setCustomItemQty(1);
                            }
                          }}
                        />
                        <button 
                          type="button"
                          disabled={!customItemName.trim() || customItemPrice === ''}
                          onClick={addCustomItemToOrder}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl transition disabled:opacity-50"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Grid do Catálogo */}
                {parts.length === 0 ? (
                  <p className="text-xs text-zinc-500 bg-zinc-800/30 p-3 rounded-xl border border-zinc-800">
                    Nenhuma peça cadastrada no catálogo. Você pode adicionar um item avulso pelo botão acima!
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {parts.map(part => {
                      const inOrder = orderForm.items.find(i => i.partId === part.id);
                      return (
                        <button 
                          type="button" 
                          key={part.id} 
                          onClick={() => addCatalogPart(part.id)} 
                          className={`relative aspect-square rounded-2xl bg-zinc-800 border overflow-hidden hover:scale-105 transition-all text-left group cursor-pointer ${
                            inOrder ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-zinc-800'
                          }`}
                        >
                          {part.imageUrl ? (
                            <img src={part.imageUrl} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-800">
                              <Package className="w-6 h-6" />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent p-2">
                            <p className="text-[10px] font-bold text-white truncate">{part.name}</p>
                          </div>
                          {inOrder && (
                            <div className="absolute top-1.5 right-1.5 min-w-[24px] h-6 px-1.5 bg-emerald-500 rounded-full text-xs font-black flex items-center justify-center text-zinc-950 shadow-md">
                              {inOrder.quantity}x
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. LISTA DE ITENS SELECIONADOS COM PREÇO EDITÁVEL */}
              {orderForm.items.length > 0 && (
                <div className="space-y-3 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800">
                  <label className="text-xs font-black uppercase text-zinc-400 tracking-wider block">
                    3. Itens no Pedido ({orderForm.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)} un)
                  </label>
                  <div className="space-y-2">
                    {orderForm.items.map(item => {
                      const part = parts.find(p => p.id === item.partId);
                      const itemName = item.name || part?.name || 'Item';

                      return (
                        <div key={item.partId} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800 gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {part?.imageUrl ? (
                              <img src={part.imageUrl} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-600 flex-shrink-0">
                                <Package className="w-5 h-5" />
                              </div>
                            )}
                            <div className="truncate">
                              <p className="text-sm font-bold text-zinc-100 truncate">{itemName}</p>
                              <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5">
                                <span>Preço unitário: R$</span>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  className="w-20 bg-zinc-800 px-2 py-0.5 rounded text-white font-bold border border-zinc-700 outline-none focus:border-emerald-500"
                                  value={item.unitPrice}
                                  onChange={e => updateItemPrice(item.partId, Number(e.target.value))}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-zinc-400">Qtd:</span>
                              <div className="flex items-center bg-zinc-800 rounded-lg border border-zinc-700 overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/40">
                                <button 
                                  type="button" 
                                  onClick={() => updateItemQuantity(item.partId, -1)}
                                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 active:scale-95 transition-colors"
                                  title="Diminuir quantidade"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <input 
                                  type="number" 
                                  min="1"
                                  step="1"
                                  value={item.quantity === 0 ? '' : item.quantity}
                                  placeholder="1"
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === '') {
                                      setItemQuantity(item.partId, 0);
                                    } else {
                                      const num = parseInt(val, 10);
                                      setItemQuantity(item.partId, isNaN(num) ? 1 : Math.max(0, num));
                                    }
                                  }}
                                  onBlur={() => {
                                    if (!item.quantity || item.quantity < 1) {
                                      setItemQuantity(item.partId, 1);
                                    }
                                  }}
                                  className="w-14 text-center text-xs font-black text-white bg-transparent outline-none py-1 border-x border-zinc-700/60 focus:bg-zinc-700/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  title="Clique para digitar a quantidade desejada"
                                />
                                <button 
                                  type="button" 
                                  onClick={() => updateItemQuantity(item.partId, 1)}
                                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 active:scale-95 transition-colors"
                                  title="Aumentar quantidade"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <span className="text-sm font-black text-emerald-400 w-24 text-right">
                              {formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}
                            </span>

                            <button 
                              type="button" 
                              onClick={() => deleteItem(item.partId)}
                              className="p-1.5 text-zinc-600 hover:text-red-500 transition-colors"
                              title="Remover item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. STATUS NO FLUXO DE MANUFATURA 3D */}
              <div className="space-y-2.5 pt-2 border-t border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                    <span>4. Status de Manufatura 3D:</span>
                    <span className="text-emerald-400 font-bold">{getStatusConfig(orderForm.status).label}</span>
                  </label>
                  <span className="text-[10px] text-zinc-500">Selecione o estágio atual da oficina</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {STATUS_LIST.map(st => {
                    const isSelected = normalizeOrderStatus(orderForm.status) === st.key;
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => setOrderForm({ ...orderForm, status: st.key })}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/30 shadow-sm'
                            : 'bg-zinc-800/40 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                      >
                        <span className="text-lg flex-shrink-0">{st.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate leading-tight">{st.shortLabel}</p>
                          <p className="text-[9px] opacity-70 truncate">{st.description.split(',')[0]}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5. FORMA DE PAGAMENTO E DESCONTO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800/80">
                <div>
                  <label className="text-xs font-black uppercase text-zinc-400 tracking-wider block mb-2">5. Forma de Pagamento</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: PaymentMethod.PIX, label: 'Pix (0%)', icon: <QrCode className="w-4 h-4" /> },
                      { id: PaymentMethod.CARD, label: 'Cartão', icon: <CreditCard className="w-4 h-4" /> },
                      { id: PaymentMethod.CASH, label: 'Dinheiro', icon: <Banknote className="w-4 h-4" /> }
                    ].map(pm => (
                      <button
                        type="button"
                        key={pm.id}
                        onClick={() => {
                          setOrderForm({ ...orderForm, paymentMethod: pm.id });
                          if (pm.id === PaymentMethod.CARD) {
                            setFinancialForm(prev => ({ ...prev, taxaPagamento: prev.taxaPagamento || 3.99 }));
                          } else {
                            setFinancialForm(prev => ({ ...prev, taxaPagamento: 0 }));
                          }
                        }}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-1 text-xs font-bold transition-all ${
                          orderForm.paymentMethod === pm.id
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 ring-1 ring-emerald-500/50'
                            : 'bg-zinc-800/40 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        {pm.icon}
                        <span>{pm.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black uppercase text-zinc-400 tracking-wider block mb-2">Desconto Comercial (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">R$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-base font-bold outline-none focus:border-emerald-500 text-white"
                      value={orderForm.discount || ''}
                      onChange={e => setOrderForm({ ...orderForm, discount: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </div>
                </div>
              </div>

              {/* 6. CALCULADORA FINANCEIRA AVANÇADA DE VENDA (pricingCalculator) */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">
                        6. Calculadora Financeira de Venda (pricingCalculator)
                      </h4>
                      <p className="text-[10px] text-zinc-400">Custos de embalagem, taxas de pagamento, comissão e impostos</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-black px-2.5 py-1 rounded-xl border ${
                      pricingBreakdown.alertaPrejuizo
                        ? 'bg-red-500/20 text-red-300 border-red-500/50 animate-pulse'
                        : pricingBreakdown.alertaMargemBaixa
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}>
                      {pricingBreakdown.alertaPrejuizo ? '⚠️ PREJUÍZO: ' : 'Lucro Líquido: '}
                      {formatCurrency(pricingBreakdown.lucroLiquido)} ({pricingBreakdown.margemEfetiva}%)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedPricing(!showAdvancedPricing)}
                      className="text-xs font-bold text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700 flex items-center gap-1"
                    >
                      <SlidersHorizontal className="w-3 h-3 text-emerald-400" />
                      <span>{showAdvancedPricing ? 'Recolher' : 'Ajustar Taxas'}</span>
                    </button>
                  </div>
                </div>

                {/* Banner Explícito de Prejuízo */}
                {pricingBreakdown.alertaPrejuizo && (
                  <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/60 text-red-200 text-xs flex items-start gap-3 animate-pulse">
                    <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <strong className="font-black text-red-400 uppercase tracking-wide block">
                        Alerta de Prejuízo Operacional:
                      </strong>
                      <span>
                        Esta venda está dando <strong className="text-white underline">{formatCurrency(Math.abs(pricingBreakdown.lucroLiquido))}</strong> de prejuízo real após deduzir custos de fabricação 3D, embalagem, impostos e taxas. Preço mínimo sugerido para zerar custos: <strong className="text-white font-mono">{formatCurrency(pricingBreakdown.custoBase / (1 - (pricingBreakdown.totalTaxasPercentual / 100)))}</strong>.
                      </span>
                    </div>
                  </div>
                )}

                {/* Banner de Margem Baixa */}
                {pricingBreakdown.alertaMargemBaixa && !pricingBreakdown.alertaPrejuizo && (
                  <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>
                      <strong>Margem apertada ({pricingBreakdown.margemEfetiva}%):</strong> Lucro líquido de {formatCurrency(pricingBreakdown.lucroLiquido)}. Qualquer falha de impressão consumirá a margem.
                    </span>
                  </div>
                )}

                {/* Parâmetros Configuráveis da Venda */}
                {showAdvancedPricing && (
                  <div className="p-4 bg-zinc-900/90 rounded-2xl border border-zinc-800 space-y-3.5 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          Custo de Embalagem (R$):
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">R$</span>
                          <input
                            type="number"
                            step="0.10"
                            min="0"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-white outline-none focus:border-emerald-500"
                            value={financialForm.embalagem}
                            onChange={e => setFinancialForm({ ...financialForm, embalagem: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                          Outros Custos / Insumos (R$):
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">R$</span>
                          <input
                            type="number"
                            step="0.10"
                            min="0"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-white outline-none focus:border-emerald-500"
                            value={financialForm.outrosCustos}
                            onChange={e => setFinancialForm({ ...financialForm, outrosCustos: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-800">
                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-zinc-300 mb-1">
                          <span>Taxa Pagamento:</span>
                          <span className="text-emerald-400 font-mono">{financialForm.taxaPagamento}%</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 mb-1.5">
                          <button type="button" onClick={() => setFinancialForm({ ...financialForm, taxaPagamento: 0 })} className="p-1 rounded bg-zinc-800 text-[10px] text-zinc-400 hover:text-white border border-zinc-700">0% Pix</button>
                          <button type="button" onClick={() => setFinancialForm({ ...financialForm, taxaPagamento: 3.99 })} className="p-1 rounded bg-zinc-800 text-[10px] text-zinc-400 hover:text-white border border-zinc-700">3.99%</button>
                          <button type="button" onClick={() => setFinancialForm({ ...financialForm, taxaPagamento: 5.50 })} className="p-1 rounded bg-zinc-800 text-[10px] text-zinc-400 hover:text-white border border-zinc-700">5.5% 3x</button>
                        </div>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                          value={financialForm.taxaPagamento}
                          onChange={e => setFinancialForm({ ...financialForm, taxaPagamento: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-zinc-300 mb-1">
                          <span>Comissão Marketplace:</span>
                          <span className="text-cyan-400 font-mono">{financialForm.comissaoMarketplace}%</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 mb-1.5">
                          <button type="button" onClick={() => setFinancialForm({ ...financialForm, comissaoMarketplace: 0 })} className="p-1 rounded bg-zinc-800 text-[10px] text-zinc-400 hover:text-white border border-zinc-700">0% Dir.</button>
                          <button type="button" onClick={() => setFinancialForm({ ...financialForm, comissaoMarketplace: 14 })} className="p-1 rounded bg-zinc-800 text-[10px] text-zinc-400 hover:text-white border border-zinc-700">14% Shp</button>
                          <button type="button" onClick={() => setFinancialForm({ ...financialForm, comissaoMarketplace: 18 })} className="p-1 rounded bg-zinc-800 text-[10px] text-zinc-400 hover:text-white border border-zinc-700">18% ML</button>
                        </div>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                          value={financialForm.comissaoMarketplace}
                          onChange={e => setFinancialForm({ ...financialForm, comissaoMarketplace: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-bold text-zinc-300 mb-1">
                          <span>Impostos:</span>
                          <span className="text-amber-400 font-mono">{financialForm.imposto}%</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 mb-1.5">
                          <button type="button" onClick={() => setFinancialForm({ ...financialForm, imposto: 0 })} className="p-1 rounded bg-zinc-800 text-[10px] text-zinc-400 hover:text-white border border-zinc-700">0% MEI</button>
                          <button type="button" onClick={() => setFinancialForm({ ...financialForm, imposto: 6 })} className="p-1 rounded bg-zinc-800 text-[10px] text-zinc-400 hover:text-white border border-zinc-700">6% Simp</button>
                          <button type="button" onClick={() => setFinancialForm({ ...financialForm, imposto: 4 })} className="p-1 rounded bg-zinc-800 text-[10px] text-zinc-400 hover:text-white border border-zinc-700">4% Com</button>
                        </div>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                          value={financialForm.imposto}
                          onChange={e => setFinancialForm({ ...financialForm, imposto: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Demonstrativo Resumido do Cálculo */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/80">
                  <div>
                    <span className="text-zinc-500 block">Preço das Peças (Catálogo):</span>
                    <strong className="text-zinc-200 font-mono">{formatCurrency(orderSubtotal)}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Custo Fabril 3D:</span>
                    <strong className="text-zinc-200 font-mono">{formatCurrency(pricingBreakdown.custoProducao)}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Embalagem + Insumos:</span>
                    <strong className="text-zinc-200 font-mono">{formatCurrency(pricingBreakdown.embalagem + pricingBreakdown.outrosCustos)}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Taxas + Impostos Retidos:</span>
                    <span className="text-red-400 font-mono font-bold">- {formatCurrency(pricingBreakdown.totalTaxasValor)}</span>
                  </div>
                </div>

                <div className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-[11px] text-zinc-400">
                    <p className="flex items-center gap-1.5 font-medium text-zinc-300">
                      <span>💡</span>
                      <span>O preço das peças já possui o lucro de catálogo. A calculadora audita quanto sobra líquido no bolso.</span>
                    </p>
                    {pricingBreakdown.totalTaxasPercentual > 0 && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Para repassar as taxas de {pricingBreakdown.totalTaxasPercentual}% no anúncio do marketplace: Preço sugerido <strong className="text-emerald-400">{formatCurrency(pricingBreakdown.precoSugeridoMarketplace)}</strong>
                      </p>
                    )}
                  </div>

                  {pricingBreakdown.totalTaxasPercentual > 0 && orderForm.items.length > 0 && (
                    <button
                      type="button"
                      onClick={applySuggestedPriceToItems}
                      className="px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-bold text-xs rounded-xl transition flex items-center gap-1.5 flex-shrink-0"
                      title="Ajusta o valor dos itens para que as taxas de marketplace sejam absorvidas no preço final"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Repassar Taxas nos Itens</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 7. RESUMO FINANCEIRO FINAL */}
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Subtotal dos itens:</span>
                  <span>{formatCurrency(orderSubtotal)}</span>
                </div>
                {orderForm.discount > 0 && (
                  <div className="flex justify-between text-xs text-red-400">
                    <span>Desconto aplicado:</span>
                    <span>- {formatCurrency(orderForm.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-white pt-2 border-t border-zinc-800">
                  <span>Total Final a Cobrar:</span>
                  <span className="text-2xl text-emerald-400">{formatCurrency(orderTotal)}</span>
                </div>
              </div>

              <div>
                <button 
                  type="submit" 
                  disabled={isSaving || orderForm.items.length === 0}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black rounded-2xl text-lg shadow-xl shadow-emerald-500/20 disabled:opacity-50 transition-all active:scale-[0.98] cursor-pointer"
                >
                  {isSaving ? <Loader2 className="animate-spin mx-auto w-6 h-6" /> : (
                    editingOrderId ? `SALVAR ALTERAÇÕES • ${formatCurrency(orderTotal)}` : `CONFIRMAR VENDA • ${formatCurrency(orderTotal)}`
                  )}
                </button>
                {orderForm.items.length === 0 && (
                  <p className="text-center text-xs text-zinc-500 mt-2">
                    Toque nas peças do catálogo ou adicione um item avulso para habilitar a venda.
                  </p>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CALCULADORA FINANCEIRA AVANÇADA STANDALONE */}
      <PricingCalculatorModal
        isOpen={isPricingCalculatorOpen}
        onClose={() => setIsPricingCalculatorOpen(false)}
        initialItems={orderForm.items.map(i => ({ partId: i.partId, quantity: i.quantity }))}
        initialFinancials={financialForm}
        onApplyToOrder={({ financials, selectedParts }) => {
          setFinancialForm(financials);
          const totalTaxas = (financials.imposto + financials.taxaPagamento + financials.comissaoMarketplace) / 100;
          const fatorRepasse = totalTaxas < 1 && financials.repassarTaxas ? (1 / (1 - totalTaxas)) : 1;

          if (selectedParts && selectedParts.length > 0) {
            const newItems: OrderItem[] = selectedParts.map(sp => {
              const part = parts.find(p => p.id === sp.partId);
              const existingItem = orderForm.items.find(i => i.partId === sp.partId);
              const partCost = part ? calculatePartCosts(part, filaments, printers, settings) : null;
              const basePrice = partCost?.suggestedPrice || existingItem?.unitPrice || 0;
              const unitPrice = Number((basePrice * fatorRepasse).toFixed(2));
              return {
                partId: sp.partId,
                name: part?.name || existingItem?.name || 'Peça do Catálogo',
                quantity: sp.quantity,
                unitPrice: unitPrice > 0 ? unitPrice : basePrice
              };
            });
            setOrderForm(prev => ({ ...prev, items: newItems }));
          } else if (orderForm.items.length > 0) {
            setOrderForm(prev => ({
              ...prev,
              items: prev.items.map(i => {
                const part = parts.find(p => p.id === i.partId);
                const basePrice = part ? calculatePartCosts(part, filaments, printers, settings).suggestedPrice : (Number(i.unitPrice) || 0);
                return {
                  ...i,
                  unitPrice: Math.max(0.01, Number((basePrice * fatorRepasse).toFixed(2)))
                };
              })
            }));
          }
          setIsModalOpen(true);
        }}
      />

      {/* MODAL DE COMPROVANTE / CUPOM DE PRODUÇÃO */}
      {receiptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative text-zinc-100">
            <button 
              onClick={() => setReceiptOrder(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-6 border-b border-zinc-800 pb-4">
              <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center font-black text-xl text-zinc-950 mx-auto mb-2">
                PF
              </div>
              <h3 className="font-black text-xl text-white">PRINTFLOW 3D</h3>
              <p className="text-xs text-zinc-400 uppercase tracking-widest font-bold">Comprovante de Pedido</p>
              <p className="text-[11px] text-zinc-500 font-mono mt-1">
                #{receiptOrder.id.slice(0, 8).toUpperCase()} • {new Date(receiptOrder.createdAt).toLocaleDateString('pt-BR')}
              </p>
            </div>

            {/* Dados do Cliente */}
            <div className="mb-4 text-xs space-y-1 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <p className="text-zinc-500 uppercase font-black text-[10px]">Cliente:</p>
              <p className="font-bold text-white text-sm">
                {customers.find(c => c.id === receiptOrder.customerId)?.name || 'Cliente Balcão'}
              </p>
              {customers.find(c => c.id === receiptOrder.customerId)?.phone && (
                <p className="text-zinc-400 font-mono">
                  {customers.find(c => c.id === receiptOrder.customerId)?.phone}
                </p>
              )}
            </div>

            {/* Tabela de Itens */}
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-1 custom-scrollbar text-xs">
              {(receiptOrder.items || []).map((it, idx) => {
                const part = parts.find(p => p.id === it.partId);
                const title = it.name || part?.name || 'Item 3D';
                return (
                  <div key={idx} className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                    <div>
                      <p className="font-bold text-zinc-200">{it.quantity}x {title}</p>
                      <p className="text-[10px] text-zinc-500">{formatCurrency(it.unitPrice)} un.</p>
                    </div>
                    <p className="font-bold text-emerald-400">
                      {formatCurrency(it.quantity * it.unitPrice)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Totais */}
            <div className="space-y-1.5 text-xs pt-2 border-t border-zinc-800 mb-6">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal:</span>
                <span>{formatCurrency((receiptOrder.items || []).reduce((s, i) => s + (i.unitPrice * i.quantity), 0))}</span>
              </div>
              {receiptOrder.discount > 0 && (
                <div className="flex justify-between text-red-400">
                  <span>Desconto:</span>
                  <span>- {formatCurrency(receiptOrder.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-white pt-2 border-t border-zinc-800">
                <span>Total a Pagar:</span>
                <span className="text-emerald-400 text-lg">{formatCurrency(receiptOrder.totalValue)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500 pt-1">
                <span>Pagamento:</span>
                <span className="font-bold text-zinc-300">{receiptOrder.paymentMethod || 'Pix'}</span>
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500">
                <span>Status:</span>
                <span className="font-bold text-emerald-400">{receiptOrder.status}</span>
              </div>
            </div>

            {/* Ações do Comprovante */}
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <button 
                onClick={() => {
                  const o = receiptOrder;
                  setReceiptOrder(null);
                  setQuoteModalOrder(o);
                }}
                className="py-3 px-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                title="Visualizar Proposta Comercial em PDF Técnico"
              >
                <FileText className="w-4 h-4" />
                <span>Orçamento PDF</span>
              </button>
              <button 
                onClick={() => sendWhatsAppMessage(receiptOrder)}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
              <button 
                onClick={() => window.print()}
                className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"
              >
                <PrinterIcon className="w-4 h-4" />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ORÇAMENTO COMERCIAL EM PDF */}
      {quoteModalOrder && (
        <QuotePdfModal
          order={quoteModalOrder}
          customer={customers.find(c => c.id === quoteModalOrder.customerId)}
          parts={parts}
          filaments={filaments}
          settings={settings}
          onClose={() => setQuoteModalOrder(null)}
        />
      )}
    </div>
  );
};

export default Orders;
