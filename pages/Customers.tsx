import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Customer, Order, OrderStatus } from '../types';
import { normalizeOrderStatus, getStatusConfig } from '../utils/statusUtils';
import { supabase } from '../services/supabase';
import { formatCurrency } from '../constants';
import { getRealisticOrderNumber, getQuotePdfBlob, downloadQuotePdf } from '../services/quotePdfGenerator';
import { QuotePdfModal } from '../components/QuotePdfModal';
import { 
  Plus, Search, Trash2, Edit2, MessageCircle, X, User as UserIcon, 
  Mail, Phone, Loader2, ShoppingBag, ChevronRight, Calendar, 
  DollarSign, CheckCircle2, Clock, Package, FileText, ArrowLeft, 
  TrendingUp, Sparkles, AlertCircle
} from 'lucide-react';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';

export const Customers: React.FC = () => {
  const { customers, setCustomers, orders, parts, filaments, settings, refreshData, user } = useApp();
  const navigate = useNavigate();

  // Estados principais
  const [searchTerm, setSearchTerm] = useState('');
  const [customerFilter, setCustomerFilter] = useState<'ALL' | 'WITH_SALES' | 'TOP_BUYERS'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; ordersCount: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Cliente selecionado para visualização de Vendas agrupadas
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [salesStatusFilter, setSalesStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [salesSearchTerm, setSalesSearchTerm] = useState('');

  // Modal de PDF do Orçamento
  const [pdfModalOrder, setPdfModalOrder] = useState<Order | null>(null);

  // Mapeia todas as vendas agrupadas por cliente
  const customerSalesMap = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      if (!order.customerId) continue;
      const list = map.get(order.customerId) || [];
      list.push(order);
      map.set(order.customerId, list);
    }
    return map;
  }, [orders]);

  // Estatísticas calculadas por cliente
  const getCustomerMetrics = (customerId: string) => {
    const clientOrders = (customerSalesMap.get(customerId) || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const totalSpent = clientOrders.reduce((sum, o) => sum + (Number(o.totalValue) || 0), 0);
    const count = clientOrders.length;
    const inProduction = clientOrders.filter(o => {
      const s = normalizeOrderStatus(o.status);
      return s === OrderStatus.PRINTING || s === OrderStatus.QUEUE || s === OrderStatus.FINISHING;
    }).length;
    const ready = clientOrders.filter(o => normalizeOrderStatus(o.status) === OrderStatus.READY).length;
    const delivered = clientOrders.filter(o => normalizeOrderStatus(o.status) === OrderStatus.DELIVERED).length;
    const lastOrder = clientOrders[0] || null;

    return { clientOrders, totalSpent, count, inProduction, ready, delivered, lastOrder };
  };

  // Filtra e ordena lista de clientes
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      const metrics = getCustomerMetrics(c.id);
      if (customerFilter === 'WITH_SALES') {
        return metrics.count > 0;
      }
      return true;
    }).sort((a, b) => {
      if (customerFilter === 'TOP_BUYERS') {
        const spentA = getCustomerMetrics(a.id).totalSpent;
        const spentB = getCustomerMetrics(b.id).totalSpent;
        return spentB - spentA;
      }
      return a.name.localeCompare(b.name);
    });
  }, [customers, searchTerm, customerFilter, customerSalesMap]);

  // Vendas do cliente selecionado com filtro de status e busca
  const selectedCustomerSales = useMemo(() => {
    if (!selectedCustomer) return [];
    const allSales = (customerSalesMap.get(selectedCustomer.id) || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return allSales.filter(sale => {
      const matchesStatus = salesStatusFilter === 'ALL' || sale.status === salesStatusFilter;
      if (!matchesStatus) return false;

      if (!salesSearchTerm.trim()) return true;
      const term = salesSearchTerm.toLowerCase();
      const matchesId = sale.id.toLowerCase().includes(term);
      const matchesNum = getRealisticOrderNumber(sale).toLowerCase().includes(term);
      const matchesItem = (sale.items || []).some(item => {
        const part = parts.find(p => p.id === item.partId);
        return (part?.name || item.name || '').toLowerCase().includes(term);
      });

      return matchesId || matchesNum || matchesItem;
    });
  }, [selectedCustomer, customerSalesMap, salesStatusFilter, salesSearchTerm, parts]);

  // Salvar / Criar cliente no Supabase
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer?.name || !editingCustomer?.phone || !user) return;
    setIsSaving(true);

    try {
      const payload = {
        ...editingCustomer,
        user_id: user.id,
      };

      let result;
      if (editingCustomer.id) {
        result = await supabase.from('customers').update(payload).eq('id', editingCustomer.id);
      } else {
        result = await supabase.from('customers').insert([{ ...payload, createdAt: new Date().toISOString() }]);
      }
      
      if (result.error) throw result.error;
      
      await refreshData();
      setIsModalOpen(false);
      setEditingCustomer(null);
    } catch (err: any) {
      alert('Erro Supabase: ' + err.message + '\n\nCertifique-se de que a tabela "customers" existe.');
    } finally {
      setIsSaving(false);
    }
  };

  // Excluir cliente
  const requestDeleteCustomer = (customer: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ordersCount = (customerSalesMap.get(customer.id) || []).length;
    setDeleteTarget({
      id: customer.id,
      name: customer.name,
      ordersCount
    });
  };

  const confirmDeleteCustomer = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const idToDelete = deleteTarget.id;

    try {
      // Atualização otimista imediata para fluidez máxima
      setCustomers(customers.filter(c => c.id !== idToDelete));
      if (selectedCustomer?.id === idToDelete) {
        setSelectedCustomer(null);
      }
      const { error } = await supabase.from('customers').delete().eq('id', idToDelete);
      if (error) throw error;

      setActionNotice({ type: 'success', message: 'Cliente excluído com sucesso!' });
      setTimeout(() => setActionNotice(null), 3500);
      setDeleteTarget(null);
      await refreshData();
    } catch (err: any) {
      console.error('Erro ao excluir cliente:', err);
      setActionNotice({ 
        type: 'error', 
        message: 'Erro ao excluir cliente: ' + (err.message || 'Verifique se não há restrições de integridade no banco de dados.') 
      });
      await refreshData();
    } finally {
      setIsDeleting(false);
    }
  };

  // WhatsApp
  const openWhatsApp = (phone: string, customerName?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const cleanPhone = phone.replace(/\D/g, '');
    const greeting = customerName ? `Olá ${customerName}! Tudo bem?` : 'Olá! Tudo bem?';
    window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(greeting)}`, '_blank');
  };

  // WhatsApp com detalhes da venda e anexo do PDF
  const shareOrderOnWhatsApp = async (order: Order, customer: Customer) => {
    const cleanPhone = customer.phone.replace(/\D/g, '');
    const orderNum = getRealisticOrderNumber(order);
    const dateStr = new Date(order.createdAt).toLocaleDateString('pt-BR');
    const filename = `Orcamento_${orderNum.replace('#', '')}.pdf`;
    const companyName = settings.businessInfo?.companyName || 'PRINT_3Dbr';

    const itemsList = (order.items || []).map(i => {
      const part = parts.find(p => p.id === i.partId);
      return `• ${i.quantity}x ${i.name || part?.name || 'Item 3D'} - ${formatCurrency(i.unitPrice * i.quantity)}`;
    }).join('\n');

    const message = 
      `Olá *${customer.name}*!\n\n` +
      `Aqui está a proposta técnica de orçamento da *${companyName}*:\n` +
      `*Pedido:* ${orderNum}\n` +
      `*Data:* ${dateStr}\n` +
      `*Status:* ${order.status}\n\n` +
      `*Itens:* \n${itemsList}\n\n` +
      (order.discount ? `*Desconto:* -${formatCurrency(order.discount)}\n` : '') +
      `*VALOR TOTAL:* ${formatCurrency(order.totalValue)}\n` +
      `*Pagamento:* ${order.paymentMethod || 'Pix'}\n\n` +
      `O arquivo PDF oficial está em anexo. Qualquer dúvida, estamos à disposição!`;

    try {
      const pdfBlob = await getQuotePdfBlob({
        order,
        customer,
        parts,
        filaments,
        settings
      });
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      // Se suportar compartilhamento direto de arquivo (ex: celular)
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Orçamento ${orderNum} - ${companyName}`,
          text: message,
          files: [file]
        });
        return;
      }

      // Fallback no computador: baixa o PDF e abre a conversa
      await downloadQuotePdf({ order, customer, parts, filaments, settings });
      window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
      }
    }
  };

  // Navegar para criar nova venda para o cliente
  const handleCreateOrderForCustomer = (customer: Customer) => {
    navigate('/orders', { state: { customerId: customer.id, openNew: true } });
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-zinc-100 flex items-center gap-2">
            Clientes & Vendas
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {customers.length} cadastrados
            </span>
          </h2>
          <p className="text-sm text-zinc-400">
            Clique em qualquer cliente para ver todas as vendas, orçamentos e histórico agrupado
          </p>
        </div>

        <button 
          onClick={() => {
            setEditingCustomer({ name: '', phone: '', email: '', notes: '' });
            setIsModalOpen(true);
          }}
          className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 font-black transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Cliente</span>
        </button>
      </div>

      {/* Alerta de Feedback de Ações */}
      {actionNotice && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border animate-in fade-in ${
          actionNotice.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{actionNotice.message}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-zinc-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Barra de Busca e Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Buscar por nome, telefone ou e-mail..."
            className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl outline-none focus:border-emerald-500 text-zinc-100 placeholder-zinc-500 transition-colors"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
          <button
            onClick={() => setCustomerFilter('ALL')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              customerFilter === 'ALL'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Todos ({customers.length})
          </button>
          <button
            onClick={() => setCustomerFilter('WITH_SALES')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              customerFilter === 'WITH_SALES'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Com Vendas
          </button>
          <button
            onClick={() => setCustomerFilter('TOP_BUYERS')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              customerFilter === 'TOP_BUYERS'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Top Compradores
          </button>
        </div>
      </div>

      {/* Grid de Clientes com agrupamento de Vendas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map(customer => {
          const metrics = getCustomerMetrics(customer.id);
          const hasOrders = metrics.count > 0;

          return (
            <div 
              key={customer.id} 
              onClick={() => setSelectedCustomer(customer)}
              className="group bg-zinc-900 border border-zinc-800/80 hover:border-emerald-500/60 rounded-2xl p-5 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl hover:shadow-emerald-500/5 relative flex flex-col justify-between"
            >
              <div>
                {/* Cabeçalho do Card */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 bg-zinc-800 border border-zinc-700/60 rounded-xl flex items-center justify-center text-emerald-400 font-black text-lg group-hover:scale-105 transition-transform flex-shrink-0">
                      {customer.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-zinc-100 group-hover:text-emerald-400 transition-colors truncate">
                        {customer.name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 pt-0.5">
                        <span className="truncate">{customer.phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Ações Rápidas (não disparam o clique no card) */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button 
                      onClick={(e) => openWhatsApp(customer.phone, customer.name, e)} 
                      className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500 hover:text-zinc-950 transition-colors"
                      title="Conversar no WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setEditingCustomer(customer); 
                        setIsModalOpen(true); 
                      }} 
                      className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
                      title="Editar Dados do Cliente"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => requestDeleteCustomer(customer, e)} 
                      className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Excluir Cliente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* E-mail / Observação se houver */}
                {customer.email && (
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2 truncate">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
              </div>

              {/* Bloco de Vendas Agrupadas no Card */}
              <div className="mt-4 pt-3.5 border-t border-zinc-800/80 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-semibold">
                      {hasOrders ? `${metrics.count} ${metrics.count === 1 ? 'venda' : 'vendas'}` : 'Sem vendas'}
                    </span>
                  </div>

                  {hasOrders ? (
                    <strong className="font-mono text-sm text-emerald-400 font-bold">
                      {formatCurrency(metrics.totalSpent)}
                    </strong>
                  ) : (
                    <span className="text-zinc-500 text-[11px]">Novo contato</span>
                  )}
                </div>

                {/* Status das vendas se houver */}
                {hasOrders && (
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                    {metrics.inProduction > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {metrics.inProduction} em produção
                      </span>
                    )}
                    {metrics.ready > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {metrics.ready} pronto
                      </span>
                    )}
                    {metrics.delivered > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        {metrics.delivered} entregue(s)
                      </span>
                    )}
                  </div>
                )}

                {/* Botão para ver vendas */}
                <button
                  type="button"
                  className="w-full mt-2 py-2 px-3 rounded-xl bg-zinc-800/60 hover:bg-emerald-500/10 hover:border-emerald-500/30 border border-zinc-700/40 text-xs font-bold text-zinc-300 hover:text-emerald-400 flex items-center justify-between transition-all"
                >
                  <span>{hasOrders ? 'Ver todas as vendas' : 'Ver histórico / Criar venda'}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Estado Vazio de Clientes */}
      {filteredCustomers.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 bg-zinc-800 text-zinc-500 rounded-2xl flex items-center justify-center mx-auto">
            <UserIcon className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-zinc-100">Nenhum cliente encontrado</h3>
            <p className="text-sm text-zinc-400 mt-1">
              {searchTerm 
                ? 'Nenhum resultado corresponde à sua pesquisa.' 
                : 'Cadastre seu primeiro cliente para gerenciar contatos e agrupar vendas.'}
            </p>
          </div>
          {!searchTerm && (
            <button
              onClick={() => {
                setEditingCustomer({ name: '', phone: '', email: '', notes: '' });
                setIsModalOpen(true);
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2.5 rounded-xl font-bold text-xs inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Cliente</span>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL / PAINEL: VENDAS AGRUPADAS DO CLIENTE SELECIONADO                     */}
      {/* ========================================================================= */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[94vh]">
            
            {/* Topo do Painel do Cliente */}
            <div className="p-4 sm:p-6 border-b border-zinc-800 bg-zinc-900/95 sticky top-0 z-20 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-xl">
                    {selectedCustomer.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-lg sm:text-xl text-zinc-100">
                        {selectedCustomer.name}
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Cliente Verificado
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-400 pt-1 flex-wrap">
                      <button 
                        onClick={() => openWhatsApp(selectedCustomer.phone, selectedCustomer.name)}
                        className="flex items-center gap-1.5 text-emerald-400 hover:underline font-medium"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{selectedCustomer.phone}</span>
                      </button>
                      {selectedCustomer.email && (
                        <span className="flex items-center gap-1 text-zinc-400">
                          <Mail className="w-3.5 h-3.5 text-zinc-500" />
                          <span>{selectedCustomer.email}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCreateOrderForCustomer(selectedCustomer)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-3.5 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                    title="Criar novo pedido diretamente para este cliente"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Nova Venda</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingCustomer(selectedCustomer);
                      setIsModalOpen(true);
                    }}
                    className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                    title="Editar Cadastro"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => requestDeleteCustomer(selectedCustomer)}
                    className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Excluir Cliente"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Observações do Cliente se houver */}
              {selectedCustomer.notes && (
                <div className="p-3 bg-zinc-800/40 border border-zinc-700/50 rounded-xl text-xs text-zinc-300">
                  <span className="font-bold text-zinc-400 block mb-0.5">Observações:</span>
                  {selectedCustomer.notes}
                </div>
              )}

              {/* Cards de Métricas do Cliente */}
              {(() => {
                const metrics = getCustomerMetrics(selectedCustomer.id);
                const avgTicket = metrics.count > 0 ? metrics.totalSpent / metrics.count : 0;

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                      <span className="text-[10px] font-bold uppercase text-zinc-400 block">Total Comprado (LTV)</span>
                      <strong className="text-base sm:text-lg font-mono font-black text-emerald-400 block pt-0.5">
                        {formatCurrency(metrics.totalSpent)}
                      </strong>
                    </div>

                    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                      <span className="text-[10px] font-bold uppercase text-zinc-400 block">Vendas Realizadas</span>
                      <strong className="text-base sm:text-lg font-mono font-black text-zinc-100 block pt-0.5">
                        {metrics.count} <span className="text-xs font-normal text-zinc-400">pedidos</span>
                      </strong>
                    </div>

                    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                      <span className="text-[10px] font-bold uppercase text-zinc-400 block">Ticket Médio</span>
                      <strong className="text-base sm:text-lg font-mono font-black text-zinc-100 block pt-0.5">
                        {formatCurrency(avgTicket)}
                      </strong>
                    </div>

                    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                      <span className="text-[10px] font-bold uppercase text-zinc-400 block">Status da Produção</span>
                      <div className="text-xs font-bold text-zinc-300 pt-1 flex items-center gap-1.5 flex-wrap">
                        {metrics.inProduction > 0 ? (
                          <span className="text-amber-400 font-mono">{metrics.inProduction} em prod.</span>
                        ) : metrics.ready > 0 ? (
                          <span className="text-cyan-400 font-mono">{metrics.ready} pronto</span>
                        ) : metrics.delivered > 0 ? (
                          <span className="text-emerald-400 font-mono">{metrics.delivered} entregue(s)</span>
                        ) : (
                          <span className="text-zinc-500 font-normal">Sem pedidos</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Filtros das Vendas do Cliente */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setSalesStatusFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      salesStatusFilter === 'ALL'
                        ? 'bg-emerald-500 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Todas ({getCustomerMetrics(selectedCustomer.id).count})
                  </button>
                  <button
                    onClick={() => setSalesStatusFilter(OrderStatus.PRODUCTION)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      salesStatusFilter === OrderStatus.PRODUCTION
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Em Produção ({getCustomerMetrics(selectedCustomer.id).inProduction})
                  </button>
                  <button
                    onClick={() => setSalesStatusFilter(OrderStatus.READY)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      salesStatusFilter === OrderStatus.READY
                        ? 'bg-cyan-500 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Prontos ({getCustomerMetrics(selectedCustomer.id).ready})
                  </button>
                  <button
                    onClick={() => setSalesStatusFilter(OrderStatus.DELIVERED)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      salesStatusFilter === OrderStatus.DELIVERED
                        ? 'bg-emerald-500 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Entregues ({getCustomerMetrics(selectedCustomer.id).delivered})
                  </button>
                </div>

                <div className="relative min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Filtrar itens ou número..."
                    value={salesSearchTerm}
                    onChange={e => setSalesSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Lista de Vendas Agrupadas do Cliente */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {selectedCustomerSales.length === 0 ? (
                <div className="p-12 text-center bg-zinc-950/50 border border-zinc-800/80 rounded-2xl space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-zinc-200 text-sm">
                    Nenhuma venda encontrada para {selectedCustomer.name}
                  </h4>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    {salesSearchTerm || salesStatusFilter !== 'ALL'
                      ? 'Nenhum pedido corresponde aos filtros aplicados.'
                      : 'Este cliente ainda não possui compras registradas no PrintFlow 3D.'}
                  </p>
                  <button
                    onClick={() => handleCreateOrderForCustomer(selectedCustomer)}
                    className="mt-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 shadow-md active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar Primeira Venda</span>
                  </button>
                </div>
              ) : (
                selectedCustomerSales.map(order => {
                  const orderNum = getRealisticOrderNumber(order);
                  const orderDate = new Date(order.createdAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  const itemsCount = (order.items || []).reduce((acc, i) => acc + (i.quantity || 1), 0);

                  return (
                    <div 
                      key={order.id}
                      className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4 hover:border-zinc-700 transition-colors shadow-sm"
                    >
                      {/* Topo da Venda: Número, Data, Status e Valor */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-mono font-black text-sm text-emerald-400 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            {orderNum}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                            {orderDate}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap">
                          {/* Badge de Status */}
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                            order.status === OrderStatus.PRODUCTION
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : order.status === OrderStatus.READY
                              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {order.status === OrderStatus.PRODUCTION && <Clock className="w-3 h-3" />}
                            {order.status === OrderStatus.READY && <CheckCircle2 className="w-3 h-3" />}
                            {order.status === OrderStatus.DELIVERED && <Package className="w-3 h-3" />}
                            {order.status}
                          </span>

                          {/* Forma de Pagamento */}
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                            {order.paymentMethod || 'Pix'}
                          </span>

                          {/* Valor Total da Venda */}
                          <strong className="text-base sm:text-lg font-mono font-black text-white pl-2">
                            {formatCurrency(order.totalValue)}
                          </strong>
                        </div>
                      </div>

                      {/* Lista de Peças e Itens da Venda */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Itens do Pedido ({itemsCount})</span>
                          {order.discount > 0 && (
                            <span className="text-emerald-400 font-mono">
                              Desconto aplicado: -{formatCurrency(order.discount)}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(order.items || []).map((item, idx) => {
                            const part = parts.find(p => p.id === item.partId);
                            const itemName = item.name || part?.name || `Item 3D #${idx + 1}`;

                            return (
                              <div 
                                key={idx} 
                                className="flex items-center gap-3 p-2.5 bg-zinc-900/80 border border-zinc-800/80 rounded-xl"
                              >
                                {/* Foto da peça se houver */}
                                <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center overflow-hidden flex-shrink-0">
                                  {part?.imageUrl ? (
                                    <img src={part.imageUrl} alt={itemName} className="w-full h-full object-cover" />
                                  ) : (
                                    <Package className="w-5 h-5 text-zinc-600" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold text-zinc-200 truncate">{itemName}</div>
                                  <div className="text-[11px] text-zinc-400 font-mono flex items-center justify-between pt-0.5">
                                    <span>{item.quantity}x {formatCurrency(item.unitPrice)}</span>
                                    <strong className="text-zinc-200">{formatCurrency(item.unitPrice * item.quantity)}</strong>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Barra de Ações Rápidas da Venda */}
                      <div className="pt-2 flex items-center justify-between flex-wrap gap-2">
                        <div className="text-xs text-zinc-500 font-mono">
                          ID: <span className="text-zinc-400">{order.id.slice(0, 8)}</span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Botão para Gerar Orçamento Oficial em PDF */}
                          <button
                            onClick={() => setPdfModalOrder(order)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                            title="Gerar Orçamento / Proposta Técnica em PDF"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Orçamento em PDF</span>
                          </button>

                          {/* Botão Compartilhar no WhatsApp */}
                          <button
                            onClick={() => shareOrderOnWhatsApp(order, selectedCustomer)}
                            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
                            title="Enviar resumo do pedido no WhatsApp do cliente"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                            <span>WhatsApp</span>
                          </button>

                          {/* Ver na aba de pedidos */}
                          <button
                            onClick={() => navigate('/orders')}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
                            title="Ir para a tela de Pedidos"
                          >
                            Ver em Pedidos
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between text-xs text-zinc-500">
              <span>{selectedCustomer.name} • {selectedCustomerSales.length} venda(s) exibida(s)</span>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação / Edição de Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-zinc-100">
                {editingCustomer?.id ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Nome Completo</label>
                <input 
                  required 
                  placeholder="Ex: João da Silva / Metalúrgica Alfa" 
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-emerald-500 text-zinc-100"
                  value={editingCustomer?.name || ''} 
                  onChange={e => setEditingCustomer(prev => ({ ...prev!, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Telefone / WhatsApp</label>
                  <input 
                    required 
                    placeholder="(00) 00000-0000" 
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-emerald-500 text-zinc-100"
                    value={editingCustomer?.phone || ''} 
                    onChange={e => setEditingCustomer(prev => ({ ...prev!, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">E-mail (opcional)</label>
                  <input 
                    placeholder="cliente@exemplo.com" 
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-emerald-500 text-zinc-100"
                    value={editingCustomer?.email || ''} 
                    onChange={e => setEditingCustomer(prev => ({ ...prev!, email: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Notas / Observações</label>
                <textarea 
                  placeholder="Informações adicionais, preferências ou dados fiscais..." 
                  rows={3} 
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-emerald-500 text-zinc-100 resize-none"
                  value={editingCustomer?.notes || ''} 
                  onChange={e => setEditingCustomer(prev => ({ ...prev!, notes: e.target.value }))}
                />
              </div>

              <button 
                type="submit" 
                disabled={isSaving} 
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black rounded-xl flex items-center justify-center gap-2 mt-2 transition-all shadow-md active:scale-95"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'SALVAR CLIENTE'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Orçamento em PDF Oficial quando acionado de uma venda */}
      {pdfModalOrder && (
        <QuotePdfModal
          order={pdfModalOrder}
          customer={customers.find(c => c.id === pdfModalOrder.customerId) || selectedCustomer || undefined}
          parts={parts}
          filaments={filaments}
          settings={settings}
          onClose={() => setPdfModalOrder(null)}
        />
      )}

      {/* Modal de Confirmação de Exclusão de Cliente */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        title="Excluir Cliente"
        itemName={deleteTarget?.name}
        description={
          (deleteTarget?.ordersCount || 0) > 0
            ? `Atenção: Este cliente possui ${deleteTarget?.ordersCount} venda(s) registrada(s) no sistema.\n\nAo excluir este cliente permanentemente, os registros históricos desse cliente serão desvinculados no banco de dados. Deseja prosseguir com a exclusão?`
            : 'Deseja realmente excluir este cliente permanentemente? Esta ação não pode ser desfeita.'
        }
        confirmText="Sim, Excluir Cliente"
        isLoading={isDeleting}
        onConfirm={confirmDeleteCustomer}
        onClose={() => setDeleteTarget(null)}
      />

    </div>
  );
};

export default Customers;
