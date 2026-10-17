
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { LogOut, Plus, Trash2, Database, Copy, AlertCircle, Check, User as UserIcon, Tag, Layers, Zap, Image as ImageIcon } from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';

const Settings: React.FC = () => {
  const { settings, setSettings, logout, user, dbError } = useApp();
  const [newBrand, setNewBrand] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);

  const sqlScript = `
-- SCRIPT DE REPARAÇÃO PRINTFLOW v2.6 (FOTOS + RECEITAS)
-- Rodar no SQL EDITOR do Supabase

-- 1. TABELA FILAMENTOS
CREATE TABLE IF NOT EXISTS public.filaments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    brand text,
    material text,
    "colorName" text,
    "colorHex" text DEFAULT '#10b981',
    weight numeric DEFAULT 1000,
    "remainingWeight" numeric DEFAULT 1000,
    "pricePaid" numeric DEFAULT 120,
    "createdAt" timestamptz DEFAULT now()
);

-- 2. TABELA IMPRESSORAS
CREATE TABLE IF NOT EXISTS public.printers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    brand text,
    model text,
    power numeric DEFAULT 350,
    status text DEFAULT 'Ativa',
    "createdAt" timestamptz DEFAULT now()
);

-- 3. TABELA PEÇAS
CREATE TABLE IF NOT EXISTS public.parts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    category text,
    material text DEFAULT 'PLA',
    weight numeric DEFAULT 0,
    "printTime" numeric DEFAULT 0,
    "postProcessingTime" numeric DEFAULT 0,
    "filamentCost" numeric,
    "energyCost" numeric,
    "wastePercent" numeric DEFAULT 5,
    "profitMargin" numeric DEFAULT 100,
    recipe jsonb DEFAULT '[]'::jsonb,
    "imageUrl" text,
    "createdAt" timestamptz DEFAULT now(),
    "updatedAt" timestamptz DEFAULT now()
);

-- GARANTIA DE COLUNAS
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 0;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS "printTime" numeric DEFAULT 0;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS "postProcessingTime" numeric DEFAULT 0;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS recipe jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS "imageUrl" text;

-- 4. TABELA PEDIDOS
CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    "customerId" uuid,
    items jsonb DEFAULT '[]'::jsonb,
    "totalValue" numeric NOT NULL DEFAULT 0,
    status text DEFAULT 'Em produção',
    discount numeric DEFAULT 0,
    payments jsonb DEFAULT '[]'::jsonb,
    "paymentMethod" text,
    "createdAt" timestamptz DEFAULT now()
);

-- 5. TABELA CONFIGURAÇÕES
CREATE TABLE IF NOT EXISTS public.settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    "defaultEnergyCost" numeric DEFAULT 0.85,
    "defaultFilamentCost" numeric DEFAULT 120,
    "defaultProfitMargin" numeric DEFAULT 100,
    "hourlyLaborRate" numeric DEFAULT 25,
    "hourlyMaintenanceCost" numeric DEFAULT 1.5,
    "filamentBrands" text[] DEFAULT ARRAY['3D Prime', 'Creality'],
    categories text[] DEFAULT ARRAY['Chaveiro', 'Organizador', 'Decoração']
);
`.trim();

  const handleUpdate = (key: keyof typeof settings, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  const addItem = (key: 'filamentBrands' | 'categories', value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    const current = settings[key] || [];
    if (current.includes(value)) return;
    handleUpdate(key, [...current, value]);
    setter('');
  };

  const removeItem = (key: 'filamentBrands' | 'categories', index: number) => {
    const current = [...(settings[key] || [])];
    current.splice(index, 1);
    handleUpdate(key, current);
  };

  const copySql = () => {
    navigator.clipboard.writeText(sqlScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-24">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Configurações</h2>
        <p className="text-zinc-500">Sincronização Cloud v2.6</p>
      </div>

      {/* SQL Repair Card */}
      <div className={`rounded-3xl p-6 border transition-all ${dbError ? 'bg-amber-500/10 border-amber-500/30 shadow-xl shadow-amber-500/10' : 'bg-zinc-900 border-zinc-800'}`}>
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${dbError ? 'bg-amber-500 text-zinc-950' : 'bg-emerald-500/10 text-emerald-500'}`}>
            <Database className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-black uppercase text-sm leading-none">Reparar Banco Cloud</h3>
            <p className="text-xs font-bold opacity-70 mt-1">Sincronize colunas para o APK</p>
          </div>
        </div>
        <button 
          onClick={copySql}
          className="w-full bg-zinc-950 text-emerald-500 py-5 rounded-2xl font-black flex items-center justify-center gap-3 active:scale-95 transition-all border border-emerald-500/20"
        >
          {copiedSql ? <><Check className="w-6 h-6" /> COPIADO!</> : <><Copy className="w-6 h-6" /> COPIAR SCRIPT SQL</>}
        </button>
      </div>

      {/* Alerta de Storage */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-3xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center text-zinc-950">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black uppercase text-sm leading-none">Fotos no APK / Web</h3>
            <p className="text-xs font-bold opacity-70 mt-1">Crie o bucket "PARTS-IMAGES" como PUBLIC no Supabase Storage.</p>
          </div>
        </div>
      </div>

      {/* PWA Mobile Installation Card */}
      <PWAInstallButton variant="settings" />


      {/* User Info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-emerald-500">
            <UserIcon className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg truncate">{user?.email || 'Usuário'}</h3>
            <p className="text-sm text-zinc-500 italic">Cloud Ativo</p>
          </div>
          <button onClick={logout} className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Default Costs */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-emerald-500" />
          <h3 className="font-black uppercase text-xs tracking-widest text-zinc-400">Custos Padrão</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Energia (R$/kWh)</label>
            <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.defaultEnergyCost} onChange={e => handleUpdate('defaultEnergyCost', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Mão de Obra (R$/h)</label>
            <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.hourlyLaborRate} onChange={e => handleUpdate('hourlyLaborRate', Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Filament Brands */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-emerald-500" />
          <h3 className="font-black uppercase text-xs tracking-widest text-zinc-400">Marcas de Filamento</h3>
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Nova marca..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
            value={newBrand} onChange={e => setNewBrand(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem('filamentBrands', newBrand, setNewBrand)}
          />
          <button onClick={() => addItem('filamentBrands', newBrand, setNewBrand)} className="p-3 bg-emerald-500 text-zinc-950 rounded-xl transition-transform active:scale-90"><Plus /></button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {(settings.filamentBrands || []).map((brand, idx) => (
            <div key={idx} className="bg-zinc-800 pl-4 pr-2 py-2 rounded-xl flex items-center gap-3 border border-zinc-700 group">
              <span className="text-xs font-bold text-zinc-300">{brand}</span>
              <button onClick={() => removeItem('filamentBrands', idx)} className="p-1 text-zinc-600 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Tag className="w-4 h-4 text-emerald-500" />
          <h3 className="font-black uppercase text-xs tracking-widest text-zinc-400">Categorias de Peças</h3>
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Nova categoria..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
            value={newCategory} onChange={e => setNewCategory(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem('categories', newCategory, setNewCategory)}
          />
          <button onClick={() => addItem('categories', newCategory, setNewCategory)} className="p-3 bg-emerald-500 text-zinc-950 rounded-xl transition-transform active:scale-90"><Plus /></button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {(settings.categories || []).map((cat, idx) => (
            <div key={idx} className="bg-zinc-800 pl-4 pr-2 py-2 rounded-xl flex items-center gap-3 border border-zinc-700 group">
              <span className="text-xs font-bold text-zinc-300">{cat}</span>
              <button onClick={() => removeItem('categories', idx)} className="p-1 text-zinc-600 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Settings;
