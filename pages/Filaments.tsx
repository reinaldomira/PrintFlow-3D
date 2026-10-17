
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Filament } from '../types';
import { supabase } from '../services/supabase';
import { MATERIALS, formatCurrency } from '../constants';
import { Plus, Search, Trash2, Edit2, X, Droplet, Loader2 } from 'lucide-react';

const Filaments: React.FC = () => {
  const { filaments, refreshData, settings, user } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingFilament, setEditingFilament] = useState<Partial<Filament> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const filteredFilaments = filaments.filter(f => 
    f.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.colorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.material.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFilament?.brand || !editingFilament?.colorName || !user) return;
    setIsSaving(true);

    try {
      const payload = {
        ...editingFilament,
        user_id: user.id,
        remainingWeight: editingFilament.id ? editingFilament.remainingWeight : editingFilament.weight
      };

      let result;
      if (editingFilament.id) {
        result = await supabase.from('filaments').update(payload).eq('id', editingFilament.id);
      } else {
        result = await supabase.from('filaments').insert([{ ...payload, createdAt: new Date().toISOString() }]);
      }
      
      if (result.error) throw result.error;
      
      await refreshData();
      setIsModalOpen(false);
      setEditingFilament(null);
    } catch (err: any) {
      alert('Erro Supabase: ' + err.message + '\n\nCertifique-se de que a tabela "filaments" existe no seu banco de dados.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFilament = async (id: string) => {
    if (confirm('Deseja excluir este filamento permanentemente?')) {
      const { error } = await supabase.from('filaments').delete().eq('id', id);
      if (error) alert("Erro ao deletar: " + error.message);
      refreshData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Filamentos Cloud</h2>
          <p className="text-zinc-500">Estoque sincronizado ({filaments.length})</p>
        </div>
        <button 
          onClick={() => {
            setEditingFilament({ 
              brand: settings.filamentBrands[0] || '', 
              colorName: '', 
              colorHex: '#10b981', 
              material: 'PLA', 
              weight: 1000, 
              pricePaid: settings.defaultFilamentCost 
            });
            setIsModalOpen(true);
          }}
          className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Novo Filamento</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input 
          type="text" 
          placeholder="Buscar no estoque cloud..."
          className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl outline-none"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredFilaments.map(filament => {
          const percentage = (filament.remainingWeight / filament.weight) * 100;
          return (
            <div key={filament.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-emerald-500/50 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl border border-white/10" style={{ backgroundColor: filament.colorHex }} />
                <div className="flex gap-2">
                  <button onClick={() => { setEditingFilament(filament); setIsModalOpen(true); }} className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-zinc-100"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => deleteFilament(filament.id)} className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <h3 className="font-bold text-lg">{filament.brand}</h3>
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-4">
                <Droplet className="w-3 h-3" />
                <span>{filament.colorName} ({filament.material})</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase text-zinc-500">
                  <span>Estoque</span>
                  <span>{Math.round(filament.remainingWeight)}g / {filament.weight}g</span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div className={`h-full ${percentage < 20 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-xl font-bold">{editingFilament?.id ? 'Editar Filamento' : 'Novo Filamento'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500"><X /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase">Marca</label>
                  <select required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2"
                    value={editingFilament?.brand || ''} onChange={e => setEditingFilament(prev => ({ ...prev!, brand: e.target.value }))}>
                    {settings.filamentBrands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase">Material</label>
                  <select className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2"
                    value={editingFilament?.material || ''} onChange={e => setEditingFilament(prev => ({ ...prev!, material: e.target.value }))}>
                    {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase">Cor</label>
                  <input required placeholder="Ex: Vermelho" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2"
                    value={editingFilament?.colorName || ''} onChange={e => setEditingFilament(prev => ({ ...prev!, colorName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase">Cor Visual (Hex)</label>
                  <input type="color" className="w-full h-10 bg-zinc-800 border border-zinc-700 rounded-xl px-1 py-1"
                    value={editingFilament?.colorHex || '#10b981'} onChange={e => setEditingFilament(prev => ({ ...prev!, colorHex: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase">Peso Total (g)</label>
                  <input required type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2"
                    value={editingFilament?.weight || 0} onChange={e => setEditingFilament(prev => ({ ...prev!, weight: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase">Preço Pago (R$)</label>
                  <input required type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2"
                    value={editingFilament?.pricePaid || 0} onChange={e => setEditingFilament(prev => ({ ...prev!, pricePaid: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <button type="submit" disabled={isSaving} className="w-full py-3 bg-emerald-500 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2 mt-4">
                {isSaving ? <Loader2 className="animate-spin" /> : 'SALVAR'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Filaments;
