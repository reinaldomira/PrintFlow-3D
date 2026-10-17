
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, calculatePartCosts } from '../constants';
import { useNavigate } from 'react-router-dom';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { 
  TrendingUp, ShoppingBag, Package, Clock, DollarSign, Calendar, ChevronLeft, ChevronRight, Target, AlertTriangle, Database, ArrowRight
} from 'lucide-react';
import { OrderStatus } from '../types';

const Dashboard: React.FC = () => {
  const { orders, parts, filaments, printers, settings, dbError } = useApp();
  const [viewDate, setViewDate] = useState(new Date());
  const navigate = useNavigate();

  const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const filteredOrders = useMemo(() => {
    const selectedMonth = viewDate.getMonth();
    const selectedYear = viewDate.getFullYear();
    return orders.filter(o => {
      const orderDate = new Date(o.createdAt);
      return orderDate.getMonth() === selectedMonth && orderDate.getFullYear() === selectedYear;
    });
  }, [orders, viewDate]);

  const stats = useMemo(() => {
    let revenue = 0;
    let totalCost = 0;
    let pieces = 0;
    filteredOrders.forEach(order => {
      revenue += order.totalValue;
      order.items.forEach(item => {
        pieces += item.quantity;
        const part = parts.find(p => p.id === item.partId);
        if (part) {
          const partCosts = calculatePartCosts(part, filaments, printers, settings);
          totalCost += partCosts.totalCost * item.quantity;
        }
      });
    });
    return {
      revenue,
      profit: revenue - totalCost,
      pieces
    };
  }, [filteredOrders, parts, filaments, printers, settings]);

  const chartData = useMemo(() => {
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const dataMap: Record<number, number> = {};
    for (let i = 1; i <= daysInMonth; i++) dataMap[i] = 0;
    filteredOrders.forEach(o => {
      const day = new Date(o.createdAt).getDate();
      dataMap[day] = (dataMap[day] || 0) + o.totalValue;
    });
    return Object.entries(dataMap).map(([day, sales]) => ({ name: day, sales }));
  }, [filteredOrders, viewDate]);

  if (dbError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mb-6 border border-amber-500/20">
          <Database className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-black mb-2">Banco de Dados não pronto</h2>
        <p className="text-zinc-500 max-w-md mb-8">
          Detectamos que as tabelas ou colunas necessárias ainda não existem no seu Supabase:<br/>
          <span className="text-amber-500 font-bold mt-2 block">{dbError}</span>
        </p>
        <button 
          onClick={() => navigate('/settings')}
          className="bg-emerald-500 text-zinc-950 font-black px-8 py-4 rounded-2xl flex items-center gap-2 shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
        >
          VER SQL DE CONFIGURAÇÃO <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-zinc-500">Resumo Cloud</p>
        </div>

        <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-2xl">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400"><ChevronLeft className="w-5 h-5" /></button>
          <div className="px-4 text-center">
            <p className="font-bold text-sm capitalize">{monthLabel}</p>
          </div>
          <button onClick={handleNextMonth} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400"><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex items-center justify-between">
          <div><p className="text-zinc-500 text-[10px] uppercase font-black mb-1">Faturamento</p><p className="text-2xl font-black">{formatCurrency(stats.revenue)}</p></div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-500"><DollarSign /></div>
        </div>
        <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex items-center justify-between">
          <div><p className="text-zinc-500 text-[10px] uppercase font-black mb-1">Lucro Estimado</p><p className="text-2xl font-black">{formatCurrency(stats.profit)}</p></div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-500"><TrendingUp /></div>
        </div>
        <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex items-center justify-between">
          <div><p className="text-zinc-500 text-[10px] uppercase font-black mb-1">Peças Vendidas</p><p className="text-2xl font-black">{stats.pieces}</p></div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-purple-500/10 text-purple-500"><Package /></div>
        </div>
      </div>

      <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-xl h-80">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><Calendar className="w-5 h-5 text-emerald-500" /> Vendas por Dia</h3>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 10}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 10}} />
              <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '16px' }} />
              <Area type="monotone" dataKey="sales" stroke="#10b981" fill="url(#colorSales)" strokeWidth={4} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
