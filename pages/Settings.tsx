import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { BusinessInfo } from '../types';
import { 
  LogOut, Plus, Trash2, Database, Copy, AlertCircle, Check, 
  User as UserIcon, Tag, Layers, Zap, Image as ImageIcon,
  Building2, Upload, Info, Cloud, CheckCircle2, Save, Calculator
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';

const Settings: React.FC = () => {
  const { settings, setSettings, logout, user, dbError } = useApp();
  const [newBrand, setNewBrand] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedSyncSql, setCopiedSyncSql] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [businessForm, setBusinessForm] = useState<BusinessInfo>(() => settings.businessInfo || {});
  const [isDirty, setIsDirty] = useState(false);

  // Sincroniza formulário local quando dados chegam da nuvem (ex: outro dispositivo ou login)
  React.useEffect(() => {
    if (!isDirty && settings.businessInfo) {
      setBusinessForm(settings.businessInfo);
    }
  }, [settings.businessInfo, isDirty]);

  // Sincronização automática em segundo plano (autosave debounced)
  React.useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      saveBusinessData(businessForm);
    }, 1500);

    return () => clearTimeout(timer);
  }, [businessForm, isDirty]);

  const businessSyncSql = `ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "businessInfo" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS business_info jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "hourlyLaborRate" numeric DEFAULT 25;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "hourlyMaintenanceCost" numeric DEFAULT 1.5;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_labor_rate numeric DEFAULT 25;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_maintenance_cost numeric DEFAULT 1.5;`;

  const copySyncSql = () => {
    navigator.clipboard.writeText(businessSyncSql);
    setCopiedSyncSql(true);
    setTimeout(() => setCopiedSyncSql(false), 2000);
  };

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
    categories text[] DEFAULT ARRAY['Chaveiro', 'Organizador', 'Decoração'],
    "businessInfo" jsonb DEFAULT '{}'::jsonb,
    business_info jsonb DEFAULT '{}'::jsonb
);

-- 6. TABELA CLIENTES
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    notes text,
    "createdAt" timestamptz DEFAULT now()
);

