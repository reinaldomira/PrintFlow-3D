import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { BusinessInfo } from '../types';
import { 
  LogOut, Plus, Trash2, Database, Copy, AlertCircle, Check, 
  User as UserIcon, Tag, Layers, Zap, Image as ImageIcon,
  Building2, Upload, Info, Cloud, CheckCircle2, Save, Calculator, RefreshCw,
  QrCode, Wallet, ShieldCheck, AlertTriangle
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { processAndUploadLogo } from '../services/settingsService';
import { PixKeyType, validatePixKey, formatPixKeyForDisplay, getPixKeyTypeLabel } from '../services/pixService';

const Settings: React.FC = () => {
  const { 
    settings, 
    setSettings, 
    logout, 
    user, 
    dbError, 
    settingsSyncState, 
    refreshData, 
    settingsConflict, 
    resolveConflict 
  } = useApp();
  const [newBrand, setNewBrand] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedSyncSql, setCopiedSyncSql] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [logoNotice, setLogoNotice] = useState<string | null>(null);
  const [businessForm, setBusinessForm] = useState<BusinessInfo>(() => settings.businessInfo || {});
  const [isDirty, setIsDirty] = useState(false);

  // Reseta estado sujo e re-inicializa formulário ao trocar de usuário ou deslogar
  React.useEffect(() => {
    setIsDirty(false);
    setSaveStatus('idle');
    setLogoNotice(null);
    setBusinessForm(settings.businessInfo || {});
  }, [user?.id]);

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

  const [isRefreshingCloud, setIsRefreshingCloud] = useState(false);

  const handleManualPull = async () => {
    setIsRefreshingCloud(true);
    await refreshData();
    setIsDirty(false);
    if (settings.businessInfo) {
      setBusinessForm(settings.businessInfo);
    }
    setTimeout(() => setIsRefreshingCloud(false), 800);
  };

  const businessSyncSql = `-- =============================================================================
-- PRINTFLOW 3D: SCRIPT DE ATUALIZAÇÃO DO SUPABASE (OPCIONAL)
-- O aplicativo sincroniza automaticamente dados comerciais e custos de fabricação
-- na nuvem entre celular e computador mesmo sem executar este script.
-- Caso deseje adicionar as colunas nativas no banco, execute este comando no SQL Editor:
-- =============================================================================

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_labor_rate numeric DEFAULT 25.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_maintenance_cost numeric DEFAULT 1.50;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS business_info jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_packaging_cost numeric DEFAULT 2.50;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_other_costs numeric DEFAULT 0.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_payment_fee_percent numeric DEFAULT 3.99;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_marketplace_fee_percent numeric DEFAULT 0.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_tax_percent numeric DEFAULT 6.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_refresh_orders boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS supplies jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS units_per_print numeric DEFAULT 1;`;

  const copySyncSql = () => {
    navigator.clipboard.writeText(businessSyncSql);
    setCopiedSyncSql(true);
    setTimeout(() => setCopiedSyncSql(false), 2000);
  };

  const sqlScript = `
-- SCRIPT DE ATUALIZAÇÃO E SINCRONIZAÇÃO PRINTFLOW 3D
-- Rodar no SQL EDITOR do Supabase

-- 1. TABELA FILAMENTOS
CREATE TABLE IF NOT EXISTS public.filaments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    brand text,
    material text,
    color_name text,
    color_hex text DEFAULT '#10b981',
    weight numeric DEFAULT 1000,
    remaining_weight numeric DEFAULT 1000,
    price_paid numeric DEFAULT 120,
    created_at timestamptz DEFAULT now()
);

-- 2. TABELA IMPRESSORAS
CREATE TABLE IF NOT EXISTS public.printers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    brand text,
    model text,
    power numeric DEFAULT 350,
    status text DEFAULT 'Ativa',
    created_at timestamptz DEFAULT now()
);

-- 3. TABELA PEÇAS
CREATE TABLE IF NOT EXISTS public.parts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    category text,
    material text DEFAULT 'PLA',
    weight numeric DEFAULT 0,
    print_time numeric DEFAULT 0,
    post_processing_time numeric DEFAULT 0,
    filament_cost numeric,
    energy_cost numeric,
    waste_percent numeric DEFAULT 5,
    profit_margin numeric DEFAULT 100,
    recipe jsonb DEFAULT '[]'::jsonb,
    image_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. TABELA PEDIDOS
CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    customer_id uuid,
    items jsonb DEFAULT '[]'::jsonb,
    total_value numeric NOT NULL DEFAULT 0,
    status text DEFAULT 'Em produção',
    discount numeric DEFAULT 0,
    payments jsonb DEFAULT '[]'::jsonb,
    payment_method text DEFAULT 'Pix',
    created_at timestamptz DEFAULT now()
);

-- 5. TABELA CONFIGURAÇÕES
CREATE TABLE IF NOT EXISTS public.settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    default_energy_cost numeric DEFAULT 0.85,
    default_filament_cost numeric DEFAULT 120,
    default_profit_margin numeric DEFAULT 100,
    hourly_labor_rate numeric DEFAULT 25.00,
    hourly_maintenance_cost numeric DEFAULT 1.50,
    currency text DEFAULT 'R$',
    filament_brands text[] DEFAULT ARRAY['3D Prime', 'Creality'],
    categories text[] DEFAULT ARRAY['Chaveiro', 'Organizador', 'Decoração'],
    business_info jsonb DEFAULT '{}'::jsonb,
    default_packaging_cost numeric DEFAULT 2.50,
    default_other_costs numeric DEFAULT 0.00,
    default_payment_fee_percent numeric DEFAULT 3.99,
    default_marketplace_fee_percent numeric DEFAULT 0.00,
    default_tax_percent numeric DEFAULT 6.00,
    updated_at timestamptz DEFAULT now()
);

-- 6. TABELA CLIENTES
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 7. TABELA INSUMOS & COMPONENTES (Argolas, Ímãs, Botões, Parafusos, Embalagens)
CREATE TABLE IF NOT EXISTS public.supplies (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    category text DEFAULT 'Outros',
    quantity numeric DEFAULT 0,
    min_quantity numeric DEFAULT 10,
    unit_cost numeric DEFAULT 0,
    package_price numeric DEFAULT 0,
    package_units numeric DEFAULT 1,
    supplier text,
    link text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- GARANTIA DE COLUNAS ADICIONAIS NA TABELA SETTINGS E PARTS
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS supplies jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_labor_rate numeric DEFAULT 25.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_maintenance_cost numeric DEFAULT 1.50;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS business_info jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_packaging_cost numeric DEFAULT 2.50;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_other_costs numeric DEFAULT 0.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_payment_fee_percent numeric DEFAULT 3.99;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_marketplace_fee_percent numeric DEFAULT 0.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_tax_percent numeric DEFAULT 6.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      setLogoNotice('A imagem do logotipo deve ter no máximo 5MB.');
      return;
    }
    try {
      setSaveStatus('saving');
      const { url, isCloudStorage, notice } = await processAndUploadLogo(user.id, file);
      const updated = { ...businessForm, logoUrl: url };
      setBusinessForm(updated);
      setIsDirty(true);
      if (notice) {
        setLogoNotice(notice);
      } else {
        setLogoNotice(isCloudStorage ? 'Logotipo enviado ao Supabase Storage!' : null);
      }
      await saveBusinessData(updated);
    } catch (err: any) {
      console.error('Erro ao processar logotipo:', err);
      setLogoNotice('Erro ao carregar logotipo: ' + (err.message || 'Falha de processamento'));
      setSaveStatus('error');
    }
  };

  const handleRemoveLogo = () => {
    const updated = { ...businessForm, logoUrl: '' };
    setBusinessForm(updated);
    setLogoNotice(null);
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

      {/* Alerta de Conflito de Sincronização entre Dispositivos */}
      {settingsConflict && (
        <div className="bg-amber-500/15 border-2 border-amber-500/50 rounded-3xl p-6 shadow-xl shadow-amber-500/10 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-zinc-950 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-black uppercase text-sm text-amber-400">Conflito de Concorrência Detectado</h3>
              <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                Outro dispositivo gravou configurações mais recentes na nuvem em{' '}
                <span className="font-semibold text-white">
                  {new Date(settingsConflict.remoteUpdatedAt).toLocaleString('pt-BR')}
                </span>
                {settingsConflict.remoteVersion ? ` (Versão na nuvem: v${settingsConflict.remoteVersion})` : ''}.
                Para evitar sobrescrita de dados sem aviso, escolha como prosseguir:
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={async () => {
                setIsDirty(false);
                await resolveConflict('keep_remote');
              }}
              className="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-zinc-700 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-emerald-400" /> Manter da Nuvem (Descartar local)
            </button>
            <button
              type="button"
              onClick={async () => {
                setIsDirty(false);
                await resolveConflict('overwrite_remote');
              }}
              className="py-3 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" /> Sobrescrever Nuvem com Dados Locais
            </button>
          </div>
        </div>
      )}

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
          {settingsSyncState === 'synced' && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" /> Sincronizado na Nuvem (PC & Celular)
            </span>
          )}
          {settingsSyncState === 'pending_local' && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" /> Salvo no Dispositivo (Pendente na Nuvem)
            </span>
          )}
          {settingsSyncState === 'saving' && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5">
              <Cloud className="w-3 h-3 animate-pulse" /> Sincronizando com Supabase...
            </span>
          )}
          {settingsSyncState === 'error' && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" /> Erro de Conexão Cloud
            </span>
          )}
        </div>

        {/* Banner Informativo de Sincronização */}
        {settingsSyncState === 'synced' ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-emerald-300 text-xs sm:text-sm">
                  Sincronização Cloud Ativa (PC & Celular)
                </p>
                <p className="text-zinc-400 leading-relaxed text-[11px]">
                  Todas as informações comerciais, custos e taxas estão sincronizadas na nuvem Supabase. Qualquer alteração feita no celular, tablet ou computador é automaticamente compartilhada em tempo real com todos os seus dispositivos.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300 text-xs sm:text-sm">
                  Sincronizando com a Nuvem...
                </p>
                <p className="text-zinc-400 leading-relaxed text-[11px]">
                  Os dados estão salvos localmente e sendo transmitidos ao Supabase. Toque em "Salvar Dados do Orçamento" para confirmar o envio ou "Puxar da Nuvem" para recarregar.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-400 font-medium">
                Script SQL opcional para colunas nativas no banco Supabase:
              </span>
              <button
                type="button"
                onClick={copySyncSql}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-zinc-950/80 hover:bg-zinc-950 px-3 py-1.5 rounded-xl border border-amber-500/30 flex items-center justify-center gap-1.5 transition-all self-start sm:self-auto cursor-pointer"
              >
                {copiedSyncSql ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Script SQL Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar SQL Opcional</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

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
          {logoNotice && (
            <p className="text-[11px] text-cyan-400 bg-cyan-950/50 border border-cyan-800/50 p-2.5 rounded-xl">
              {logoNotice}
            </p>
          )}
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

        {/* ==================================================================== */}
        {/* SEÇÃO: CONFIGURAÇÃO DE RECEBIMENTO VIA PIX (PRINT_3DBR)              */}
        {/* ==================================================================== */}
        <div className="pt-6 border-t border-zinc-800 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-black uppercase text-xs tracking-wider text-zinc-200 flex items-center gap-2">
                  <span>Dados para Recebimento via Pix</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                    PDF & Vendas
                  </span>
                </h4>
                <p className="text-[11px] text-zinc-400">
                  Cadastre sua chave uma única vez. Ao selecionar Pix em qualquer pedido, os dados e o QR Code oficial serão gerados no PDF.
                </p>
              </div>
            </div>

            {businessForm.pixKey && businessForm.pixKey.trim() !== '' ? (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" /> Chave Pix Ativa no PDF
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Pix Não Configurado
              </span>
            )}
          </div>

          {/* 1. Seletor do Tipo de Chave Pix */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-400 tracking-wider">
              1. Tipo de Chave Pix <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { id: 'cpf', label: 'CPF', hint: '11 dígitos' },
                { id: 'cnpj', label: 'CNPJ', hint: '14 dígitos' },
                { id: 'email', label: 'E-mail', hint: 'nome@dominio' },
                { id: 'phone', label: 'Telefone', hint: 'DDD + Número' },
                { id: 'random', label: 'Aleatória', hint: 'Chave EVP' }
              ].map(item => {
                const isSelected = (businessForm.pixKeyType || 'cpf') === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleFieldChange('pixKeyType', item.id as PixKeyType)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/50 shadow-sm'
                        : 'bg-zinc-800/70 border-zinc-700/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    <span className="block font-bold text-xs">{item.label}</span>
                    <span className="block text-[9px] text-zinc-500 truncate">{item.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Grid de Campos Pix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Chave Pix */}
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                  2. Chave Pix Completa <span className="text-red-400">*</span>
                </label>
                {businessForm.pixKey && (
                  <span className="text-[10px] font-mono text-emerald-400">
                    Tipo: {getPixKeyTypeLabel(businessForm.pixKeyType)}
                  </span>
                )}
              </div>
              <input
                type="text"
                placeholder={
                  (businessForm.pixKeyType === 'cnpj') ? 'Ex: 12.345.678/0001-90 ou 12345678000190' :
                  (businessForm.pixKeyType === 'email') ? 'Ex: financeiro@print3dbr.com.br' :
                  (businessForm.pixKeyType === 'phone') ? 'Ex: (11) 98765-4321 ou 11987654321' :
                  (businessForm.pixKeyType === 'random') ? 'Ex: 123e4567-e89b-12d3-a456-426614174000' :
                  'Ex: 123.456.789-00 ou 12345678900'
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-mono font-bold text-zinc-100 focus:border-emerald-500 outline-none transition-colors"
                value={businessForm.pixKey || ''}
                onChange={e => handleFieldChange('pixKey', e.target.value)}
              />
              {businessForm.pixKey && !validatePixKey(businessForm.pixKey, businessForm.pixKeyType || 'cpf').isValid && (
                <p className="text-[11px] text-amber-400 flex items-center gap-1.5 pt-0.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{validatePixKey(businessForm.pixKey, businessForm.pixKeyType || 'cpf').message}</span>
                </p>
              )}
            </div>

            {/* Nome do Titular */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                3. Nome Completo do Titular / Razão Social <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Print_3Dbr Manufatura Digital ou Nome do Empreendedor"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-emerald-500 outline-none transition-colors"
                value={businessForm.pixReceiverName || ''}
                onChange={e => handleFieldChange('pixReceiverName', e.target.value)}
              />
              <p className="text-[10px] text-zinc-500">
                Nome da pessoa ou empresa cadastrada na conta bancária para confirmação no app do pagador.
              </p>
            </div>

            {/* CPF ou CNPJ do Titular (Opcional) */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black uppercase text-zinc-500">
                CPF ou CNPJ do Titular (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: 00.000.000/0001-00"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-emerald-500 outline-none transition-colors"
                value={businessForm.pixReceiverDoc || ''}
                onChange={e => handleFieldChange('pixReceiverDoc', e.target.value)}
              />
              <p className="text-[10px] text-zinc-500">
                Exibido no PDF para dar maior segurança e clareza fiscal ao cliente.
              </p>
            </div>

            {/* Instituição Financeira / Banco (Opcional) */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black uppercase text-zinc-500">
                Instituição Financeira / Banco (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Nubank, Inter, Itaú, Banco do Brasil, Cora..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-emerald-500 outline-none transition-colors"
                value={businessForm.pixBank || ''}
                onChange={e => handleFieldChange('pixBank', e.target.value)}
              />
              <p className="text-[10px] text-zinc-500">
                Identifica qual banco receberá a transferência.
              </p>
            </div>
          </div>

          {/* Preview Visual dos Dados no Documento */}
          {businessForm.pixKey && businessForm.pixKey.trim() !== '' && (
            <div className="bg-zinc-950/80 border border-emerald-500/30 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Prévia da Seção no PDF de Orçamento</span>
                </span>
                <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase">
                  DADOS PARA PAGAMENTO VIA PIX
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 space-y-0.5">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase block">Tipo & Chave Pix:</span>
                  <strong className="text-emerald-400 font-mono text-xs block break-all">
                    {formatPixKeyForDisplay(businessForm.pixKey, businessForm.pixKeyType || 'cpf')}
                  </strong>
                  <span className="text-[9px] text-zinc-400">
                    Tipo: {getPixKeyTypeLabel(businessForm.pixKeyType)}
                  </span>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 space-y-0.5">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase block">Titular da Conta:</span>
                  <strong className="text-zinc-100 text-xs block truncate">
                    {businessForm.pixReceiverName || businessForm.companyName || 'Não informado'}
                  </strong>
                  <span className="text-[9px] text-zinc-400 block truncate">
                    {businessForm.pixBank ? `Banco: ${businessForm.pixBank}` : 'Banco: Não especificado'}
                    {businessForm.pixReceiverDoc ? ` • Doc: ${businessForm.pixReceiverDoc}` : ''}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-400 leading-relaxed pt-1">
                ℹ️ <strong>QR Code Padrão BACEN:</strong> O QR Code será gerado com o valor exato de cada pedido e inserido automaticamente no PDF apenas quando a forma de pagamento for Pix.
              </p>
            </div>
          )}
        </div>

        {/* Botão de Salvar e Sincronizar */}
        <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={handleSaveBusinessCloud}
            disabled={saveStatus === 'saving'}
            className={`sm:col-span-2 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2.5 transition-all active:scale-98 shadow-lg cursor-pointer ${
              saveStatus === 'saved'
                ? 'bg-emerald-500 text-zinc-950 shadow-emerald-500/20'
                : saveStatus === 'error'
                  ? 'bg-red-500 text-white shadow-red-500/20'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-cyan-500/20'
            }`}
          >
            {saveStatus === 'saving' ? (
              <>
                <Cloud className="w-5 h-5 animate-pulse" />
                <span>SALVANDO CONFIGURAÇÕES...</span>
              </>
            ) : saveStatus === 'saved' ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>CONFIGURAÇÕES SINCRONIZADAS NA NUVEM!</span>
              </>
            ) : saveStatus === 'error' ? (
              <>
                <AlertCircle className="w-5 h-5" />
                <span>ERRO AO SALVAR NO SUPABASE</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>SALVAR DADOS DO ORÇAMENTO</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleManualPull}
            disabled={isRefreshingCloud}
            className="py-4 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border border-zinc-700 transition-all active:scale-98 cursor-pointer"
            title="Recarrega as configurações mais recentes gravadas no Supabase Cloud por qualquer aparelho"
          >
            <RefreshCw className={`w-4 h-4 text-cyan-400 ${isRefreshingCloud ? 'animate-spin' : ''}`} />
            <span>{isRefreshingCloud ? 'ATUALIZANDO...' : 'PUXAR DA NUVEM'}</span>
          </button>
        </div>
      </div>

      {/* Default Costs */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-emerald-500" />
          <h3 className="font-black uppercase text-xs tracking-widest text-zinc-400">Custos Padrão de Fabricação</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Energia (R$/kWh)</label>
            <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.defaultEnergyCost} onChange={e => handleUpdate('defaultEnergyCost', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Filamento Padrão (R$/kg)</label>
            <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.defaultFilamentCost} onChange={e => handleUpdate('defaultFilamentCost', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Margem de Lucro Padrão (%)</label>
            <input type="number" step="1" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.defaultProfitMargin} onChange={e => handleUpdate('defaultProfitMargin', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Mão de Obra (R$/h)</label>
            <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.hourlyLaborRate} onChange={e => handleUpdate('hourlyLaborRate', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Manutenção de Máquina (R$/h)</label>
            <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.hourlyMaintenanceCost} onChange={e => handleUpdate('hourlyMaintenanceCost', Number(e.target.value))} />
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
