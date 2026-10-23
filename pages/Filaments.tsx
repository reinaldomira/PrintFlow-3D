import React, { useState, useMemo, useId } from 'react';
import { useApp } from '../context/AppContext';
import { Filament } from '../types';
import { supabase } from '../services/supabase';
import { MATERIALS, formatCurrency } from '../constants';
import { 
  Plus, Search, Trash2, Edit2, X, Droplet, Loader2, 
  Layers, AlertTriangle, CheckCircle2, PackageX, Sparkles,
  ArrowRight, ShieldAlert, Scale, DollarSign
} from 'lucide-react';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';

// Color presets for quick spool creation
const PRESET_COLORS = [
  { name: 'Preto', hex: '#1e293b' },
  { name: 'Branco', hex: '#f8fafc' },
  { name: 'Cinza', hex: '#64748b' },
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Verde', hex: '#10b981' },
  { name: 'Amarelo', hex: '#f59e0b' },
  { name: 'Laranja', hex: '#f97316' },
  { name: 'Roxo', hex: '#8b5cf6' },
  { name: 'Cobre / Ouro', hex: '#d97706' }
];

// Helper to guarantee a valid, bright hex color for SVG and UI display
export const resolveColorHex = (hex?: string, name?: string): string => {
  if (hex && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex.trim())) {
    return hex.trim();
  }
  const lower = (name || '').toLowerCase();
  if (lower.includes('pret') || lower.includes('black')) return '#1e293b';
  if (lower.includes('branc') || lower.includes('white')) return '#f8fafc';
  if (lower.includes('cinz') || lower.includes('grey') || lower.includes('gray')) return '#64748b';
  if (lower.includes('vermelh') || lower.includes('red')) return '#ef4444';
  if (lower.includes('azul') || lower.includes('blue')) return '#3b82f6';
  if (lower.includes('verd') || lower.includes('green')) return '#10b981';
  if (lower.includes('amarel') || lower.includes('yellow')) return '#f59e0b';
  if (lower.includes('laranj') || lower.includes('orange')) return '#f97316';
  if (lower.includes('rox') || lower.includes('purple')) return '#8b5cf6';
  if (lower.includes('ros') || lower.includes('pink')) return '#ec4899';
  if (lower.includes('dourad') || lower.includes('ouro') || lower.includes('gold')) return '#eab308';
  if (lower.includes('cobre') || lower.includes('copper') || lower.includes('bronz')) return '#d97706';
  if (lower.includes('marrom') || lower.includes('brown')) return '#78350f';
  return '#10b981';
};