-- GARANTIA DE COLUNAS ADICIONAIS E SINCRONIZAÇÃO ENTRE DISPOSITIVOS
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS "paymentMethod" text DEFAULT 'Pix';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS "printerId" text;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS "postProcessingTime" numeric DEFAULT 0;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "businessInfo" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS business_info jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "hourlyLaborRate" numeric DEFAULT 25;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "hourlyMaintenanceCost" numeric DEFAULT 1.5;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_labor_rate numeric DEFAULT 25;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_maintenance_cost numeric DEFAULT 1.5;
`.trim();

  const handleUpdate = (key: keyof typeof settings, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  const handleFieldChange = (field: keyof BusinessInfo, value: string) => {
    setIsDirty(true);
    setBusinessForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveBusinessData = async (dataToSave?: BusinessInfo) => {
    const data = dataToSave || businessForm;
    setSaveStatus('saving');
    const ok = await setSettings({
      ...settings,
      businessInfo: data
    });
    if (ok) {
      setIsDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } else {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 5000);
    }
  };

  const handleSaveBusinessCloud = async () => {
    await saveBusinessData(businessForm);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('A imagem do logotipo deve ter no máximo 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        const updated = { ...businessForm, logoUrl: base64 };
        setBusinessForm(updated);
        setIsDirty(true);
        saveBusinessData(updated);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    const updated = { ...businessForm, logoUrl: '' };
    setBusinessForm(updated);
    setIsDirty(true);
    saveBusinessData(updated);
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

      {/* Dados Comerciais do Orçamento */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            <h3 className="font-black uppercase text-xs tracking-widest text-zinc-300">
              Dados comerciais do orçamento
            </h3>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5">
            <Cloud className="w-3 h-3" /> Sincronização em Nuvem (Multi-Dispositivos)
          </span>
        </div>

        {/* Banner de Sincronização em Nuvem Multi-Dispositivos */}
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Cloud className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-cyan-300 text-xs sm:text-sm">
                Sincronização Automática Ativa (PC & Celular)
              </p>
              <p className="text-zinc-400 leading-relaxed text-[11px]">
                Ao salvar os dados abaixo, eles são gravados no Supabase vinculados à sua conta. Qualquer alteração feita aqui no computador será carregada automaticamente no celular, e vice-versa.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-400 font-medium">
              Necessário coluna <code className="text-cyan-300 bg-zinc-950 px-1 py-0.5 rounded">business_info</code> na tabela settings do Supabase.
            </span>
            <button
              type="button"
              onClick={copySyncSql}
              className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 bg-zinc-950/80 hover:bg-zinc-950 px-3 py-1.5 rounded-xl border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-all self-start sm:self-auto"
            >
              {copiedSyncSql ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Comando SQL Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar SQL de Sincronização</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Logotipo */}
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase text-zinc-500">
            Logotipo da Empresa
          </label>
          <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-zinc-800/60 border border-zinc-700/60 rounded-2xl">
            <div className="w-20 h-20 rounded-2xl bg-zinc-800 border-2 border-dashed border-zinc-700 flex items-center justify-center overflow-hidden flex-shrink-0">
              {businessForm.logoUrl ? (
                <img 
                  src={businessForm.logoUrl} 
                  alt="Logo" 
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-zinc-600" />
              )}
            </div>
            <div className="flex-1 space-y-2 text-center sm:text-left w-full">
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <label className="cursor-pointer bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all">
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Enviar Imagem</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleLogoUpload}
                  />
                </label>
                {businessForm.logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Ou cole a URL da imagem (https://...)"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-medium text-zinc-200 focus:border-cyan-500 outline-none transition-colors"
                value={businessForm.logoUrl || ''}
                onChange={e => handleFieldChange('logoUrl', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Campos de Dados Comerciais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Nome da Empresa ou Marca
            </label>
            <input
              type="text"
              placeholder="Ex: PrintFlow 3D Studio"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.companyName || ''}
              onChange={e => handleFieldChange('companyName', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Telefone Comercial
            </label>
            <input
              type="tel"
              placeholder="(11) 3456-7890"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.phone || ''}
              onChange={e => handleFieldChange('phone', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              WhatsApp
            </label>
            <input
              type="tel"
              placeholder="(11) 98765-4321"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.whatsapp || ''}
              onChange={e => handleFieldChange('whatsapp', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Instagram
            </label>
            <input
              type="text"
              placeholder="@suamarca.3d"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.instagram || ''}
              onChange={e => handleFieldChange('instagram', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              E-mail Comercial
            </label>
            <input
              type="email"
              placeholder="contato@suamarca.com.br"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.email || ''}
              onChange={e => handleFieldChange('email', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Site
            </label>
            <input
              type="text"
              placeholder="www.suamarca.com.br"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.website || ''}
              onChange={e => handleFieldChange('website', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Cidade e Estado
            </label>
            <input
              type="text"
              placeholder="São Paulo - SP"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.cityState || ''}
              onChange={e => handleFieldChange('cityState', e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Endereço Comercial (Opcional)
            </label>
            <input
              type="text"
              placeholder="Av. Paulista, 1000 - Bela Vista"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.address || ''}
              onChange={e => handleFieldChange('address', e.target.value)}
            />
          </div>
        </div>

        {/* Botão de Salvar e Sincronizar na Nuvem */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSaveBusinessCloud}
            disabled={saveStatus === 'saving'}
            className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2.5 transition-all active:scale-98 shadow-lg ${
              saveStatus === 'saved'
                ? 'bg-emerald-500 text-zinc-950 shadow-emerald-500/20'
                : saveStatus === 'error'
                  ? 'bg-amber-500 text-zinc-950 shadow-amber-500/20'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-cyan-500/20'
            }`}
          >
            {saveStatus === 'saving' ? (
              <>
                <Cloud className="w-5 h-5 animate-pulse" />
                <span>SINCRONIZANDO NA NUVEM...</span>
              </>
            ) : saveStatus === 'saved' ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>DADOS COMERCIAIS SINCRONIZADOS NA NUVEM!</span>
              </>
            ) : saveStatus === 'error' ? (
              <>
                <AlertCircle className="w-5 h-5" />
                <span>SALVO NO DISPOSITIVO (RODE O SQL PARA NUVEM)</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>SALVAR E SINCRONIZAR DADOS COMERCIAIS</span>
              </>
            )}
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

      {/* Taxas Comerciais & Custos de Venda Padrão (pricingCalculator) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Calculator className="w-4 h-4 text-emerald-500" />
          <h3 className="font-black uppercase text-xs tracking-widest text-zinc-400">Taxas e Custos Comerciais Padrão</h3>
        </div>
        <p className="text-xs text-zinc-500">
          Valores base aplicados automaticamente na calculadora avançada de cada nova venda.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-400">Embalagem Padrão (R$)</label>
            <input 
              type="number" 
              step="0.01" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 font-bold focus:border-emerald-500 outline-none transition-colors text-white text-sm"
              value={settings.defaultPackagingCost ?? 2.50} 
              onChange={e => handleUpdate('defaultPackagingCost', Number(e.target.value))} 
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-400">Outros Custos Fixos (R$)</label>
            <input 
              type="number" 
              step="0.01" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 font-bold focus:border-emerald-500 outline-none transition-colors text-white text-sm"
              value={settings.defaultOtherCosts ?? 0.00} 
              onChange={e => handleUpdate('defaultOtherCosts', Number(e.target.value))} 
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-400">Taxa de Pagamento Padrão (%)</label>
            <input 
              type="number" 
              step="0.01" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 font-bold focus:border-emerald-500 outline-none transition-colors text-white text-sm"
              value={settings.defaultPaymentFeePercent ?? 3.99} 
              onChange={e => handleUpdate('defaultPaymentFeePercent', Number(e.target.value))} 
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-400">Comissão de Marketplace Padrão (%)</label>
            <input 
              type="number" 
              step="0.01" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 font-bold focus:border-emerald-500 outline-none transition-colors text-white text-sm"
              value={settings.defaultMarketplaceFeePercent ?? 0.00} 
              onChange={e => handleUpdate('defaultMarketplaceFeePercent', Number(e.target.value))} 
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-[10px] font-black uppercase text-zinc-400">Impostos / Simples / MEI Padrão (%)</label>
            <input 
              type="number" 
              step="0.01" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 font-bold focus:border-emerald-500 outline-none transition-colors text-white text-sm"
              value={settings.defaultTaxPercent ?? 6.00} 
              onChange={e => handleUpdate('defaultTaxPercent', Number(e.target.value))} 
            />
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
