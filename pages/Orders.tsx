
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Order, OrderStatus, PaymentMethod, OrderItem } from '../types';
import { supabase } from '../services/supabase';
import { formatCurrency, calculatePartCosts } from '../constants';
import { Plus, Search, Trash2, ShoppingBag, X, User as UserIcon, Minus, ChevronDown, ChevronUp, Package, Tag, Loader2 } from 'lucide-react';

const Orders: React.FC = () => {
  const { orders, refreshData, customers, parts, filaments, printers, settings, user } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'All'>('All');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [newOrder, setNewOrder] = useState<{
    customerId: string;
    items: OrderItem[];
    discount: number;
    paymentMethod: PaymentMethod;
  }>({
    customerId: '',
    items: [],
    discount: 0,
    paymentMethod: PaymentMethod.PIX
  });

  const toggleExpand = (id: string) => {
    setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status === OrderStatus.DELIVERED) return false;
      const customer = customers.find(c => c.id === o.customerId);
      const matchesSearch = customer?.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'All' || o.status === filterStatus;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, customers, searchTerm, filterStatus]);

  const orderTotal = useMemo(() => {
    const subtotal = newOrder.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    return Math.max(0, subtotal - newOrder.discount);
  }, [newOrder.items, newOrder.discount]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrder.customerId || newOrder.items.length === 0 || !user) return;
    setIsSaving(true);

    try {
      // 1. Atualizar estoque de filamento no Supabase
      const filamentUpdates = [];
      newOrder.items.forEach(orderItem => {
        const part = parts.find(p => p.id === orderItem.partId);
        if (part && part.recipe) {
          part.recipe.forEach(recipeItem => {
            const filament = filaments.find(f => f.id === recipeItem.filamentId);
            if (filament) {
              const usedGrams = recipeItem.grams * orderItem.quantity;
              filamentUpdates.push(
                supabase.from('filaments')
                  .update({ remainingWeight: filament.remainingWeight - usedGrams })
                  .eq('id', filament.id)
              );
            }
          });
        }
      });

      await Promise.all(filamentUpdates);

      // 2. Criar pedido no Supabase
      const payload = {
        ...newOrder,
        totalValue: orderTotal,
        status: OrderStatus.PRODUCTION,
        payments: [],
        user_id: user.id,
        createdAt: new Date().toISOString()
      };

      await supabase.from('orders').insert([payload]);

      await refreshData();
      setIsModalOpen(false);
      setNewOrder({ customerId: '', items: [], discount: 0, paymentMethod: PaymentMethod.PIX });
    } catch (err) {
      alert('Erro ao criar pedido');
    } finally {
      setIsSaving(false);
    }
  };

  const addItem = (partId: string) => {
    const part = parts.find(p => p.id === partId);
    if (!part) return;
    const costs = calculatePartCosts(part, filaments, printers, settings);
    const existing = newOrder.items.find(i => i.partId === partId);
    if (existing) {
      setNewOrder({
        ...newOrder,
        items: newOrder.items.map(i => i.partId === partId ? { ...i, quantity: i.quantity + 1 } : i)
      });
    } else {
      setNewOrder({
        ...newOrder,
        items: [...newOrder.items, { partId, quantity: 1, unitPrice: costs.suggestedPrice }]
      });
    }
  };

  const removeItem = (partId: string) => {
    const existing = newOrder.items.find(i => i.partId === partId);
    if (!existing) return;
    if (existing.quantity > 1) {
      setNewOrder({
        ...newOrder,
        items: newOrder.items.map(i => i.partId === partId ? { ...i, quantity: i.quantity - 1 } : i)
      });
    } else {
      setNewOrder({
        ...newOrder,
        items: newOrder.items.filter(i => i.partId !== partId)
      });
    }
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

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PRODUCTION: return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case OrderStatus.READY: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case OrderStatus.DELIVERED: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Produção Cloud</h2>
          <p className="text-zinc-500">Acompanhamento em tempo real</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-emerald-500/20">
          <Plus className="w-5 h-5" /> Nova Venda
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input type="text" placeholder="Buscar cliente..." className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl outline-none"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/50 rounded-3xl border border-dashed border-zinc-800 text-zinc-500">
            Nenhum pedido em produção.
          </div>
        ) : (
          filteredOrders.map(order => {
            const customer = customers.find(c => c.id === order.customerId);
            const isExpanded = expandedOrders[order.id];
            return (
              <div key={order.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer" onClick={() => toggleExpand(order.id)}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500"><ShoppingBag /></div>
                    <div>
                      <h3 className="font-bold text-lg">{customer?.name || 'Cliente Removido'}</h3>
                      <p className="text-xs text-zinc-500">{new Date(order.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-black text-emerald-500">{formatCurrency(order.totalValue)}</span>
                    <select className={`px-3 py-2 rounded-xl border text-sm font-bold ${getStatusColor(order.status)}`}
                      value={order.status} onChange={e => updateStatus(order.id, e.target.value as OrderStatus)}
                    >
                      {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={() => deleteOrder(order.id)} className="p-2 text-zinc-600 hover:text-red-500"><Trash2 className="w-5 h-5" /></button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-10">
              <h3 className="text-xl font-bold uppercase">Novo Pedido Cloud</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500"><X /></button>
            </div>
            
            <div className="p-6 space-y-8">
              <div className="space-y-4">
                <label className="text-xs font-black uppercase text-zinc-500 tracking-widest">Selecionar Cliente</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {customers.map(c => (
                    <button key={c.id} onClick={() => setNewOrder({ ...newOrder, customerId: c.id })}
                      className={`p-3 rounded-xl border text-sm truncate ${newOrder.customerId === c.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-800/50'}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black uppercase text-zinc-500 tracking-widest">Adicionar Peças do Catálogo</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {parts.map(part => (
                    <button key={part.id} onClick={() => addItem(part.id)} className="relative aspect-square rounded-xl bg-zinc-800 border border-zinc-800 overflow-hidden hover:border-emerald-500 transition-all">
                      <img src={part.imageUrl} className="w-full h-full object-cover" />
                      {newOrder.items.find(i => i.partId === part.id) && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-emerald-500 rounded-full text-[10px] font-black flex items-center justify-center text-zinc-950">
                          {newOrder.items.find(i => i.partId === part.id)?.quantity}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleCreateOrder} disabled={isSaving || !newOrder.customerId || newOrder.items.length === 0}
                className="w-full py-4 bg-emerald-500 text-zinc-950 font-black rounded-2xl text-lg shadow-xl shadow-emerald-500/20 disabled:opacity-50">
                {isSaving ? <Loader2 className="animate-spin mx-auto" /> : `FECHAR PEDIDO - ${formatCurrency(orderTotal)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