// Spool Illustration matching Reference 2 with isolated SVG IDs and rich color fidelity
const SpoolVisual: React.FC<{ colorHex?: string; colorName?: string; percentage: number; size?: number }> = ({ 
  colorHex, 
  colorName,
  percentage, 
  size = 110 
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '_');
  const validColor = resolveColorHex(colorHex, colorName);
  const isLow = percentage <= 20;
  const isDepleted = percentage <= 0;

  // Coil radius: from 22 (empty spool core) to 43 (full 1kg spool)
  const clampedPct = Math.max(0, Math.min(100, percentage));
  const coilRadius = Math.max(22, 22 + (21 * (clampedPct / 100)));

  const coilGradId = `coil_${uid}`;
  const flangeGradId = `flange_${uid}`;
  const hubGradId = `hub_${uid}`;
  const specGradId = `spec_${uid}`;

  return (
    <div className="relative flex items-center justify-center shrink-0 group/spool" style={{ width: size, height: size }}>
      {/* Subtle Ambient Backlight Glow matching filament color */}
      <div 
        className="absolute inset-2 rounded-full blur-md opacity-35 group-hover/spool:opacity-60 transition-opacity pointer-events-none"
        style={{ backgroundColor: validColor }}
      />

      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg select-none relative z-10">
        <defs>
          {/* Spool Flange Rim Gradient */}
          <radialGradient id={flangeGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="65%" stopColor="#0f172a" />
            <stop offset="90%" stopColor="#020617" />
            <stop offset="100%" stopColor="#334155" />
          </radialGradient>

          {/* Filament Coil Gradient (Unique per instance using validColor) */}
          <radialGradient id={coilGradId} cx="42%" cy="42%" r="58%">
            <stop offset="0%" stopColor={validColor} stopOpacity="1" />
            <stop offset="70%" stopColor={validColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor="#090d16" stopOpacity="0.8" />
          </radialGradient>

          {/* 3D Specular Sheen Gradient across spool */}
          <linearGradient id={specGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="65%" stopColor="#000000" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
          </linearGradient>

          {/* Center Hub Gradient */}
          <radialGradient id={hubGradId} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="70%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </radialGradient>
        </defs>

        {/* Back Flange Rim */}
        <circle cx="50" cy="50" r="48" fill={`url(#${flangeGradId})`} stroke="#334155" strokeWidth="1.5" />

        {/* Filament Winding Coil */}
        {!isDepleted ? (
          <>
            {/* Base Coil Body */}
            <circle 
              cx="50" 
              cy="50" 
              r={coilRadius} 
              fill={`url(#${coilGradId})`}
              stroke={validColor} 
              strokeWidth="1.2" 
            />

            {/* Realistic Concentric Winding Ridges */}
            <circle cx="50" cy="50" r={Math.max(22, coilRadius - 2)} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.75" />
            {coilRadius > 28 && (
              <circle cx="50" cy="50" r={Math.max(22, coilRadius - 6)} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
            )}
            {coilRadius > 34 && (
              <circle cx="50" cy="50" r={Math.max(22, coilRadius - 11)} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.75" />
            )}
            {coilRadius > 40 && (
              <circle cx="50" cy="50" r={Math.max(22, coilRadius - 16)} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
            )}

            {/* Specular 3D Highlight Layer */}
            <circle cx="50" cy="50" r={coilRadius} fill={`url(#${specGradId})`} pointerEvents="none" />
          </>
        ) : (
          /* Empty spool core */
          <circle cx="50" cy="50" r="22" fill="#1e293b" stroke="#475569" strokeWidth="1" strokeDasharray="3 3" />
        )}

        {/* Outer Flange Inner Lip */}
        <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

        {/* Spool Flange Cutout Windows */}
        <circle cx="50" cy="18" r="4" fill="#0b111e" opacity="0.65" stroke="#334155" strokeWidth="0.75" />
        <circle cx="22" cy="66" r="4" fill="#0b111e" opacity="0.65" stroke="#334155" strokeWidth="0.75" />
        <circle cx="78" cy="66" r="4" fill="#0b111e" opacity="0.65" stroke="#334155" strokeWidth="0.75" />

        {/* Center Hub Core */}
        <circle cx="50" cy="50" r="18" fill={`url(#${hubGradId})`} stroke="#475569" strokeWidth="1.5" />
        
        {/* Inner Hub Structural Ring */}
        <circle cx="50" cy="50" r="13" fill="none" stroke="#1e293b" strokeWidth="1.2" />

        {/* Center Spindle Hole (Depth Shadow) */}
        <circle cx="50" cy="50" r="8" fill="#000000" stroke="#334155" strokeWidth="1" />
      </svg>

      {/* Floating Mini Status Indicator */}
      {isLow && !isDepleted && (
        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-[#121927] animate-pulse shadow-md" title="Estoque baixo (≤20%)" />
      )}
      {isDepleted && (
        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-[#121927] shadow-md" title="Carretel esgotado" />
      )}
    </div>
  );
};


const Filaments: React.FC = () => {
  const { filaments, setFilaments, refreshData, settings, user } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<string>('Todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('Todos');
  const [editingFilament, setEditingFilament] = useState<Partial<Filament> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Top KPI Metrics calculated from real data
  const inventoryMetrics = useMemo(() => {
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let totalWeightGrams = 0;
    let totalInvested = 0;

    filaments.forEach(f => {
      const remaining = f.remainingWeight || 0;
      const nominal = f.weight || 1000;
      const pct = nominal > 0 ? (remaining / nominal) * 100 : 0;

      totalWeightGrams += remaining;
      if (nominal > 0) {
        totalInvested += (f.pricePaid / nominal) * remaining;
      }

      if (remaining <= 0) {
        outOfStock++;
      } else if (pct <= 20) {
        lowStock++;
      } else {
        inStock++;
      }
    });

    return {
      inStock,
      lowStock,
      outOfStock,
      totalCount: filaments.length,
      totalKg: (totalWeightGrams / 1000).toFixed(2),
      totalInvested
    };
  }, [filaments]);

  // Unique materials in database + default list
  const materialOptions = useMemo(() => {
    const set = new Set<string>(['Todos', ...MATERIALS]);
    filaments.forEach(f => {
      if (f.material) set.add(f.material);
    });
    return Array.from(set);
  }, [filaments]);

  // Filtered filaments
  const filteredFilaments = useMemo(() => {
    return filaments.filter(f => {
      // Search term
      const matchesSearch = 
        f.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.colorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.material.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // Material filter
      if (selectedMaterial !== 'Todos' && f.material !== selectedMaterial) {
        return false;
      }

      // Stock status filter (20% nominal rule)
      const pct = f.weight > 0 ? (f.remainingWeight / f.weight) * 100 : 0;
      if (selectedStatus === 'in_stock') {
        return pct > 20 && f.remainingWeight > 0;
      }
      if (selectedStatus === 'low_stock') {
        return pct <= 20 && f.remainingWeight > 0;
      }
      if (selectedStatus === 'out_of_stock') {
        return f.remainingWeight <= 0;
      }

      return true;
    });
  }, [filaments, searchTerm, selectedMaterial, selectedStatus]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFilament?.brand || !editingFilament?.colorName || !user) return;
    setIsSaving(true);

    try {
      const payload = {
        ...editingFilament,
        user_id: user.id,
        weight: Number(editingFilament.weight) || 1000,
        pricePaid: Number(editingFilament.pricePaid) || 0,
        remainingWeight: editingFilament.id 
          ? Number(editingFilament.remainingWeight ?? editingFilament.weight) 
          : Number(editingFilament.weight || 1000)
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

  const confirmDeleteFilament = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const idToDelete = deleteTarget.id;
    try {
      // Atualização otimista imediata para resposta instantânea na interface
      setFilaments(filaments.filter(f => f.id !== idToDelete));
      const { error } = await supabase.from('filaments').delete().eq('id', idToDelete);
      if (error) {
        throw error;
      }
      setActionNotice({ type: 'success', message: 'Carretel de filamento excluído com sucesso!' });
      setTimeout(() => setActionNotice(null), 4000);
      setDeleteTarget(null);
      await refreshData();
    } catch (err: any) {
      console.error('Erro ao deletar filamento:', err);
      setActionNotice({ type: 'error', message: `Erro ao excluir: ${err.message || 'Falha no banco de dados'}` });
      await refreshData();
    } finally {
      setIsDeleting(false);
    }
  };

  const openNewFilamentModal = () => {
    setEditingFilament({ 
      brand: settings.filamentBrands[0] || 'Voolt3D', 
      colorName: '', 
      colorHex: '#10b981', 
      material: 'PLA', 
      weight: 1000, 
      remainingWeight: 1000,
      pricePaid: settings.defaultFilamentCost || 110 
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Gestão de Filamentos
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Cloud Sync
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Controle de carretéis, pesagem restante e insumos em estoque
          </p>
        </div>

        <button 
          onClick={openNewFilamentModal}
          className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Carretel</span>
        </button>
      </div>

      {/* Action Feedback Notice */}
      {actionNotice && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border animate-in fade-in ${
          actionNotice.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{actionNotice.message}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top 4 KPI Metric Cards matching Reference 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: In Stock */}
        <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-black/20 hover:border-emerald-500/40 transition-all">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                EM ESTOQUE (&gt;20%)
              </p>
            </div>
            <p className="text-2xl font-black text-slate-100 font-mono">
              {inventoryMetrics.inStock}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Nível saudável</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Low Stock (<= 20%) */}
        <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-black/20 hover:border-amber-500/40 transition-all">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                BAIXO ESTOQUE (≤20%)
              </p>
            </div>
            <p className="text-2xl font-black text-amber-400 font-mono">
              {inventoryMetrics.lowStock}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Requer reposição</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Out of Stock */}
        <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-black/20 hover:border-rose-500/40 transition-all">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-rose-400 shadow-sm shadow-rose-400/50" />
              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                ESGOTADOS (0G)
              </p>
            </div>
            <p className="text-2xl font-black text-rose-400 font-mono">
              {inventoryMetrics.outOfStock}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Carretéis zerados</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <PackageX className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Total Weight & Invested */}
        <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-black/20 hover:border-cyan-500/40 transition-all">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                PESO TOTAL RESTANTE
              </p>
            </div>
            <p className="text-2xl font-black text-cyan-400 font-mono">
              {inventoryMetrics.totalKg} <span className="text-xs font-normal text-slate-400">kg</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Valor: <span className="text-slate-300 font-mono font-semibold">{formatCurrency(inventoryMetrics.totalInvested)}</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Scale className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-4 space-y-3 shadow-lg shadow-black/20">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por marca, cor ou material..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#0b111e] border border-[#1e2a42] rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition-colors"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Status Quick Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => setSelectedStatus('Todos')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedStatus === 'Todos'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'bg-[#0b111e] text-slate-400 border border-[#1e2a42] hover:text-white'
              }`}
            >
              Todos ({filaments.length})
            </button>
            <button
              onClick={() => setSelectedStatus('in_stock')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedStatus === 'in_stock'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'bg-[#0b111e] text-slate-400 border border-[#1e2a42] hover:text-white'
              }`}
            >
              Em Estoque ({inventoryMetrics.inStock})
            </button>
            <button
              onClick={() => setSelectedStatus('low_stock')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedStatus === 'low_stock'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'bg-[#0b111e] text-slate-400 border border-[#1e2a42] hover:text-white'
              }`}
            >
              Crítico ≤20% ({inventoryMetrics.lowStock})
            </button>
            <button
              onClick={() => setSelectedStatus('out_of_stock')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedStatus === 'out_of_stock'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'bg-[#0b111e] text-slate-400 border border-[#1e2a42] hover:text-white'
              }`}
            >
              Esgotados ({inventoryMetrics.outOfStock})
            </button>
          </div>
        </div>

        {/* Material Filter Chips */}
        <div className="flex items-center gap-2 pt-1 border-t border-[#1e2a42]/50 overflow-x-auto text-xs">
          <span className="text-[11px] font-bold uppercase text-slate-500 shrink-0">Material:</span>
          {materialOptions.map(mat => (
            <button
              key={mat}
              onClick={() => setSelectedMaterial(mat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                selectedMaterial === mat
                  ? 'bg-slate-200 text-slate-900 font-bold'
                  : 'bg-[#0b111e] text-slate-400 hover:text-slate-200 border border-[#1e2a42]'
              }`}
            >
              {mat}
            </button>
          ))}
        </div>
      </div>

      {/* Spool Cards Grid matching Reference 2 */}
      {filteredFilaments.length === 0 ? (
        <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mx-auto mb-3">
            <Search className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Nenhum carretel encontrado</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            Tente mudar os termos da busca ou os filtros de material e status de estoque.
          </p>
          <button
            onClick={() => { setSearchTerm(''); setSelectedMaterial('Todos'); setSelectedStatus('Todos'); }}
            className="px-4 py-2 rounded-xl bg-[#0b111e] border border-[#1e2a42] hover:bg-[#1a263d] text-xs font-semibold text-slate-300 transition-colors"
          >
            Limpar Filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFilaments.map(filament => {
            const nominalWeight = filament.weight || 1000;
            const remaining = Math.max(0, filament.remainingWeight || 0);
            const percentage = nominalWeight > 0 ? (remaining / nominalWeight) * 100 : 0;
            const isLowStock = percentage <= 20 && remaining > 0;
            const isDepleted = remaining <= 0;
            const spoolCurrentValue = nominalWeight > 0 ? (filament.pricePaid / nominalWeight) * remaining : 0;
            const cardColor = resolveColorHex(filament.colorHex, filament.colorName);

            return (
              <div 
                key={filament.id} 
                className="bg-[#121927] border border-[#1e2a42] hover:border-[#2a3c5d] rounded-2xl p-5 shadow-lg shadow-black/20 transition-all flex flex-col justify-between group relative overflow-hidden"
              >
                {/* Top Colored Accent Strip matching filament color */}
                <div 
                  className="absolute top-0 left-0 right-0 h-1 opacity-70 group-hover:opacity-100 transition-opacity" 
                  style={{ backgroundColor: cardColor }} 
                />

                <div>
                  {/* Card Header: Spool visual + Top badges */}
                  <div className="flex items-start justify-between gap-3 mb-4 pt-1">
                    {/* Realistic 3D Spool Graphic with individual color */}
                    <SpoolVisual 
                      colorHex={filament.colorHex} 
                      colorName={filament.colorName} 
                      percentage={percentage} 
                      size={92} 
                    />

                    {/* Action buttons + Status Pill */}
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1 bg-[#0b111e] border border-[#1e2a42] p-1 rounded-xl">
                        <button 
                          onClick={() => { setEditingFilament(filament); setIsModalOpen(true); }} 
                          className="p-1.5 text-slate-400 hover:text-cyan-400 rounded-lg hover:bg-[#1e2a42] transition-colors"
                          title="Editar carretel"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({
                              id: filament.id,
                              name: `${filament.brand} ${filament.material} - ${filament.colorName} (${remaining}g restantes)`
                            });
                          }} 
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                          title="Excluir carretel"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Status Badge */}
                      {isDepleted ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          ESGOTADO
                        </span>
                      ) : isLowStock ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          LOW STOCK
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          IN STOCK
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Brand & Material Titles */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[#0b111e] text-cyan-400 border border-[#1e2a42]">
                        {filament.material}
                      </span>
                      <h3 className="font-bold text-base text-white truncate">
                        {filament.brand}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span 
                        className="w-3 h-3 rounded-full border border-white/20 shrink-0 shadow-sm" 
                        style={{ backgroundColor: cardColor }} 
                      />
                      <span className="truncate">{filament.colorName}</span>
                    </div>
                  </div>
                </div>

                {/* Progress bar and Stock balance details */}
                <div className="space-y-2 pt-2 border-t border-[#1e2a42]/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-slate-400">Restante</span>
                    <span className="font-mono font-bold text-slate-100">
                      {Math.round(remaining)}g <span className="text-slate-500 font-normal">/ {nominalWeight}g</span>
                    </span>
                  </div>

                  {/* Color-accented Progress Bar */}
                  <div className="w-full bg-[#0b111e] h-2 rounded-full overflow-hidden border border-[#1e2a42]/40">
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ 
                        width: `${Math.min(100, Math.max(0, percentage))}%`,
                        backgroundColor: isLowStock ? '#f59e0b' : isDepleted ? '#ef4444' : cardColor
                      }} 
                    />
                  </div>

                  {/* Bottom info: Percentage & Proportional Capital Value */}
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-500">
                      {Math.round(percentage)}% do carretel
                    </span>
                    <span className="font-mono font-bold text-cyan-400">
                      {formatCurrency(spoolCurrentValue)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Cadastrar / Editar Filamento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121927] border border-[#1e2a42] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-[#1e2a42] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Droplet className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {editingFilament?.id ? 'Editar Carretel' : 'Novo Carretel de Filamento'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Live Preview Spool Card in Modal */}
              <div className="bg-[#0b111e] border border-[#1e2a42] rounded-xl p-3.5 flex items-center gap-4">
                <SpoolVisual 
                  colorHex={editingFilament?.colorHex || '#10b981'} 
                  colorName={editingFilament?.colorName}
                  percentage={editingFilament?.weight ? ((editingFilament?.remainingWeight ?? editingFilament?.weight) / editingFilament.weight) * 100 : 100}
                  size={68} 
                />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Prévia do Carretel</p>
                  <p className="text-sm font-bold text-white truncate">
                    {editingFilament?.brand || 'Marca'} - {editingFilament?.material || 'PLA'}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {editingFilament?.colorName || 'Cor'} • {editingFilament?.weight || 1000}g
                  </p>
                </div>
              </div>

              {/* Brand and Material */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase">Marca</label>
                  <input
                    required
                    list="brands-list"
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Ex: Voolt3D"
                    value={editingFilament?.brand || ''} 
                    onChange={e => setEditingFilament(prev => ({ ...prev!, brand: e.target.value }))}
                  />
                  <datalist id="brands-list">
                    {(settings.filamentBrands || []).map(b => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase">Material</label>
                  <select 
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    value={editingFilament?.material || 'PLA'} 
                    onChange={e => setEditingFilament(prev => ({ ...prev!, material: e.target.value }))}
                  >
                    {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* Color name and Color Picker */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase">Nome da Cor</label>
                  <input 
                    required 
                    placeholder="Ex: Vermelho Rubi, Preto Fosco" 
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    value={editingFilament?.colorName || ''} 
                    onChange={e => setEditingFilament(prev => ({ ...prev!, colorName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase">Cor Visual (Hex)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      className="w-10 h-8 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                      value={editingFilament?.colorHex || '#10b981'} 
                      onChange={e => setEditingFilament(prev => ({ ...prev!, colorHex: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="flex-1 bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                      value={editingFilament?.colorHex || '#10b981'}
                      onChange={e => setEditingFilament(prev => ({ ...prev!, colorHex: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Quick Preset Colors Palette */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Paleta Rápida</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(p => (
                    <button
                      type="button"
                      key={p.hex}
                      onClick={() => setEditingFilament(prev => ({ 
                        ...prev!, 
                        colorHex: p.hex, 
                        colorName: prev?.colorName || p.name 
                      }))}
                      className="w-6 h-6 rounded-md border border-white/20 hover:scale-110 transition-transform"
                      style={{ backgroundColor: p.hex }}
                      title={p.name}
                    />
                  ))}
                </div>
              </div>

              {/* Weight Nominal, Remaining (if edit), and Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase">Peso Nominal (g)</label>
                  <input 
                    required 
                    type="number" 
                    min="1"
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    value={editingFilament?.weight ?? 1000} 
                    onChange={e => setEditingFilament(prev => ({ ...prev!, weight: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase">Preço Pago (R$)</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01" 
                    min="0"
                    className="w-full bg-[#0b111e] border border-[#1e2a42] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    value={editingFilament?.pricePaid ?? 0} 
                    onChange={e => setEditingFilament(prev => ({ ...prev!, pricePaid: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {editingFilament?.id && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase">
                    Peso Restante Atual (gramas)
                  </label>
                  <input 
                    required 
                    type="number" 
                    step="1"
                    min="0"
                    className="w-full bg-[#0b111e] border border-cyan-500/50 rounded-xl px-3.5 py-2 text-xs text-cyan-300 focus:outline-none focus:border-cyan-400 font-mono font-bold"
                    value={editingFilament?.remainingWeight ?? editingFilament?.weight ?? 0} 
                    onChange={e => setEditingFilament(prev => ({ ...prev!, remainingWeight: Number(e.target.value) }))}
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1e2a42]">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving} 
                  className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Carretel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Filamento */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        title="Excluir Carretel de Filamento"
        itemName={deleteTarget?.name}
        description="Deseja realmente excluir este carretel permanentemente do seu estoque? Esta ação não pode ser desfeita."
        confirmText="Sim, Excluir Carretel"
        isLoading={isDeleting}
        onConfirm={confirmDeleteFilament}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Filaments;
