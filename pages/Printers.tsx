
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Printer } from '../types';
import { supabase } from '../services/supabase';
import { Plus, Search, Trash2, Edit2, X, Monitor, Zap, CheckCircle, AlertTriangle, Power, Loader2 } from 'lucide-react';

const Printers: React.FC = () => {
  const { printers, refreshData, user } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPrinter, setEditingPrinter] = useState<Partial<Printer> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const filteredPrinters = printers.filter(p => 
    p.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.model.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrinter?.brand || !editingPrinter?.model || !user) return;
    setIsSaving(true);

    try {
      const payload = {
        ...editingPrinter,
        user_id: user.id,
      };

      let result;
      if (editingPrinter.id) {
        result = await supabase.from('printers').update(payload).eq('id', editingPrinter.id);
      } else {
        result = await supabase.from('printers').insert([{ ...payload, createdAt: new Date().toISOString() }]);
      }
      
      if (result.error) throw result.error;

      await refreshData();
      setIsModalOpen(false);
      setEditingPrinter(null);
    } catch (err: any) {
      alert('Erro Supabase: ' + err.message + '\n\nCertifique-se de que a tabela "printers" existe.');
    } finally {
      setIsSaving(false);
    }
  };

  const deletePrinter = async (id: string) => {
    if (confirm('Deseja excluir esta impressora permanentemente?')) {
      const { error } = await supabase.from('printers').delete().eq('id', id);
      if (error) alert("Erro ao deletar: " + error.message);
      refreshData();
    }
  };

  const getStatusIcon = (status: Printer['status']) => {
    switch (status) {
      case 'Ativa': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'Manutenção': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'Inativa': return <Power className="w-4 h-4 text-zinc-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Impressoras Cloud</h2>
          <p className="text-zinc-500">Máquinas cadastradas ({printers.length})</p>
        </div>
        <button 
          onClick={() => {
            setEditingPrinter({ brand: '', model: '', power: 350, status: 'Ativa' });
            setIsModalOpen(true);
          }}
          className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 px-4 py-2 rounded-xl flex items-center gap-2 font-bold"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Nova Impressora</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input 
          type="text" placeholder="Buscar máquinas no banco..."
          className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl outline-none"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPrinters.map(printer => (
          <div key={printer.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-emerald-500 transition-colors group">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-emerald-500"><Monitor /></div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingPrinter(printer); setIsModalOpen(true); }} className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-zinc-100"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => deletePrinter(printer.id)} className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <h3 className="font-bold text-lg">{printer.brand}</h3>
            <p className="text-zinc-400 text-sm">{printer.model}</p>
            <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 px-2 py-1 bg-zinc-800/50 rounded-lg">
                {getStatusIcon(printer.status)}
                <span className="text-xs font-bold text-zinc-300">{printer.status}</span>
              </div>
              <div className="flex items-center gap-1 text-zinc-500">
                <Zap className="w-3 h-3 text-amber-500" />
                <span className="text-sm font-bold">{printer.power}W</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-xl font-bold">{editingPrinter?.id ? 'Editar Máquina' : 'Nova Máquina'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500"><X /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input required placeholder="Marca (Ex: Ender)" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editingPrinter?.brand || ''} onChange={e => setEditingPrinter(prev => ({ ...prev!, brand: e.target.value }))}
                />
                <input required placeholder="Modelo (Ex: S1 Pro)" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editingPrinter?.model || ''} onChange={e => setEditingPrinter(prev => ({ ...prev!, model: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input required type="number" placeholder="Potência (W)" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editingPrinter?.power || 0} onChange={e => setEditingPrinter(prev => ({ ...prev!, power: Number(e.target.value) }))}
                />
                <select className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editingPrinter?.status || 'Ativa'} onChange={e => setEditingPrinter(prev => ({ ...prev!, status: e.target.value as any }))}>
                  <option value="Ativa">Ativa</option>
                  <option value="Manutenção">Manutenção</option>
                  <option value="Inativa">Inativa</option>
                </select>
              </div>
              <button type="submit" disabled={isSaving} className="w-full py-3 bg-emerald-500 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2 mt-2">
                {isSaving ? <Loader2 className="animate-spin" /> : 'SALVAR'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Printers;
