
import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../constants';
import { Download, PieChart, TrendingUp, Users, Package } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, 
  PieChart as RePieChart, Pie
} from 'recharts';

const Reports: React.FC = () => {
  const { orders, parts, customers } = useApp();

  const totalRevenue = orders.reduce((sum, o) => sum + o.totalValue, 0);
  
  // Stats per part
  const partStats = useMemo(() => {
    const stats: Record<string, { count: number, revenue: number, name: string }> = {};
    orders.forEach(o => {
      o.items.forEach(item => {
        const part = parts.find(p => p.id === item.partId);
        if (!part) return;
        if (!stats[part.id]) stats[part.id] = { count: 0, revenue: 0, name: part.name };
        stats[part.id].count += item.quantity;
        stats[part.id].revenue += item.unitPrice * item.quantity;
      });
    });
    return Object.values(stats).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [orders, parts]);

  // Export CSV function
  const exportCSV = () => {
    const headers = ['Data', 'Cliente', 'Valor', 'Status', 'Metodo Pagamento'];
    const rows = orders.map(o => [
      new Date(o.createdAt).toLocaleDateString(),
      customers.find(c => c.id === o.customerId)?.name || 'N/A',
      o.totalValue.toString(),
      o.status,
      o.paymentMethod
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers, ...rows].map(e => e.join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `printflow_vendas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Relatórios</h2>
          <p className="text-zinc-500">Analise seu crescimento e exporte dados</p>
        </div>
        <button 
          onClick={exportCSV}
          className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-100 px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all"
        >
          <Download className="w-5 h-5" />
          <span className="hidden sm:inline">Exportar CSV</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ranking de Peças */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <Package className="w-5 h-5 text-emerald-500" />
            <h3 className="font-bold">Top 5 Peças Mais Vendidas</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={partStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fill: '#71717a', fontSize: 10}} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                  {partStats.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Faturamento por Metodo */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <PieChart className="w-5 h-5 text-emerald-500" />
            <h3 className="font-bold">Métodos de Pagamento</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={[
                    { name: 'Pix', value: orders.filter(o => o.paymentMethod === 'Pix').length },
                    { name: 'Dinheiro', value: orders.filter(o => o.paymentMethod === 'Dinheiro').length },
                    { name: 'Cartão', value: orders.filter(o => o.paymentMethod === 'Cartão').length },
                  ]}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#3b82f6" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-emerald-500 rounded-3xl p-8 text-zinc-950 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6 text-center md:text-left">
          <div className="w-20 h-20 bg-zinc-950/10 rounded-full flex items-center justify-center">
            <TrendingUp className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-3xl font-black uppercase tracking-tighter">Faturamento Vitalício</h3>
            <p className="text-zinc-950/60 font-bold">Baseado em todos os pedidos concluídos no sistema</p>
          </div>
        </div>
        <div className="text-5xl font-black">{formatCurrency(totalRevenue)}</div>
      </div>
    </div>
  );
};

export default Reports;
