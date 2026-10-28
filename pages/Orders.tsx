import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Order, OrderStatus, PaymentMethod, OrderItem, Customer, FinancialConfig, PricingBreakdown } from '../types';
import { supabase } from '../services/supabase';
import { formatCurrency, calculatePartCosts } from '../constants';
import { STATUS_LIST, getStatusConfig, normalizeOrderStatus, isOrderActive, isOrderPaid } from '../utils/statusUtils';
import { calculateSalePrice } from '../utils/pricingCalculator';
import { 
  Plus, Search, Trash2, ShoppingBag, X, User as UserIcon, Minus, 
  ChevronDown, ChevronUp, Package, Tag, Loader2, CreditCard, Banknote, 
  QrCode, MessageCircle, Printer as PrinterIcon, Edit2, CheckCircle2, UserPlus, 
  Wrench, AlertCircle, FileText, Calculator, TrendingUp, SlidersHorizontal, 
  AlertTriangle, Percent, DollarSign, Clock, ShieldAlert, Sparkles, Check, RotateCcw, Zap,
  PackageCheck, Layers
} from 'lucide-react';
import { QuotePdfModal } from '../components/QuotePdfModal';
import { PricingCalculatorModal } from '../components/PricingCalculatorModal';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { QuickQuoteModal } from '../components/QuickQuoteModal';

export interface StockPreviewRow {
  id: string; // filamentId ou supplyId
  itemType: 'filament' | 'supply';
  filamentId?: string;
  supplyId?: string;
  name: string;
  material: string;
  colorName: string;
  colorHex: string;
  unit: string; // 'g' ou 'un'
  currentStock: number;
  deltaAmount: number;
  finalStock: number;
  apply: boolean;
  returnAmount: number;
  maxReturnAmount: number;

  // Campos de compatibilidade com código existente
  currentWeight: number;
  deltaGrams: number;
  finalWeight: number;
  returnGrams: number;
  maxReturnGrams: number;
}

export const calculateOrderFilamentConsumption = (
  items: OrderItem[],
  parts: any[],
  filaments: any[]
): Record<string, number> => {
  const deductions: Record<string, number> = {};

  (items || []).forEach(orderItem => {
    if (!orderItem || !orderItem.partId) return;
    const qty = Math.max(1, Math.round(Number(orderItem.quantity) || 1));
    const part = parts.find(p => p.id === orderItem.partId);
    if (!part) return;

    const rawUnits = Number(part.unitsPerPrint);
    const unitsPerPrint = (!isNaN(rawUnits) && rawUnits >= 1) ? Math.floor(rawUnits) : 1;

    if (part.recipe && Array.isArray(part.recipe) && part.recipe.length > 0) {
      part.recipe.forEach((recipeItem: any) => {
        if (!recipeItem || !recipeItem.filamentId) return;
        const totalBatchGrams = Number(recipeItem.grams) || 0;
        const gramsPerUnit = totalBatchGrams / unitsPerPrint;
        const grams = Math.round(gramsPerUnit * qty);
        if (grams > 0) {
          deductions[recipeItem.filamentId] = (deductions[recipeItem.filamentId] || 0) + grams;
        }
      });
    } else if (Number(part.weight) > 0 && filaments.length > 0) {
      const matchedFilament = filaments.find((f: any) => 
        f.material && part.material && f.material.toLowerCase() === part.material.toLowerCase()
      ) || filaments[0];

      if (matchedFilament?.id) {
        const totalBatchWeight = Number(part.weight) || 0;
        const gramsPerUnit = totalBatchWeight / unitsPerPrint;
        const grams = Math.round(gramsPerUnit * qty);
        if (grams > 0) {
          deductions[matchedFilament.id] = (deductions[matchedFilament.id] || 0) + grams;
        }
      }
    }
  });

  return deductions;
};

export const calculateOrderSuppliesConsumption = (
  items: OrderItem[],
  parts: any[]
): Record<string, number> => {
  const deductions: Record<string, number> = {};

  (items || []).forEach(orderItem => {
    if (!orderItem || !orderItem.partId) return;
    const qty = Math.max(1, Math.round(Number(orderItem.quantity) || 1));
    const part = parts.find(p => p.id === orderItem.partId);
    if (!part || !part.supplies || !Array.isArray(part.supplies)) return;

    const rawUnits = Number(part.unitsPerPrint);
    const unitsPerPrint = (!isNaN(rawUnits) && rawUnits >= 1) ? Math.floor(rawUnits) : 1;

    part.supplies.forEach((supItem: any) => {
      if (!supItem || !supItem.supplyId) return;
      const totalBatchUnits = Number(supItem.quantity) || 0;
      if (totalBatchUnits <= 0) return;
      const unitsPerPiece = totalBatchUnits / unitsPerPrint;
      const totalConsumed = Math.round(unitsPerPiece * qty);
      if (totalConsumed > 0) {
        deductions[supItem.supplyId] = (deductions[supItem.supplyId] || 0) + totalConsumed;
      }
    });
  });

  return deductions;
};

export const getOrderConsumedFilaments = (order?: Order | null): Record<string, number> => {
  if (!order) return {};
  if (order.consumedFilaments && typeof order.consumedFilaments === 'object') {
    return order.consumedFilaments;
  }
  return {};
};

export const getOrderConsumedSupplies = (
  order?: Order | null,
  parts: any[] = []
): Record<string, number> => {
  if (!order) return {};
  if (order.detalhesPrecificacao && (order.detalhesPrecificacao as any).consumedSupplies) {
    return (order.detalhesPrecificacao as any).consumedSupplies;
  }
  if ((order as any).consumedSupplies && typeof (order as any).consumedSupplies === 'object') {
    return (order as any).consumedSupplies;
  }
  if (order.stockDeductionStatus === 'confirmed' || order.stockDeductionStatus === 'partial') {
    if (order.items && order.items.length > 0 && parts.length > 0) {
      return calculateOrderSuppliesConsumption(order.items, parts);
    }
  }
  return {};
};

