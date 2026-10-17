
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Customer } from '../types';
import { supabase } from '../services/supabase';
import { Plus, Search, Trash2, Edit2, MessageCircle, X, User as UserIcon, Mail, Phone, Loader2 } from 'lucide-react';

const Customers: React.FC = () => {
  const { customers, refreshData, user } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

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

  const deleteCustomer = async (id: string) => {
    if (confirm('Excluir cliente permanentemente?')) {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) alert("Erro ao deletar: " + error.message);
      refreshData();
    }
  };

  const openWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/55${cleanPhone}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Clientes Cloud</h2>
          <p className="text-zinc-500">Contatos cadastrados ({customers.length})</p>
        </div>
        <button 
          onClick={() => {
            setEditingCustomer({ name: '', phone: '', email: '', notes: '' });
            setIsModalOpen(true);
          }}
          className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Novo Cliente</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input 
          type="text" 
          placeholder="Buscar no banco de dados..."
          className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl outline-none"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map(customer => (
          <div key={customer.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-emerald-500/50 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-emerald-500">
                <UserIcon className="w-6 h-6" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => openWhatsApp(customer.phone)} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-zinc-950"><MessageCircle className="w-4 h-4" /></button>
                <button onClick={() => { setEditingCustomer(customer); setIsModalOpen(true); }} className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-zinc-100"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => deleteCustomer(customer.id)} className="p-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <h3 className="font-bold text-lg mb-3">{customer.name}</h3>
            <div className="space-y-2 text-sm text-zinc-400">
              <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /><span>{customer.phone}</span></div>
              {customer.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /><span className="truncate">{customer.email}</span></div>}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-xl font-bold">{editingCustomer?.id ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500"><X /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <input required placeholder="Nome Completo" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-emerald-500"
                value={editingCustomer?.name || ''} onChange={e => setEditingCustomer(prev => ({ ...prev!, name: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <input required placeholder="Telefone" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editingCustomer?.phone || ''} onChange={e => setEditingCustomer(prev => ({ ...prev!, phone: e.target.value }))}
                />
                <input placeholder="E-mail" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={editingCustomer?.email || ''} onChange={e => setEditingCustomer(prev => ({ ...prev!, email: e.target.value }))}
                />
              </div>
              <textarea placeholder="Notas/Observações" rows={3} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-emerald-500"
                value={editingCustomer?.notes || ''} onChange={e => setEditingCustomer(prev => ({ ...prev!, notes: e.target.value }))}
              />
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

export default Customers;
