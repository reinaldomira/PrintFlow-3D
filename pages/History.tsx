
import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { OrderStatus } from '../types';
import { supabase } from '../services/supabase';
import { formatCurrency } from '../constants';
import { Archive, Search, Trash2, Calendar, ShoppingBag } from 'lucide-react';

const History: React.FC = () => {
  const { orders, refreshData, customers, parts } = useApp();
  const [searchTerm, setSearchTerm] = React.useState('');

  const completedOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status !== OrderStatus.DELIVERED) return false;
      const customer = customers.find(c => c.id === o.customerId);
      return customer?.name.toLowerCase().includes(searchTerm.toLowerCase());
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, customers, searchTerm]);

  const deleteOrder = async (id: string) => {
    if (confirm('Deseja excluir este registro histórico permanentemente do banco de dados?')) {
      try {
        const { error } = await supabase.from('orders').delete().eq('id', id);
        if (error) throw error;
        await refreshData();
      } catch (err) {
        alert('Erro ao excluir do banco de dados');
      }
    }
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Histórico Cloud</h2>
          <p className="text-zinc-500">Vendas concluídas e sincronizadas</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Filtrar por cliente..."
            className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {completedOrders.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/30 rounded-[2.5rem] border border-dashed border-zinc-800">
            <Archive className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest">Sem registros históricos</p>
          </div>
        ) : (
          completedOrders.map(order => {
            const customer = customers.find(c => c.id === order.customerId);
            return (
              <div key={order.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded-3xl overflow-hidden hover:bg-zinc-900 transition-all group">
                <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                      <Archive className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="font-black text-zinc-100 text-lg">{customer?.name || 'Cliente Removido'}</h3>
                      <div className="flex items-center gap-3 mt-1 text-zinc-500">
                        <div className="flex items-center gap-1.5 bg-zinc-800 px-2 py-0.5 rounded text-[10px] font-bold">
                          <Calendar className="w-3 h-3" />
                          {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                        </div>
                        <div className="flex items-center gap-1.5 bg-zinc-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                          <ShoppingBag className="w-3 h-3" />
                          #{order.id.slice(0, 4)}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end gap-8 border-t sm:border-t-0 border-zinc-800 pt-4 sm:pt-0">
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-500 uppercase font-black tracking-tighter mb-1">Faturamento</p>
                      <p className="text-2xl font-black text-emerald-500">{formatCurrency(order.totalValue)}</p>
                    </div>
                    <button 
                      onClick={() => deleteOrder(order.id)}
                      className="p-3 bg-zinc-800 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all active:scale-90"
                      title="Excluir do banco"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="px-6 pb-6 pt-2">
                   <div className="flex flex-wrap gap-2">
                     {order.items.map((item, idx) => {
                       const part = parts.find(p => p.id === item.partId);
                       return (
                         <div key={idx} className="flex items-center gap-2 bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-zinc-700/50">
                           {part?.imageUrl && <img src={part.imageUrl} className="w-4 h-4 rounded-md object-cover" />}
                           <span className="text-[10px] text-zinc-400 font-bold">
                             {item.quantity}x {part?.name || 'Item Removido'}
                           </span>
                         </div>
                       );
                     })}
                   </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default History;