export const Orders: React.FC = () => {
  const { orders, setOrders, refreshData, customers, parts, filaments, printers, settings, user, supplies, setSupplies } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPricingCalculatorOpen, setIsPricingCalculatorOpen] = useState(false);
  const [isQuickQuoteOpen, setIsQuickQuoteOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'All'>('All');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<{ type: 'warning' | 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    try {
      const notice = sessionStorage.getItem('printflow_orders_migrated_notice');
      if (notice) {
        sessionStorage.removeItem('printflow_orders_migrated_notice');
        setPageNotice({ type: 'success', message: notice });
      }
    } catch (e) {}

    const handleNotice = (e: any) => {
      if (e?.detail) {
        setPageNotice({ type: 'success', message: e.detail });
      }
    };
    window.addEventListener('printflow_orders_notice', handleNotice);
    return () => window.removeEventListener('printflow_orders_notice', handleNotice);
  }, []);

  // Estados de confirmação de exclusão e cancelamento sem bloqueio de janela
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<{
    id: string;
    code: string;
    customerName: string;
    totalGrams: number;
  } | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const [cancelPromptOrder, setCancelPromptOrder] = useState<Order | null>(null);

  // Modal de Confirmação Cirúrgica de Estoque (Baixa inicial, Delta de edição, Estorno de cancelamento)
  const [stockModal, setStockModal] = useState<{
    isOpen: boolean;
    type: 'create' | 'edit' | 'cancel';
    title: string;
    subtitle: string;
    rows: StockPreviewRow[];
    orderId?: string;
    orderCode?: string;
    pendingOrderData?: {
      fullPayload: any;
      basePayload: any;
      orderIdToUpdate?: string | null;
    };
  } | null>(null);
  const [isProcessingStock, setIsProcessingStock] = useState(false);

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
    isPaid: boolean;
  }>({
    customerId: '',
    items: [],
    discount: 0,
    paymentMethod: PaymentMethod.PIX,
    status: OrderStatus.QUEUE,
    isPaid: false
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
  const [draftRestoredNotice, setDraftRestoredNotice] = useState(false);

  const location = useLocation();

  // Salva rascunho da venda em tempo real para proteger contra recarregamentos acidentais ou quedas
  useEffect(() => {
    if (isModalOpen && !editingOrderId) {
      if ((orderForm.items && orderForm.items.length > 0) || orderForm.customerId || orderForm.discount > 0) {
        try {
          localStorage.setItem('printflow_active_order_draft', JSON.stringify({
            orderForm,
            financialForm,
            savedAt: Date.now()
          }));
        } catch (e) {}
      }
    }
  }, [isModalOpen, editingOrderId, orderForm, financialForm]);

  // Alerta de segurança antes de fechar a janela se houver venda em andamento
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isModalOpen && orderForm.items && orderForm.items.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isModalOpen, orderForm.items]);

  // Abrir modal de novo pedido automaticamente se veio da tela de Clientes ou do Orçamento Flash
  useEffect(() => {
    const state = location.state as { 
      customerId?: string; 
      openNew?: boolean;
      flashQuoteDraft?: {
        itemName: string;
        unitPrice: number;
        quantity: number;
        weightGrams: number;
        filamentId?: string;
        filamentName?: string;
        printHours?: number;
        customerName?: string;
        customerPhone?: string;
      };
    } | null;

    if (state?.flashQuoteDraft) {
      const draft = state.flashQuoteDraft;
      handleConvertFlashQuote(draft);
      window.history.replaceState({}, document.title);
      return;
    }

    if (state?.openNew && state?.customerId) {
      setEditingOrderId(null);
      setFormError(null);
      setOrderForm({
        customerId: state.customerId,
        items: [],
        discount: 0,
        paymentMethod: PaymentMethod.PIX,
        status: OrderStatus.QUEUE,
        isPaid: false
      });
      setIsQuickCustomerOpen(false);
      setIsCustomItemOpen(false);
      setIsModalOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleConvertFlashQuote = (draft: {
    itemName: string;
    unitPrice: number;
    quantity: number;
    weightGrams: number;
    filamentId?: string;
    filamentName?: string;
    printHours?: number;
    customerName?: string;
    customerPhone?: string;
  }) => {
    setEditingOrderId(null);
    setFormError(null);

    const matchedCust = customers.find(c => 
      draft.customerName && c.name.toLowerCase().includes(draft.customerName.toLowerCase())
    );

    const newItem: OrderItem = {
      partId: draft.filamentId ? `custom_${draft.filamentId}_${Date.now()}` : `custom_${Date.now()}`,
      name: `${draft.itemName}${draft.filamentName ? ` (${draft.filamentName})` : ''}`,
      quantity: Math.max(1, draft.quantity || 1),
      unitPrice: Math.max(0, draft.unitPrice || 0)
    };

    setOrderForm({
      customerId: matchedCust?.id || customers[0]?.id || '',
      items: [newItem],
      discount: 0,
      paymentMethod: PaymentMethod.PIX,
      status: OrderStatus.QUEUE,
      isPaid: false
    });
    setIsQuickCustomerOpen(false);
    setIsCustomItemOpen(false);
    setIsModalOpen(true);
    setPageNotice({
      type: 'success',
      message: `Orçamento Flash "${draft.itemName}" convertido em rascunho de pedido! Revise e confirme.`
    });
  };

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
      const costInfo = calculatePartCosts(part, filaments, printers, settings, supplies);
      const unitCost = costInfo.totalCost > 0 ? costInfo.totalCost : ((Number(item.unitPrice) || 0) * 0.4);
      return sum + (unitCost * (Number(item.quantity) || 1));
    }, 0);
  }, [orderForm.items, parts, filaments, printers, settings, supplies]);

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
        const basePrice = part ? calculatePartCosts(part, filaments, printers, settings, supplies).suggestedPrice : (Number(item.unitPrice) || 0);
        const newUnitPrice = Number((basePrice * fator).toFixed(2));
        return {
          ...item,
          unitPrice: Math.max(0.01, newUnitPrice)
        };
      })
    }));
  };

  const discardOrderDraft = () => {
    try {
      localStorage.removeItem('printflow_active_order_draft');
    } catch (e) {}
    setDraftRestoredNotice(false);
    setOrderForm({
      customerId: '',
      items: [],
      discount: 0,
      paymentMethod: PaymentMethod.PIX,
      status: OrderStatus.QUEUE,
      isPaid: false
    });
  };

  const openNewOrderModal = () => {
    setEditingOrderId(null);
    setFormError(null);

    // Tenta recuperar rascunho anterior caso a página tenha recarregado
    try {
      const storedDraft = localStorage.getItem('printflow_active_order_draft');
      if (storedDraft) {
        const parsed = JSON.parse(storedDraft);
        if (parsed?.orderForm && ((parsed.orderForm.items && parsed.orderForm.items.length > 0) || parsed.orderForm.customerId)) {
          setOrderForm(parsed.orderForm);
          if (parsed.financialForm) setFinancialForm(parsed.financialForm);
          setDraftRestoredNotice(true);
          setShowAdvancedPricing(false);
          setIsQuickCustomerOpen(false);
          setIsCustomItemOpen(false);
          setIsModalOpen(true);
          return;
        }
      }
    } catch (e) {}

    setDraftRestoredNotice(false);
    setOrderForm({
      customerId: customers[0]?.id || '',
      items: [],
      discount: 0,
      paymentMethod: PaymentMethod.PIX,
      status: OrderStatus.QUEUE,
      isPaid: false
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
    const resolvedPm = order.paymentMethod || (order as any).payment_method || (order.payments && order.payments[0]?.method) || PaymentMethod.PIX;
    setOrderForm({
      customerId: order.customerId || (order as any).customer_id || '',
      items: (order.items || []).map(i => ({ ...i })),
      discount: order.discount || 0,
      paymentMethod: (resolvedPm === 'Pix' || resolvedPm === PaymentMethod.PIX)
        ? PaymentMethod.PIX
        : (resolvedPm === 'Cartão' || resolvedPm === PaymentMethod.CARD)
        ? PaymentMethod.CARD
        : PaymentMethod.CASH,
      status: normalizeOrderStatus(order.status),
      isPaid: isOrderPaid(order)
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
      setFormError('Erro ao criar cliente: ' + (err.message || 'Verifique a tabela customers'));
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

  const executeOrderSave = async (
    fullPayload: any,
    basePayload: any,
    orderIdToUpdate: string | null,
    consumedMap: Record<string, number>,
    stockStatus: 'none' | 'confirmed' | 'partial' | 'refunded',
    consumedSuppliesMap: Record<string, number> = {}
  ) => {
    setIsSaving(true);
    setFormError(null);

    try {
      // Remove qualquer campo que comece com "_" de cada item
      const cleanItems = (fullPayload.items || []).map((item: any) => {
        const clean: Record<string, any> = {};
        for (const [key, val] of Object.entries(item)) {
          if (!key.startsWith('_')) {
            clean[key] = val;
          }
        }
        return clean;
      });

      const updatedDetalhes = {
        ...(fullPayload.detalhesPrecificacao || {}),
        consumedSupplies: consumedSuppliesMap
      };

      const orderPayload: any = {
        customerId: fullPayload.customerId || null,
        customer_id: fullPayload.customerId || null,
        totalValue: fullPayload.totalValue,
        total_value: fullPayload.total_value,
        status: fullPayload.status,
        items: cleanItems,
        discount: fullPayload.discount ?? 0,
        payments: fullPayload.payments ?? [],
        paymentMethod: fullPayload.paymentMethod,
        isPaid: fullPayload.isPaid,
        paymentStatus: fullPayload.paymentStatus,
        consumedFilaments: consumedMap,
        stockDeductionStatus: stockStatus,
        stockUpdatedAt: new Date().toISOString(),
        custosFinanceiros: fullPayload.custosFinanceiros || null,
        detalhesPrecificacao: updatedDetalhes
      };

      if (!orderIdToUpdate) {
        orderPayload.user_id = user.id;
        orderPayload.createdAt = new Date().toISOString();
        orderPayload.created_at = new Date().toISOString();
      }

      const { error } = orderIdToUpdate
        ? await supabase.from('orders').update(orderPayload).eq('id', orderIdToUpdate)
        : await supabase.from('orders').insert([orderPayload]);

      if (error) {
        throw new Error(error.message || 'Falha ao salvar pedido no Supabase.');
      }

      try {
        localStorage.removeItem('printflow_active_order_draft');
      } catch (e) {}
      setDraftRestoredNotice(false);

      await refreshData();
      setIsModalOpen(false);
      setEditingOrderId(null);
      setStockModal(null);
      setPageNotice({
        type: 'success',
        message: orderIdToUpdate 
          ? 'Pedido atualizado com sucesso!' 
          : 'Pedido registrado com sucesso!'
      });
    } catch (err: any) {
      console.error('Erro ao salvar pedido:', err);
      setFormError(err.message || 'Erro ao comunicar com o banco de dados.');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || isProcessingStock) return;
    setFormError(null);

    if (!orderForm.items || orderForm.items.length === 0) {
      setFormError('Selecione pelo menos uma peça ou adicione um item avulso.');
      return;
    }

    if (!user) {
      setFormError('Sessão de usuário não encontrada. Por favor, recarregue a página.');
      return;
    }

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

    const chosenMethod = orderForm.paymentMethod || PaymentMethod.PIX;
    const isPaid = Boolean(orderForm.isPaid);
    const paymentStatus = isPaid ? 'PAID' : 'PENDING';

    const basePayload: any = {
      customerId: safeCustomerId,
      customer_id: safeCustomerId,
      items: sanitizedItems,
      totalValue: Number(orderTotal) || 0,
      total_value: Number(orderTotal) || 0,
      status: orderForm.status || OrderStatus.QUEUE,
      paymentMethod: chosenMethod,
      paymentStatus: paymentStatus,
      isPaid: isPaid,
      discount: Number(orderForm.discount) || 0,
      user_id: user.id
    };

    if (!editingOrderId) {
      basePayload.createdAt = new Date().toISOString();
      basePayload.created_at = new Date().toISOString();
    }

    const fullPayload: any = {
      ...basePayload,
      discount: Number(orderForm.discount) || 0,
      paymentMethod: chosenMethod,
      paymentStatus: paymentStatus,
      isPaid: isPaid,
      custosFinanceiros: financialForm,
      detalhesPrecificacao: pricingBreakdown,
      payments: isPaid ? [{
        id: Math.random().toString(36).substring(2, 9),
        amount: Number(orderTotal) || 0,
        date: new Date().toISOString(),
        method: chosenMethod
      }] : []
    };

    // Calcula o consumo de filamento e de insumos necessário para este pedido
    const calculatedConsumption = calculateOrderFilamentConsumption(sanitizedItems, parts, filaments);
    const calculatedSupplies = calculateOrderSuppliesConsumption(sanitizedItems, parts);

    if (!editingOrderId) {
      // 1. NOVO PEDIDO: Solicitar confirmação antes de efetuar a baixa de filamento e insumos
      if (Object.keys(calculatedConsumption).length === 0 && Object.keys(calculatedSupplies).length === 0) {
        // Sem receitas nem insumos vinculados (ex: serviço ou item avulso) -> salva direto
        await executeOrderSave(fullPayload, basePayload, null, {}, 'none', {});
        return;
      }

      const filamentRows: StockPreviewRow[] = Object.entries(calculatedConsumption).map(([fId, grams]) => {
        const f = filaments.find(item => item.id === fId);
        const current = f?.remainingWeight ?? f?.weight ?? 1000;
        return {
          id: fId,
          itemType: 'filament',
          filamentId: fId,
          name: f ? `${f.brand} - ${f.material}` : 'Filamento',
          material: f?.material || 'PLA',
          colorName: f?.colorName || 'Cor Padrão',
          colorHex: f?.colorHex || '#3b82f6',
          unit: 'g',
          currentStock: current,
          deltaAmount: grams,
          finalStock: current - grams,
          apply: true,
          returnAmount: 0,
          maxReturnAmount: 0,
          currentWeight: current,
          deltaGrams: grams,
          finalWeight: current - grams,
          returnGrams: 0,
          maxReturnGrams: 0
        };
      });

      const supplyRows: StockPreviewRow[] = Object.entries(calculatedSupplies).map(([sId, qtyNeeded]) => {
        const s = supplies.find(item => item.id === sId);
        const current = Number(s?.quantity) || 0;
        return {
          id: sId,
          itemType: 'supply',
          supplyId: sId,
          name: s ? s.name : 'Insumo',
          material: s?.category || 'Insumo',
          colorName: s?.category || 'Componente',
          colorHex: '#10b981',
          unit: 'un',
          currentStock: current,
          deltaAmount: qtyNeeded,
          finalStock: current - qtyNeeded,
          apply: true,
          returnAmount: 0,
          maxReturnAmount: 0,
          currentWeight: current,
          deltaGrams: qtyNeeded,
          finalWeight: current - qtyNeeded,
          returnGrams: 0,
          maxReturnGrams: 0
        };
      });

      const rows: StockPreviewRow[] = [...filamentRows, ...supplyRows];

      setStockModal({
        isOpen: true,
        type: 'create',
        title: 'Confirmação de Baixa de Estoque',
        subtitle: 'Confira os carretéis de filamento e os insumos que terão baixa registrada na venda.',
        rows,
        pendingOrderData: { fullPayload, basePayload, orderIdToUpdate: null }
      });
    } else {
      // 2. EDIÇÃO DE PEDIDO: Calcular a diferença entre consumo anterior e novo consumo
      const existingOrder = orders.find(o => o.id === editingOrderId);
      const prevConsumption = getOrderConsumedFilaments(existingOrder);
      const prevSupplies = getOrderConsumedSupplies(existingOrder, parts);

      // Compara prevConsumption vs calculatedConsumption
      const allFilamentIds = Array.from(new Set([
        ...Object.keys(prevConsumption),
        ...Object.keys(calculatedConsumption)
      ]));

      const changedRows: StockPreviewRow[] = [];

      allFilamentIds.forEach(fId => {
        const prev = prevConsumption[fId] || 0;
        const next = calculatedConsumption[fId] || 0;
        const delta = next - prev;

        if (delta !== 0) {
          const f = filaments.find(item => item.id === fId);
          const current = f?.remainingWeight ?? f?.weight ?? 1000;
          const finalWeight = delta > 0 ? (current - delta) : (current + Math.abs(delta));

          changedRows.push({
            id: fId,
            itemType: 'filament',
            filamentId: fId,
            name: f ? `${f.brand} - ${f.material}` : 'Filamento',
            material: f?.material || 'PLA',
            colorName: f?.colorName || 'Cor Padrão',
            colorHex: f?.colorHex || '#3b82f6',
            unit: 'g',
            currentStock: current,
            deltaAmount: delta,
            finalStock: finalWeight,
            apply: true,
            returnAmount: delta < 0 ? Math.abs(delta) : 0,
            maxReturnAmount: delta < 0 ? Math.abs(delta) : 0,
            currentWeight: current,
            deltaGrams: delta,
            finalWeight,
            returnGrams: delta < 0 ? Math.abs(delta) : 0,
            maxReturnGrams: delta < 0 ? Math.abs(delta) : 0
          });
        }
      });

      // Compara prevSupplies vs calculatedSupplies
      const allSupplyIds = Array.from(new Set([
        ...Object.keys(prevSupplies),
        ...Object.keys(calculatedSupplies)
      ]));

      allSupplyIds.forEach(sId => {
        const prev = prevSupplies[sId] || 0;
        const next = calculatedSupplies[sId] || 0;
        const delta = next - prev;

        if (delta !== 0) {
          const s = supplies.find(item => item.id === sId);
          const current = Number(s?.quantity) || 0;
          const finalStock = delta > 0 ? (current - delta) : (current + Math.abs(delta));

          changedRows.push({
            id: sId,
            itemType: 'supply',
            supplyId: sId,
            name: s ? s.name : 'Insumo',
            material: s?.category || 'Insumo',
            colorName: s?.category || 'Componente',
            colorHex: '#10b981',
            unit: 'un',
            currentStock: current,
            deltaAmount: delta,
            finalStock,
            apply: true,
            returnAmount: delta < 0 ? Math.abs(delta) : 0,
            maxReturnAmount: delta < 0 ? Math.abs(delta) : 0,
            currentWeight: current,
            deltaGrams: delta,
            finalWeight: finalStock,
            returnGrams: delta < 0 ? Math.abs(delta) : 0,
            maxReturnGrams: delta < 0 ? Math.abs(delta) : 0
          });
        }
      });

      if (changedRows.length === 0) {
        // Nenhuma alteração no consumo -> salva direto sem perturbar estoque
        await executeOrderSave(
          fullPayload, 
          basePayload, 
          editingOrderId, 
          prevConsumption, 
          existingOrder?.stockDeductionStatus || 'confirmed',
          prevSupplies
        );
        return;
      }

      setStockModal({
        isOpen: true,
        type: 'edit',
        title: 'Ajuste de Estoque por Edição de Pedido',
        subtitle: 'As alterações nas peças modificaram o consumo de filamentos ou insumos. Movimente apenas as diferenças apuradas.',
        rows: changedRows,
        orderId: editingOrderId,
        orderCode: editingOrderId.slice(0, 5).toUpperCase(),
        pendingOrderData: { fullPayload, basePayload, orderIdToUpdate: editingOrderId }
      });
    }
  };

  const handleConfirmStockMovement = async (approvedRows: StockPreviewRow[], skipStock = false) => {
    if (isProcessingStock || !stockModal) return;
    setIsProcessingStock(true);

    try {
      let warningMsg: string | null = null;

      // 1. Validação prévia de saldo (Etapa 2 - Regra anti-estoque negativo)
      if (!skipStock && (stockModal.type === 'create' || stockModal.type === 'edit')) {
        const rowsToCheck = approvedRows.filter(r => r.apply && (r.deltaAmount ?? r.deltaGrams) > 0);
        for (const row of rowsToCheck) {
          const delta = row.deltaAmount ?? row.deltaGrams;
          if (row.itemType === 'supply') {
            const s = supplies.find(x => x.id === (row.supplyId || row.id));
            const localBalance = Number(s?.quantity) || 0;
            if (localBalance < delta) {
              const missing = delta - localBalance;
              throw new Error(`Estoque insuficiente no insumo "${row.name}": saldo disponível é de ${localBalance} un, mas são necessários ${delta} un (faltam ${missing} un). Ajuste o pedido ou use "Salvar sem Baixar Estoque".`);
            }
          } else {
            const currentSpool = filaments.find(f => f.id === (row.filamentId || row.id));
            const localBalance = currentSpool?.remainingWeight ?? currentSpool?.weight ?? 1000;
            if (localBalance < delta) {
              const missing = delta - localBalance;
              throw new Error(`Estoque insuficiente no carretel "${row.name}": saldo em tela é de ${localBalance}g, mas são necessários ${delta}g (faltam ${missing}g). Ajuste o pedido ou use "Salvar sem Baixar Estoque".`);
            }
          }
        }
      }

      if (stockModal.type === 'create') {
        const confirmedConsumedFilaments: Record<string, number> = {};
        const confirmedConsumedSupplies: Record<string, number> = {};
        const debitedSpools: { filamentId: string; grams: number; previousWeight: number }[] = [];
        const debitedSupplies: { supplyId: string; amount: number; previousQuantity: number }[] = [];

        if (!skipStock) {
          const updatesToRun = approvedRows.filter(r => r.apply && (r.deltaAmount ?? r.deltaGrams) > 0);
          
          for (const row of updatesToRun) {
            const delta = row.deltaAmount ?? row.deltaGrams;

            if (row.itemType === 'supply') {
              const supplyId = row.supplyId || row.id;
              const { data: freshSupply, error: fetchErr } = await supabase
                .from('supplies')
                .select('quantity, name')
                .eq('id', supplyId)
                .single();

              if (fetchErr || !freshSupply) {
                throw new Error(`Não foi possível verificar o saldo em tempo real do insumo "${row.name}" no banco de dados.`);
              }

              const currentQuantity = Number(freshSupply.quantity) || 0;
              if (currentQuantity < delta) {
                const missing = delta - currentQuantity;
                throw new Error(`Estoque insuficiente no insumo "${freshSupply.name}": saldo disponível no banco é de ${currentQuantity} un, necessário ${delta} un (faltam ${missing} un). A baixa foi interrompida para proteger seu estoque.`);
              }

              const newQuantity = currentQuantity - delta;

              const { error: updErr } = await supabase
                .from('supplies')
                .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
                .eq('id', supplyId);

              if (updErr) {
                throw new Error(`Falha ao debitar insumo ${row.name} no Supabase: ${updErr.message}`);
              }

              confirmedConsumedSupplies[supplyId] = delta;
              debitedSupplies.push({ supplyId, amount: delta, previousQuantity: currentQuantity });
            } else {
              const filamentId = row.filamentId || row.id;
              // Re-consulta o saldo atual diretamente no Supabase para mitigar concorrência
              const { data: freshFil, error: fetchErr } = await supabase
                .from('filaments')
                .select('remainingWeight, weight, brand, material')
                .eq('id', filamentId)
                .single();

              if (fetchErr || !freshFil) {
                throw new Error(`Não foi possível verificar o saldo em tempo real do carretel ${row.name} no banco de dados.`);
              }

              const currentWeight = Number(freshFil.remainingWeight ?? freshFil.weight ?? 1000);
              if (currentWeight < delta) {
                const missing = delta - currentWeight;
                throw new Error(`Estoque insuficiente no carretel "${freshFil.brand} - ${freshFil.material}": saldo disponível no banco é de ${currentWeight}g, necessário ${delta}g (faltam ${missing}g). A baixa foi interrompida para proteger seu estoque.`);
              }

              const newWeight = currentWeight - delta;

              const { error: updErr } = await supabase
                .from('filaments')
                .update({ remainingWeight: newWeight })
                .eq('id', filamentId);

              if (updErr) {
                throw new Error(`Falha ao debitar carretel ${row.name} no Supabase: ${updErr.message}`);
              }

              confirmedConsumedFilaments[filamentId] = delta;
              debitedSpools.push({ filamentId, grams: delta, previousWeight: currentWeight });
            }
          }

          // Atualização otimista no estado local dos insumos
          if (debitedSupplies.length > 0) {
            setSupplies(prev => prev.map(s => {
              const d = debitedSupplies.find(item => item.supplyId === s.id);
              return d ? { ...s, quantity: Math.max(0, s.quantity - d.amount) } : s;
            }));
          }
        }

        const pending = stockModal.pendingOrderData;
        if (pending) {
          try {
            await executeOrderSave(
              pending.fullPayload,
              pending.basePayload,
              null,
              confirmedConsumedFilaments,
              skipStock ? 'none' : ((Object.keys(confirmedConsumedFilaments).length > 0 || Object.keys(confirmedConsumedSupplies).length > 0) ? 'confirmed' : 'none'),
              confirmedConsumedSupplies
            );
          } catch (saveErr: any) {
            console.error('Falha ao salvar pedido após baixa:', saveErr);
            if (debitedSpools.length > 0 || debitedSupplies.length > 0) {
              setPageNotice({
                type: 'error',
                message: `Atenção crítica: O estoque foi debitado no banco, mas a gravação do pedido falhou: ${saveErr.message}. Não tente baixar novamente para evitar duplicidade; tente salvar novamente o pedido sem baixa.`
              });
            }
            throw saveErr;
          }
        }
      } else if (stockModal.type === 'edit') {
        const existingOrder = orders.find(o => o.id === stockModal.orderId);
        const prevConsumedFilaments = getOrderConsumedFilaments(existingOrder);
        const prevConsumedSupplies = getOrderConsumedSupplies(existingOrder, parts);
        const newCalculatedFilaments = calculateOrderFilamentConsumption(
          stockModal.pendingOrderData?.fullPayload?.items || [],
          parts,
          filaments
        );
        const newCalculatedSupplies = calculateOrderSuppliesConsumption(
          stockModal.pendingOrderData?.fullPayload?.items || [],
          parts
        );
        const finalConsumedFilaments = { ...newCalculatedFilaments };
        const finalConsumedSupplies = { ...newCalculatedSupplies };
        const debitedSpools: { filamentId: string; grams: number }[] = [];
        const debitedSupplies: { supplyId: string; amount: number }[] = [];
        const updatedSuppliesLocal: { id: string; newQty: number }[] = [];

        if (!skipStock) {
          for (const row of approvedRows) {
            if (!row.apply) continue;
            const delta = row.deltaAmount ?? row.deltaGrams;

            if (row.itemType === 'supply') {
              const supplyId = row.supplyId || row.id;
              const { data: freshSupply, error: fetchErr } = await supabase
                .from('supplies')
                .select('quantity, name')
                .eq('id', supplyId)
                .single();

              if (fetchErr || !freshSupply) {
                throw new Error(`Não foi possível consultar o saldo do insumo ${row.name} no banco.`);
              }

              const currentQuantity = Number(freshSupply.quantity) || 0;
              let newQuantity = currentQuantity;

              if (delta > 0) {
                if (currentQuantity < delta) {
                  const missing = delta - currentQuantity;
                  throw new Error(`Estoque insuficiente para consumo adicional no insumo "${freshSupply.name}": disponível ${currentQuantity} un, necessário ${delta} un (faltam ${missing} un).`);
                }
                newQuantity = currentQuantity - delta;
                debitedSupplies.push({ supplyId, amount: delta });
              } else if (delta < 0) {
                const amountToReturn = Math.min(Math.abs(delta), Math.max(0, row.returnAmount ?? row.returnGrams ?? 0));
                newQuantity = currentQuantity + amountToReturn;
                if (amountToReturn < Math.abs(delta)) {
                  finalConsumedSupplies[supplyId] = (prevConsumedSupplies[supplyId] || 0) - amountToReturn;
                }
              }

              if (newQuantity !== currentQuantity) {
                const { error: updErr } = await supabase
                  .from('supplies')
                  .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
                  .eq('id', supplyId);

                if (updErr) {
                  throw new Error(`Erro ao atualizar estoque do insumo ${row.name}: ${updErr.message}`);
                }
                updatedSuppliesLocal.push({ id: supplyId, newQty: newQuantity });
              }
            } else {
              const filamentId = row.filamentId || row.id;
              const { data: freshFil, error: fetchErr } = await supabase
                .from('filaments')
                .select('remainingWeight, weight, brand, material')
                .eq('id', filamentId)
                .single();

              if (fetchErr || !freshFil) {
                throw new Error(`Não foi possível consultar o saldo do carretel ${row.name} no banco.`);
              }

              const currentWeight = Number(freshFil.remainingWeight ?? freshFil.weight ?? 1000);
              let newWeight = currentWeight;

              if (delta > 0) {
                if (currentWeight < delta) {
                  const missing = delta - currentWeight;
                  throw new Error(`Estoque insuficiente para consumo adicional no carretel "${freshFil.brand} - ${freshFil.material}": disponível ${currentWeight}g, necessário ${delta}g (faltam ${missing}g).`);
                }
                newWeight = currentWeight - delta;
                debitedSpools.push({ filamentId, grams: delta });
              } else if (delta < 0) {
                const gramsToReturn = Math.min(Math.abs(delta), Math.max(0, row.returnGrams ?? row.returnAmount ?? 0));
                newWeight = currentWeight + gramsToReturn;
                if (gramsToReturn < Math.abs(delta)) {
                  finalConsumedFilaments[filamentId] = (prevConsumedFilaments[filamentId] || 0) - gramsToReturn;
                }
              }

              if (newWeight !== currentWeight) {
                const { error: updErr } = await supabase
                  .from('filaments')
                  .update({ remainingWeight: newWeight })
                  .eq('id', filamentId);

                if (updErr) {
                  throw new Error(`Erro ao atualizar estoque do carretel ${row.name}: ${updErr.message}`);
                }
              }
            }
          }

          if (updatedSuppliesLocal.length > 0) {
            setSupplies(prev => prev.map(s => {
              const u = updatedSuppliesLocal.find(x => x.id === s.id);
              return u ? { ...s, quantity: u.newQty } : s;
            }));
          }
        }

        const pending = stockModal.pendingOrderData;
        if (pending) {
          try {
            await executeOrderSave(
              pending.fullPayload,
              pending.basePayload,
              stockModal.orderId!,
              skipStock ? prevConsumedFilaments : finalConsumedFilaments,
              skipStock ? (existingOrder?.stockDeductionStatus || 'none') : 'confirmed',
              skipStock ? prevConsumedSupplies : finalConsumedSupplies
            );
          } catch (saveErr: any) {
            if (debitedSpools.length > 0 || debitedSupplies.length > 0) {
              setPageNotice({
                type: 'error',
                message: `Atenção: A movimentação de estoque foi efetuada no banco, mas a atualização do pedido falhou: ${saveErr.message}. Não tente aplicar novamente para evitar duplicidade.`
              });
            }
            throw saveErr;
          }
        }
      } else if (stockModal.type === 'cancel') {
        const orderToCancel = orders.find(o => o.id === stockModal.orderId);
        if (!orderToCancel) return;

        const prevConsumedFilaments = getOrderConsumedFilaments(orderToCancel);
        const prevConsumedSupplies = getOrderConsumedSupplies(orderToCancel, parts);
        const updatedConsumedFilaments = { ...prevConsumedFilaments };
        const updatedConsumedSupplies = { ...prevConsumedSupplies };
        let returnedAny = false;
        const updatedSuppliesLocal: { id: string; newQty: number }[] = [];

        if (!skipStock) {
          for (const row of approvedRows) {
            if (row.itemType === 'supply') {
              const supplyId = row.supplyId || row.id;
              const maxRet = row.maxReturnAmount ?? row.maxReturnGrams ?? 0;
              const amtToReturn = Math.max(0, Math.min(maxRet, Number(row.returnAmount ?? row.returnGrams) || 0));
              if (amtToReturn > 0) {
                const { data: freshSupply, error: fetchErr } = await supabase
                  .from('supplies')
                  .select('quantity, name')
                  .eq('id', supplyId)
                  .single();

                const currentQty = Number(freshSupply?.quantity) || 0;
                const newQty = currentQty + amtToReturn;

                const { error: updErr } = await supabase
                  .from('supplies')
                  .update({ quantity: newQty, updated_at: new Date().toISOString() })
                  .eq('id', supplyId);

                if (updErr) {
                  throw new Error(`Não foi possível devolver o insumo ${row.name}: ${updErr.message}`);
                } else {
                  updatedConsumedSupplies[supplyId] = Math.max(0, (prevConsumedSupplies[supplyId] || 0) - amtToReturn);
                  returnedAny = true;
                  updatedSuppliesLocal.push({ id: supplyId, newQty });
                }
              }
            } else {
              const filamentId = row.filamentId || row.id;
              const gramsToReturn = Math.max(0, Math.min(row.maxReturnGrams, Number(row.returnGrams ?? row.returnAmount) || 0));
              if (gramsToReturn > 0) {
                const { data: freshFil, error: fetchErr } = await supabase
                  .from('filaments')
                  .select('remainingWeight, weight, brand, material')
                  .eq('id', filamentId)
                  .single();

                const currentWeight = Number(freshFil?.remainingWeight ?? freshFil?.weight ?? 1000);
                const newWeight = currentWeight + gramsToReturn;

                const { error: updErr } = await supabase
                  .from('filaments')
                  .update({ remainingWeight: newWeight })
                  .eq('id', filamentId);

                if (updErr) {
                  throw new Error(`Não foi possível devolver o material ao carretel ${row.name}: ${updErr.message}`);
                } else {
                  updatedConsumedFilaments[filamentId] = Math.max(0, (prevConsumedFilaments[filamentId] || 0) - gramsToReturn);
                  returnedAny = true;
                }
              }
            }
          }

          if (updatedSuppliesLocal.length > 0) {
            setSupplies(prev => prev.map(s => {
              const u = updatedSuppliesLocal.find(x => x.id === s.id);
              return u ? { ...s, quantity: u.newQty } : s;
            }));
          }
        }

        // Atualiza o status do pedido para CANCELLED no Supabase, preservando detalhesPrecificacao com consumedSupplies
        const existingDetalhes = (orderToCancel as any)?.detalhesPrecificacao || {};
        const updateData: any = {
          status: OrderStatus.CANCELLED,
          consumedFilaments: updatedConsumedFilaments,
          detalhesPrecificacao: {
            ...existingDetalhes,
            consumedSupplies: updatedConsumedSupplies
          },
          stockDeductionStatus: returnedAny ? 'refunded' : (orderToCancel.stockDeductionStatus || 'none'),
          stockUpdatedAt: new Date().toISOString()
        };

        const { error: cancelError } = await supabase
          .from('orders')
          .update(updateData)
          .eq('id', orderToCancel.id);

        if (cancelError) {
          throw new Error(cancelError.message || 'Falha ao atualizar status para cancelado.');
        }

        await refreshData();
        setStockModal(null);
        setPageNotice({
          type: 'success',
          message: returnedAny 
            ? `Pedido #${orderToCancel.id.slice(0, 5).toUpperCase()} cancelado e estoque estornado com sucesso!` 
            : `Pedido #${orderToCancel.id.slice(0, 5).toUpperCase()} cancelado (estoque mantido sem alterações).`
        });
      }

      if (warningMsg) {
        setPageNotice({ type: 'warning', message: warningMsg });
      }
    } catch (err: any) {
      console.error('Erro na movimentação de estoque:', err);
      setPageNotice({ type: 'error', message: 'Erro ao processar movimentação: ' + (err.message || 'Falha na conexão') });
    } finally {
      setIsProcessingStock(false);
    }
  };

  const updateModalRow = (index: number, updates: Partial<StockPreviewRow>) => {
    if (!stockModal) return;
    setStockModal(prev => {
      if (!prev) return null;
      const nextRows = [...prev.rows];
      const target = { ...nextRows[index], ...updates };

      if ('returnAmount' in updates || 'returnGrams' in updates) {
        const inputVal = updates.returnAmount !== undefined ? updates.returnAmount : updates.returnGrams;
        const maxVal = target.maxReturnAmount ?? target.maxReturnGrams ?? 0;
        const validReturn = Math.max(0, Math.min(maxVal, Number(inputVal) || 0));
        target.returnAmount = validReturn;
        target.returnGrams = validReturn;
        const currentBal = target.currentStock ?? target.currentWeight;
        target.finalStock = currentBal + validReturn;
        target.finalWeight = currentBal + validReturn;
        target.apply = validReturn > 0;
      }

      nextRows[index] = target;
      return { ...prev, rows: nextRows };
    });
  };

  const handleCancelOrderRequest = (order: Order) => {
    const consumedFilaments = getOrderConsumedFilaments(order);
    const consumedFilamentEntries = Object.entries(consumedFilaments).filter(([_, g]) => g > 0);
    const consumedSupplies = getOrderConsumedSupplies(order, parts);
    const consumedSupplyEntries = Object.entries(consumedSupplies).filter(([_, q]) => q > 0);

    if (consumedFilamentEntries.length === 0 && consumedSupplyEntries.length === 0) {
      setCancelPromptOrder(order);
      return;
    }

    const rows: StockPreviewRow[] = [];

    // Filamentos
    consumedFilamentEntries.forEach(([fId, grams]) => {
      const f = filaments.find(item => item.id === fId);
      const current = f?.remainingWeight ?? f?.weight ?? 1000;
      rows.push({
        id: fId,
        itemType: 'filament',
        filamentId: fId,
        name: f ? `${f.brand} - ${f.material}` : 'Filamento',
        material: f?.material || 'PLA',
        colorName: f?.colorName || 'Cor Padrão',
        colorHex: f?.colorHex || '#3b82f6',
        unit: 'g',
        currentStock: current,
        deltaAmount: -grams,
        finalStock: current,
        apply: false,
        returnAmount: 0,
        maxReturnAmount: grams,
        currentWeight: current,
        deltaGrams: -grams,
        finalWeight: current,
        returnGrams: 0,
        maxReturnGrams: grams
      });
    });

    // Insumos
    consumedSupplyEntries.forEach(([sId, qty]) => {
      const s = supplies.find(item => item.id === sId);
      const current = Number(s?.quantity) || 0;
      rows.push({
        id: sId,
        itemType: 'supply',
        supplyId: sId,
        name: s ? s.name : 'Insumo',
        material: s?.category || 'Insumo',
        colorName: s?.category || 'Componente',
        colorHex: '#10b981',
        unit: 'un',
        currentStock: current,
        deltaAmount: -qty,
        finalStock: current,
        apply: false,
        returnAmount: 0,
        maxReturnAmount: qty,
        currentWeight: current,
        deltaGrams: -qty,
        finalWeight: current,
        returnGrams: 0,
        maxReturnGrams: qty
      });
    });

    setStockModal({
      isOpen: true,
      type: 'cancel',
      title: `Cancelar Pedido #${order.id.slice(0, 5).toUpperCase()}`,
      subtitle: 'Este pedido registrou consumo de filamentos e/ou insumos. Escolha quanto material ou peças não utilizadas devem voltar ao estoque.',
      rows,
      orderId: order.id,
      orderCode: order.id.slice(0, 5).toUpperCase()
    });
  };

  const handleStatusChangeRequest = (order: Order, newStatus: OrderStatus) => {
    if (newStatus === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED) {
      handleCancelOrderRequest(order);
      return;
    }
    updateStatus(order.id, newStatus);
  };

  const addCatalogPart = (partId: string) => {
    const part = parts.find(p => p.id === partId);
    if (!part) return;
    const costs = calculatePartCosts(part, filaments, printers, settings, supplies);
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

  const requestDeleteOrder = (order: Order, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const consumed = getOrderConsumedFilaments(order);
    const totalGrams = Object.values(consumed).reduce((s, g) => s + g, 0);
    const customer = customers.find(c => c.id === order.customerId);
    const customerName = customer?.name || 'Cliente Balcão';

    setDeleteOrderTarget({
      id: order.id,
      code: order.id.slice(0, 5).toUpperCase(),
      customerName,
      totalGrams
    });
  };

  const confirmDeleteOrder = async () => {
    if (!deleteOrderTarget) return;
    setIsDeletingOrder(true);
    const idToDelete = deleteOrderTarget.id;
    const code = deleteOrderTarget.code;

    try {
      // Atualização otimista imediata para feedback responsivo
      setOrders(orders.filter(o => o.id !== idToDelete));
      const { error } = await supabase.from('orders').delete().eq('id', idToDelete);
      if (error) throw error;

      setPageNotice({ type: 'success', message: `Pedido #${code} excluído com sucesso!` });
      setTimeout(() => setPageNotice(null), 3500);
      setDeleteOrderTarget(null);
      await refreshData();
    } catch (err: any) {
      console.error('Erro ao excluir pedido:', err);
      setPageNotice({ type: 'error', message: 'Erro ao excluir pedido: ' + (err.message || 'Falha no banco de dados.') });
      await refreshData();
    } finally {
      setIsDeletingOrder(false);
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

  const handleTogglePaymentStatus = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentlyPaid = isOrderPaid(order);
    const newPaid = !currentlyPaid;
    const chosenMethod = order.paymentMethod || PaymentMethod.PIX;
    const orderTotal = Number(order.totalValue ?? (order as any).total_value ?? 0);

    const updatedPayments = newPaid ? [{
      id: Math.random().toString(36).substring(2, 9),
      amount: orderTotal,
      date: new Date().toISOString(),
      method: chosenMethod
    }] : [];

    // Atualização otimista no estado
    setOrders(orders.map(o => {
      if (o.id !== order.id) return o;
      return {
        ...o,
        isPaid: newPaid,
        paymentStatus: newPaid ? 'PAID' : 'PENDING',
        payments: updatedPayments,
        paymentMethod: chosenMethod
      };
    }));

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          isPaid: newPaid,
          paymentStatus: newPaid ? 'PAID' : 'PENDING',
          payments: updatedPayments,
          paymentMethod: chosenMethod
        })
        .eq('id', order.id);

      if (error) {
        throw new Error(error.message || 'Falha ao atualizar pedido no Supabase');
      }

      setPageNotice({
        type: 'success',
        message: newPaid 
          ? `Pagamento do pedido #${order.id.slice(0, 5).toUpperCase()} confirmado com sucesso! Lançado no faturamento em caixa.`
          : `Pedido #${order.id.slice(0, 5).toUpperCase()} marcado como "Aguardando Pagamento". Removido do faturamento realizado.`
      });
      setTimeout(() => setPageNotice(null), 4000);
      await refreshData();
    } catch (err: any) {
      console.error('Erro ao alternar pagamento:', err);
      await refreshData();
      setPageNotice({
        type: 'error',
        message: 'Erro ao alterar status de pagamento: ' + (err.message || 'Falha de comunicação.')
      });
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
            onClick={() => setIsQuickQuoteOpen(true)} 
            className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 text-emerald-300 border border-emerald-500/40 px-3.5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-sm transition active:scale-95"
            title="Simular Orçamento Flash para WhatsApp em segundos"
          >
            <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
            <span className="hidden sm:inline">Orçamento Flash</span>
            <span className="sm:hidden">Flash</span>
          </button>
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
            const isPaid = isOrderPaid(order);

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
                        
                        {/* Botão de Status de Pagamento (1 clique para alternar) */}
                        <button
                          type="button"
                          onClick={(e) => handleTogglePaymentStatus(order, e)}
                          title={isPaid ? "Pagamento Confirmado (Em Caixa). Clique para marcar como Aguardando." : "Aguardando Pagamento do Cliente (A Receber). Clique para confirmar recebimento."}
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 transition-all active:scale-95 ${
                            isPaid
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/40'
                          }`}
                        >
                          {isPaid ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Pago</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span>Aguardando Pagamento</span>
                            </>
                          )}
                        </button>

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
                      <p className={`text-[10px] font-bold mt-0.5 flex items-center justify-end gap-1 ${isPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isPaid ? '✓ Em Caixa' : '⏳ A Receber'}
                      </p>
                    </div>

                    {/* Mudança de Status Rápida com emojis e labels de fábrica */}
                    <select 
                      className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${getStatusColor(order.status)}`}
                      value={normalizeOrderStatus(order.status)} 
                      onClick={e => e.stopPropagation()}
                      onChange={e => handleStatusChangeRequest(order, e.target.value as OrderStatus)}
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
                        type="button"
                        onClick={(e) => requestDeleteOrder(order, e)} 
                        title="Excluir Pedido"
                        className="p-2 text-zinc-600 hover:text-red-500 rounded-lg transition-colors hover:bg-red-500/10"
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
                                handleStatusChangeRequest(order, st.key);
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

                    {/* Status de Baixa de Estoque do Pedido */}
                    {(() => {
                      const consumed = getOrderConsumedFilaments(order);
                      const totalGrams = Object.values(consumed).reduce((sum, g) => sum + g, 0);
                      if (totalGrams <= 0) return null;

                      return (
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 bg-zinc-900/60 border border-zinc-800 px-3 py-2 rounded-xl flex-wrap">
                          <Package className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>
                            Estoque consumido: <strong className="text-zinc-200 font-mono">{totalGrams}g</strong> em {Object.keys(consumed).length} {Object.keys(consumed).length === 1 ? 'carretel' : 'carretéis'}.
                          </span>
                          {order.status === OrderStatus.CANCELLED && (
                            <span className="text-amber-400 font-bold ml-auto">
                              • Pedido Cancelado
                            </span>
                          )}
                        </div>
                      );
                    })()}

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
              {/* Aviso de Rascunho Recuperado Automaticamente */}
              {draftRestoredNotice && !editingOrderId && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-xs text-emerald-300 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>Rascunho recuperado:</strong> Seus itens foram mantidos salvos com segurança.</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={discardOrderDraft} 
                    className="text-xs font-bold text-red-400 hover:text-red-300 underline ml-2 shrink-0"
                  >
                    Limpar e recomeçar
                  </button>
                </div>
              )}

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
                  {orderForm.paymentMethod === PaymentMethod.PIX && (
                    <p className="text-[10px] text-zinc-400 mt-2">
                      {settings.businessInfo?.pixKey ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                          <span>Chave Pix cadastrada: será inserida automaticamente com QR Code no PDF.</span>
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                          <span>Chave Pix ainda não cadastrada em Ajustes/Configurações.</span>
                        </span>
                      )}
                    </p>
                  )}
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

                {/* Seleção da Situação do Pagamento (Regime de Caixa) */}
                <div className="col-span-1 sm:col-span-2 p-3.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <label className="text-xs font-black uppercase text-zinc-300 tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <span>Situação do Pagamento (Regime de Caixa)</span>
                    </label>
                    <span className="text-[10px] text-zinc-500 font-medium">Lançamento em faturamento condicionado ao pagamento</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setOrderForm(prev => ({ ...prev, isPaid: false }))}
                      className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                        !orderForm.isPaid
                          ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 ring-2 ring-amber-500/30'
                          : 'bg-zinc-800/40 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold leading-tight">⏳ Aguardando Pagamento (A Receber)</p>
                        <p className="text-[10px] text-zinc-400 mt-1">O valor ficará registrado como a receber e não inflará o faturamento realizado até a quitação.</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderForm(prev => ({ ...prev, isPaid: true }))}
                      className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                        orderForm.isPaid
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/30'
                          : 'bg-zinc-800/40 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold leading-tight">✅ Pagamento Confirmado (Em Caixa)</p>
                        <p className="text-[10px] text-zinc-400 mt-1">Cliente já pagou. O valor entra de imediato no Faturamento Realizado do período.</p>
                      </div>
                    </button>
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

      {/* MODAL DE CONFIRMAÇÃO CIRÚRGICA DE ESTOQUE (CRIAÇÃO, DELTA E CANCELAMENTO) */}
      {stockModal && stockModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  stockModal.type === 'create'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                    : stockModal.type === 'edit'
                    ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
                    : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                }`}>
                  {stockModal.type === 'create' && <Package className="w-5 h-5" />}
                  {stockModal.type === 'edit' && <Edit2 className="w-5 h-5" />}
                  {stockModal.type === 'cancel' && <RotateCcw className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>{stockModal.title}</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {stockModal.subtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isProcessingStock}
                onClick={() => setStockModal(null)}
                className="w-9 h-9 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              {/* Banner Explicativo */}
              {stockModal.type === 'create' && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="block font-bold">Confirmação Prévia de Baixa de Material:</strong>
                    <span>
                      Ao confirmar, a quantidade calculada será debitada do saldo dos carretéis cadastrados. Se desejar salvar a encomenda sem mexer no estoque agora, clique em <strong>"Salvar sem Baixar"</strong>.
                    </span>
                  </div>
                </div>
              )}

              {stockModal.type === 'edit' && (
                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs flex items-start gap-2.5">
                  <SlidersHorizontal className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="block font-bold">Movimentação Cirúrgica de Diferença (Delta):</strong>
                    <span>
                      Apenas a diferença entre o consumo anterior e o novo consumo será movimentada (+ para consumo adicional, - para sobra que pode voltar ao carretel).
                    </span>
                  </div>
                </div>
              )}

              {stockModal.type === 'cancel' && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="block font-bold">Regra de Oficina 3D (Anti-desperdício):</strong>
                    <span>
                      O estoque <strong>NÃO é devolvido automaticamente</strong>. Devolva apenas material de peças que <strong>realmente NÃO foram impressas</strong> ou que possam ser reaproveitadas. Peças já prontas, danificadas ou perdas não devem ser devolvidas ao carretel.
                    </span>
                  </div>
                </div>
              )}

              {/* Lista de Filamentos e Insumos */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">
                    Itens de Estoque Vinculados ({stockModal.rows.length})
                  </label>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span> 
                      Filamentos ({stockModal.rows.filter(r => r.itemType !== 'supply').length})
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 
                      Insumos ({stockModal.rows.filter(r => r.itemType === 'supply').length})
                    </span>
                  </div>
                </div>

                {stockModal.rows.map((row, idx) => {
                  const isSupply = row.itemType === 'supply';
                  const unit = row.unit || (isSupply ? 'un' : 'g');
                  const currentBal = row.currentStock ?? row.currentWeight;
                  const deltaVal = row.deltaAmount ?? row.deltaGrams;
                  const finalBal = row.finalStock ?? row.finalWeight;
                  const isNegative = finalBal < 0;
                  const isLow = !isNegative && (isSupply ? finalBal <= 2 : finalBal < 100);
                  const returnVal = row.returnAmount ?? row.returnGrams ?? 0;
                  const maxReturnVal = row.maxReturnAmount ?? row.maxReturnGrams ?? 0;
                  const rowKey = row.id || (isSupply ? `sup_${row.supplyId}` : `fil_${row.filamentId}`);

                  return (
                    <div 
                      key={rowKey}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        row.apply 
                          ? 'bg-zinc-950 border-zinc-700/80' 
                          : 'bg-zinc-950/40 border-zinc-800/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        {/* Item Info (Filamento ou Insumo) */}
                        <div className="flex items-center gap-2.5 min-w-[180px]">
                          {isSupply ? (
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                              <PackageCheck className="w-4 h-4" />
                            </div>
                          ) : (
                            <div 
                              className="w-5 h-5 rounded-full border border-zinc-700 flex-shrink-0" 
                              style={{ backgroundColor: row.colorHex }}
                              title={row.colorName}
                            />
                          )}
                          <div>
                            <p className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>{row.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-normal ${
                                isSupply 
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20' 
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}>
                                {row.colorName || (isSupply ? 'Insumo' : 'Filamento')}
                              </span>
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              {isSupply ? 'Saldo em Estoque:' : 'Saldo em Carretel:'} <strong className="text-zinc-200 font-mono">{currentBal} {unit}</strong>
                            </p>
                          </div>
                        </div>

                        {/* Modo Criação */}
                        {stockModal.type === 'create' && (
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-xs font-mono font-black text-red-400 block">
                                - {deltaVal} {unit}
                              </span>
                              <span className={`text-[10px] font-mono font-bold ${
                                isNegative ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-emerald-400'
                              }`}>
                                Previsto: {finalBal} {unit}
                              </span>
                            </div>
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-zinc-300">
                              <input
                                type="checkbox"
                                checked={row.apply}
                                onChange={e => updateModalRow(idx, { apply: e.target.checked })}
                                className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0 cursor-pointer"
                              />
                              <span className="hidden sm:inline">Baixar</span>
                            </label>
                          </div>
                        )}

                        {/* Modo Edição */}
                        {stockModal.type === 'edit' && (
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              {deltaVal > 0 ? (
                                <>
                                  <span className="text-xs font-mono font-black text-red-400 block">
                                    + {deltaVal} {unit} (adicional)
                                  </span>
                                  <span className="text-[10px] font-mono text-zinc-400">
                                    Previsto: <strong className="text-emerald-400">{finalBal} {unit}</strong>
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-xs font-mono font-black text-emerald-400 block">
                                    - {Math.abs(deltaVal)} {unit} (sobra)
                                  </span>
                                  <span className="text-[10px] font-mono text-zinc-400">
                                    Estornar: <strong className="text-emerald-300">{returnVal} {unit}</strong>
                                  </span>
                                </>
                              )}
                            </div>
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-zinc-300">
                              <input
                                type="checkbox"
                                checked={row.apply}
                                onChange={e => updateModalRow(idx, { apply: e.target.checked })}
                                className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0 cursor-pointer"
                              />
                              <span className="hidden sm:inline">Ajustar</span>
                            </label>
                          </div>
                        )}

                        {/* Modo Cancelamento */}
                        {stockModal.type === 'cancel' && (
                          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                            <div className="text-right">
                              <span className="text-[10px] text-zinc-400 block">
                                Baixado no Pedido: <strong className="text-zinc-200 font-mono">{maxReturnVal} {unit}</strong>
                              </span>
                              <span className="text-[10px] font-mono font-bold text-emerald-400">
                                Saldo Previsto: {finalBal} {unit}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700/80 rounded-xl p-1">
                              <input
                                type="number"
                                min="0"
                                max={maxReturnVal}
                                value={returnVal}
                                onChange={e => updateModalRow(idx, { returnAmount: Number(e.target.value) || 0, returnGrams: Number(e.target.value) || 0 })}
                                className="w-16 bg-zinc-800 text-center text-xs font-mono font-bold rounded-lg py-1 px-1 text-white outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                              <span className="text-[10px] text-zinc-400 font-bold pr-1">{unit}</span>
                              <button
                                type="button"
                                onClick={() => updateModalRow(idx, { returnAmount: maxReturnVal, returnGrams: maxReturnVal })}
                                className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-400 font-bold transition"
                                title="Devolver toda a quantidade baixada ao estoque"
                              >
                                Tudo
                              </button>
                              <button
                                type="button"
                                onClick={() => updateModalRow(idx, { returnAmount: 0, returnGrams: 0 })}
                                className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-bold transition"
                                title="Não devolver nada (material consumido ou descartado)"
                              >
                                0{unit}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Alerta Detalhado de Saldo Insuficiente */}
                      {isNegative && (
                        <div className="w-full mt-2.5 p-2.5 rounded-xl bg-red-500/15 border border-red-500/50 text-red-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 animate-in fade-in">
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                            <span>
                              <strong>Estoque Insuficiente:</strong> Saldo atual: <strong className="text-white font-mono">{currentBal} {unit}</strong> | Necessário: <strong className="text-white font-mono">{deltaVal} {unit}</strong>
                            </span>
                          </div>
                          <span className="font-mono font-black text-red-300 bg-red-950/60 px-2 py-0.5 rounded-md border border-red-500/40 shrink-0">
                            Faltam {Math.abs(finalBal)} {unit}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Banner Geral de Bloqueio se houver itens insuficientes selecionados */}
                {stockModal.rows.some(r => r.apply && ((stockModal.type === 'create' && (r.finalStock ?? r.finalWeight) < 0) || (stockModal.type === 'edit' && (r.deltaAmount ?? r.deltaGrams) > 0 && (r.finalStock ?? r.finalWeight) < 0))) && (
                  <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/60 text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <strong className="block font-bold">Bloqueio de Integridade: Material/Insumo Insuficiente para Baixa</strong>
                      <p className="text-[11px] text-red-300 leading-snug">
                        O sistema protege seu estoque contra saldos negativos e baixas parciais fictícias. Para prosseguir, você pode <strong>desmarcar a opção "Baixar"</strong> neste item, alterar as quantidades do pedido ou clicar em <strong>"Salvar sem Baixar Estoque"</strong>.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer com Ações */}
            <div className="p-5 sm:p-6 border-t border-zinc-800 bg-zinc-900/90 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
              <button
                type="button"
                disabled={isProcessingStock}
                onClick={() => setStockModal(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition disabled:opacity-50 order-3 sm:order-1 cursor-pointer"
              >
                {stockModal.type === 'cancel' ? 'Voltar (Manter Pedido)' : 'Voltar ao Pedido'}
              </button>

              <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2 order-1 sm:order-2">
                {stockModal.type === 'create' && (
                  <button
                    type="button"
                    disabled={isProcessingStock}
                    onClick={() => handleConfirmStockMovement(stockModal.rows, true)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-bold text-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    Salvar sem Baixar Estoque
                  </button>
                )}

                {stockModal.type === 'edit' && (
                  <button
                    type="button"
                    disabled={isProcessingStock}
                    onClick={() => handleConfirmStockMovement(stockModal.rows, true)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-bold text-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    Salvar sem Alterar Estoque
                  </button>
                )}

                {stockModal.type === 'cancel' && (
                  <button
                    type="button"
                    disabled={isProcessingStock}
                    onClick={() => handleConfirmStockMovement(stockModal.rows, true)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-amber-500/40 hover:bg-amber-500/10 text-amber-300 font-bold text-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    Apenas Cancelar (Sem Devolver Material)
                  </button>
                )}

                {(() => {
                  const hasInsufficient = stockModal.rows.some(
                    r => r.apply && ((stockModal.type === 'create' && (r.finalStock ?? r.finalWeight) < 0) || (stockModal.type === 'edit' && (r.deltaAmount ?? r.deltaGrams) > 0 && (r.finalStock ?? r.finalWeight) < 0))
                  );

                  return (
                    <button
                      type="button"
                      disabled={isProcessingStock || hasInsufficient}
                      onClick={() => handleConfirmStockMovement(stockModal.rows, false)}
                      title={hasInsufficient ? 'Não é possível baixar com estoque insuficiente. Desmarque o item ou salve sem baixar.' : undefined}
                      className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-black text-xs transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 ${
                        hasInsufficient
                          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                          : stockModal.type === 'cancel'
                          ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-500/20 cursor-pointer'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20 cursor-pointer'
                      }`}
                    >
                      {isProcessingStock ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span>
                        {hasInsufficient
                          ? 'Estoque Insuficiente'
                          : stockModal.type === 'create'
                          ? 'Confirmar e Baixar Estoque'
                          : stockModal.type === 'edit'
                          ? 'Aplicar Diferenças e Salvar'
                          : 'Confirmar Cancelamento e Estorno'}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Pedido */}
      <ConfirmDeleteModal
        isOpen={!!deleteOrderTarget}
        title="Excluir Pedido"
        itemName={deleteOrderTarget ? `Pedido #${deleteOrderTarget.code} (${deleteOrderTarget.customerName})` : ''}
        description={
          deleteOrderTarget && deleteOrderTarget.totalGrams > 0
            ? `Atenção: Este pedido registrou ${deleteOrderTarget.totalGrams}g de filamento consumido nos carretéis.\n\nA exclusão removerá permanentemente o pedido e seu histórico de vendas do banco de dados. Deseja prosseguir?`
            : 'Tem certeza de que deseja excluir este pedido permanentemente do sistema? Esta ação não pode ser desfeita.'
        }
        confirmText="Sim, Excluir Pedido"
        isLoading={isDeletingOrder}
        onConfirm={confirmDeleteOrder}
        onClose={() => !isDeletingOrder && setDeleteOrderTarget(null)}
      />

      {/* Modal de Confirmação de Cancelamento de Pedido sem Consumo */}
      <ConfirmDeleteModal
        isOpen={!!cancelPromptOrder}
        title="Cancelar Pedido"
        itemName={cancelPromptOrder ? `Pedido #${cancelPromptOrder.id.slice(0, 5).toUpperCase()}` : ''}
        description="Deseja realmente cancelar este pedido? O status será alterado para Cancelado."
        confirmText="Sim, Cancelar Pedido"
        isDestructive={false}
        onConfirm={async () => {
          if (!cancelPromptOrder) return;
          const orderId = cancelPromptOrder.id;
          const code = orderId.slice(0, 5).toUpperCase();
          setCancelPromptOrder(null);
          await updateStatus(orderId, OrderStatus.CANCELLED);
          setPageNotice({ type: 'success', message: `Pedido #${code} cancelado com sucesso.` });
          setTimeout(() => setPageNotice(null), 3500);
        }}
        onClose={() => setCancelPromptOrder(null)}
      />

      {/* Modal do Simulador de Orçamento Flash WhatsApp */}
      <QuickQuoteModal
        isOpen={isQuickQuoteOpen}
        onClose={() => setIsQuickQuoteOpen(false)}
        onConvertToOrder={handleConvertFlashQuote}
      />
    </div>
  );
};

export default Orders;
