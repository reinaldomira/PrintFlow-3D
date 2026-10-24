import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Part, PartRecipeItem, PartSupplyItem } from '../types';
import { supabase } from '../services/supabase';
import { formatCurrency, calculatePartCosts, MATERIALS } from '../constants';
import { 
  Plus, Search, Trash2, Edit2, Upload, X, Layers, Image as ImageIcon, 
  Loader2, PlusCircle, Camera, Monitor, Clock, Zap, CheckCircle2, AlertTriangle,
  PackageCheck, Sparkles, Boxes
} from 'lucide-react';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';

const Catalog: React.FC = () => {
  const { parts, setParts, settings, filaments, printers, supplies, user, refreshData } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingPart, setEditingPart] = useState<Partial<Part> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const costs = useMemo(() => {
    if (!editingPart) return null;
    return calculatePartCosts(editingPart, filaments, printers, settings, supplies);
  }, [editingPart, filaments, printers, settings, supplies]);

  // Alerta de proteção antes de recarregar caso haja peça sendo editada
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isModalOpen && editingPart?.name) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isModalOpen, editingPart?.name]);

  const compressImage = (file: File): Promise<{ blob: Blob; dataUrl: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const dataUrlOriginal = event.target?.result as string;
        const img = new Image();
        img.src = dataUrlOriginal;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const scaleSize = Math.min(1, MAX_WIDTH / img.width);
          canvas.width = img.width * scaleSize;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          canvas.toBlob((blob) => {
            resolve({ blob: blob || file, dataUrl: compressedDataUrl });
          }, 'image/jpeg', 0.82);
        };
      };
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && user) {
      setIsSaving(true);
      setImageNotice(null);
      try {
        const { blob: compressedBlob, dataUrl } = await compressImage(file);
        const fileName = `${user.id}/${Date.now()}.jpg`;
        
        let uploadedUrl: string | null = null;
        try {
          const { data, error } = await supabase.storage
            .from('PARTS-IMAGES')
            .upload(fileName, compressedBlob, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (!error && data?.path) {
            const { data: { publicUrl } } = supabase.storage.from('PARTS-IMAGES').getPublicUrl(data.path);
            uploadedUrl = publicUrl;
          }
        } catch (storageErr) {
          console.warn('Storage bucket indisponível, usando fallback seguro:', storageErr);
        }

        // Fallback: se o bucket não estiver configurado no Supabase, usa dataUrl otimizado
        if (uploadedUrl) {
          updateField('imageUrl', uploadedUrl);
        } else {
          updateField('imageUrl', dataUrl);
          setImageNotice('Foto salva no cadastro. Para salvar no Storage da nuvem, crie o bucket PARTS-IMAGES como público.');
        }
      } catch (err: any) {
        console.error('Erro processando foto:', err);
        setImageNotice('Erro ao carregar foto: ' + err.message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSavePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPart?.name || !user) return;
    setIsSaving(true);
    
    try {
      const calculated = calculatePartCosts(editingPart, filaments, printers, settings, supplies);
      const rawSupplies = editingPart.supplies || [];
      const rawUnits = Number(editingPart.unitsPerPrint);
      const unitsPerPrint = (!isNaN(rawUnits) && rawUnits >= 1) ? Math.floor(rawUnits) : 1;

      // Remove marcadores de fallback anteriores do array de filamentos
      const cleanRecipe = (editingPart.recipe || []).filter((r: any) => 
        !r._embeddedSupplies && !r._supplies && !r._metadata && !r._unitsPerPrint
      );

      const embeddedItems: any[] = [];
      if (rawSupplies.length > 0) {
        embeddedItems.push({ _embeddedSupplies: rawSupplies });
      }
      if (unitsPerPrint > 1) {
        embeddedItems.push({ _metadata: { unitsPerPrint } });
      }

      const payload: any = { 
        user_id: user.id,
        name: editingPart.name.trim(),
        category: editingPart.category || settings.categories[0],
        material: editingPart.material || 'PLA',
        weight: Number(editingPart.weight) || 0,
        printTime: Number(editingPart.printTime) || 0,
        postProcessingTime: Number(editingPart.postProcessingTime) || 0,
        printerId: editingPart.printerId || null,
        filamentCost: calculated.batchMaterialCost,
        energyCost: calculated.batchEnergyCost,
        wastePercent: Number(editingPart.wastePercent) || 5,
        profitMargin: Number(editingPart.profitMargin) || settings.defaultProfitMargin,
        recipe: embeddedItems.length > 0 ? [...cleanRecipe, ...embeddedItems] : cleanRecipe,
        imageUrl: editingPart.imageUrl || null,
        updatedAt: new Date().toISOString()
      };

      const fullPayload = {
        ...payload,
        supplies: rawSupplies,
        unitsPerPrint
      };

      const isColumnMissingError = (err: any) => {
        if (!err) return false;
        const msg = (err.message || '').toLowerCase();
        return (
          msg.includes('supplies') || 
          msg.includes('unitsperprint') || 
          msg.includes('units_per_print') || 
          msg.includes('column') || 
          msg.includes('schema cache') ||
          err.code === 'PGRST204' || 
          err.code === 'PGRST205' || 
          err.code === '42703'
        );
      };

      let savedId = editingPart.id;
      let finalResult;

      if (editingPart.id) {
        finalResult = await supabase.from('parts').update(fullPayload).eq('id', editingPart.id).select().single();
        if (finalResult.error && isColumnMissingError(finalResult.error)) {
          // Salva sem colunas ausentes no schema nativo; insumos e unitsPerPrint estão seguros no campo recipe embutido
          finalResult = await supabase.from('parts').update(payload).eq('id', editingPart.id).select().single();
        }
      } else {
        payload.createdAt = new Date().toISOString();
        fullPayload.createdAt = payload.createdAt;
        finalResult = await supabase.from('parts').insert([fullPayload]).select().single();
        if (finalResult.error && isColumnMissingError(finalResult.error)) {
          finalResult = await supabase.from('parts').insert([payload]).select().single();
        }
        if (finalResult.data?.id) {
          savedId = finalResult.data.id;
        }
      }

      if (finalResult.error) throw finalResult.error;

      // Salva no cache local de insumos e metadados por peça para acesso instantâneo
      if (savedId) {
        try {
          const suppKey = `printflow_part_supplies_${user.id}`;
          const storedSupp = localStorage.getItem(suppKey);
          const suppMap = storedSupp ? JSON.parse(storedSupp) : {};
          suppMap[savedId] = rawSupplies;
          localStorage.setItem(suppKey, JSON.stringify(suppMap));

          const metaKey = `printflow_part_metadata_${user.id}`;
          const storedMeta = localStorage.getItem(metaKey);
          const metaMap = storedMeta ? JSON.parse(storedMeta) : {};
          metaMap[savedId] = { unitsPerPrint };
          localStorage.setItem(metaKey, JSON.stringify(metaMap));
        } catch (e) {}
      }

      await refreshData();
      setIsModalOpen(false);
      setEditingPart(null);
      setImageNotice(null);
      setActionNotice({ type: 'success', message: 'Modelo salvo com sucesso!' });
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      console.error('Erro salvar peça:', err);
      setActionNotice({ type: 'error', message: 'Erro ao salvar: ' + (err.message || 'Erro desconhecido. Verifique o banco.') });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeletePart = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const idToDelete = deleteTarget.id;

    try {
      // Atualização otimista imediata para resposta ágil
      setParts(parts.filter(p => p.id !== idToDelete));
      
      // Limpa cache local de insumos e metadados da peça excluída
      try {
        if (user) {
          const suppKey = `printflow_part_supplies_${user.id}`;
          const storedSupp = localStorage.getItem(suppKey);
          if (storedSupp) {
            const suppMap = JSON.parse(storedSupp);
            delete suppMap[idToDelete];
            localStorage.setItem(suppKey, JSON.stringify(suppMap));
          }

          const metaKey = `printflow_part_metadata_${user.id}`;
          const storedMeta = localStorage.getItem(metaKey);
          if (storedMeta) {
            const metaMap = JSON.parse(storedMeta);
            delete metaMap[idToDelete];
            localStorage.setItem(metaKey, JSON.stringify(metaMap));
          }
        }
      } catch (e) {}

      const { error } = await supabase.from('parts').delete().eq('id', idToDelete);
      if (error) throw error;

      setActionNotice({ type: 'success', message: 'Modelo excluído do catálogo com sucesso!' });
      setTimeout(() => setActionNotice(null), 3000);
      setDeleteTarget(null);
      await refreshData();
    } catch (err: any) {
      setActionNotice({ type: 'error', message: 'Erro ao excluir modelo: ' + err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const updateField = (field: keyof Part, value: any) => {
    setEditingPart(prev => ({ ...prev!, [field]: value }));
  };

  const updateRecipeItem = (index: number, field: keyof PartRecipeItem, value: any) => {
    const currentRecipe = [...(editingPart?.recipe || [])];
    currentRecipe[index] = { ...currentRecipe[index], [field]: value };
    const newTotalWeight = currentRecipe.reduce((sum, item) => sum + item.grams, 0);
    setEditingPart(prev => ({ ...prev!, recipe: currentRecipe, weight: newTotalWeight }));
  };

  const addRecipeItem = () => {
    if (filaments.length === 0) {
      setActionNotice({ type: 'error', message: "Cadastre filamentos primeiro na aba Filamentos." });
      return;
    }
    const currentRecipe = editingPart?.recipe || [];
    updateField('recipe', [...currentRecipe, { filamentId: filaments[0].id, grams: 0 }]);
  };

  const removeRecipeItem = (index: number) => {
    const currentRecipe = [...(editingPart?.recipe || [])];
    currentRecipe.splice(index, 1);
    const newTotalWeight = currentRecipe.reduce((sum, item) => sum + item.grams, 0);
    setEditingPart(prev => ({ ...prev!, recipe: currentRecipe, weight: newTotalWeight || prev?.weight || 0 }));
  };

  const addSupplyItem = () => {
    if (supplies.length === 0) {
      setActionNotice({ type: 'error', message: "Cadastre insumos primeiro na aba Insumos (argolas, ímãs, botões, etc.)." });
      return;
    }
    const currentSupplies = editingPart?.supplies || [];
    updateField('supplies', [...currentSupplies, { supplyId: supplies[0].id, quantity: 1 }]);
  };

  const removeSupplyItem = (index: number) => {
    const currentSupplies = [...(editingPart?.supplies || [])];
    currentSupplies.splice(index, 1);
    updateField('supplies', currentSupplies);
  };

  const updateSupplyItem = (index: number, field: keyof PartSupplyItem, value: any) => {
    const currentSupplies = [...(editingPart?.supplies || [])];
    currentSupplies[index] = { ...currentSupplies[index], [field]: value };
    updateField('supplies', currentSupplies);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Catálogo</h2>
          <p className="text-zinc-500">{parts.length} modelos cadastrados</p>
        </div>
        <button 
          onClick={() => { 
            setEditingPart({ 
              name: '', 
              category: settings.categories[0], 
              material: 'PLA',
              weight: 0, 
              unitsPerPrint: 1,
              recipe: [], 
              supplies: [],
              printTime: 0, 
              postProcessingTime: 0,
              printerId: printers[0]?.id || '',
              wastePercent: 5,
              profitMargin: settings.defaultProfitMargin
            }); 
            setImageNotice(null);
            setIsModalOpen(true); 
          }}
          className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" /> Nova Peça
        </button>
      </div>

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
          <button onClick={() => setActionNotice(null)} className="text-zinc-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input type="text" placeholder="Buscar no catálogo..." className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl outline-none"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {parts.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(part => {
          const partCostInfo = calculatePartCosts(part, filaments, printers, settings, supplies);
          const selectedPrinter = printers.find(pr => pr.id === part.printerId);
          return (
            <div key={part.id} className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden group hover:border-emerald-500/50 transition-colors flex flex-col">
              <div className="aspect-square relative bg-zinc-800 overflow-hidden">
                {part.imageUrl ? (
                  <img src={part.imageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700"><ImageIcon className="w-10 h-10" /></div>
                )}
                {part.unitsPerPrint && part.unitsPerPrint > 1 && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-zinc-950/85 backdrop-blur-sm border border-emerald-500/40 text-[9px] font-black text-emerald-400 shadow-md">
                    {part.unitsPerPrint} un/mesa
                  </div>
                )}
                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all sm:translate-x-2 sm:group-hover:translate-x-0">
                  <button 
                    type="button"
                    onClick={(e) => { 
                      e.stopPropagation();
                      setEditingPart({ ...part, unitsPerPrint: part.unitsPerPrint || 1, supplies: part.supplies || [] }); 
                      setImageNotice(null); 
                      setIsModalOpen(true); 
                    }} 
                    className="p-2 bg-zinc-950/80 rounded-full text-zinc-100 hover:bg-emerald-500 hover:text-zinc-950 transition-colors shadow-md active:scale-95"
                    title="Editar modelo"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ id: part.id, name: part.name });
                    }} 
                    className="p-2 bg-zinc-950/80 rounded-full text-red-500 hover:bg-red-500 hover:text-white transition-colors shadow-md active:scale-95"
                    title="Excluir modelo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-4 flex-1 text-center sm:text-left flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm truncate text-zinc-200">{part.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">{part.category}</span>
                    {selectedPrinter && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                        {selectedPrinter.model}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-zinc-800/60 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500 font-medium">
                      {part.weight}g {part.unitsPerPrint && part.unitsPerPrint > 1 ? `(lote: ${part.unitsPerPrint}un)` : ''}
                    </span>
                    <span className="text-zinc-400 font-semibold" title="Custo unitário de fabricação">
                      Custo: {formatCurrency(partCostInfo.unitCost)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-zinc-500">Preço Sugerido</span>
                    <p className="text-emerald-500 font-black text-sm">{formatCurrency(partCostInfo.suggestedPrice)}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-950/95 backdrop-blur-md">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] w-full max-w-3xl max-h-[95vh] overflow-y-auto custom-scrollbar shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-30">
              <h3 className="text-xl font-black uppercase tracking-tight">{editingPart?.id ? 'Editar Modelo' : 'Novo Modelo'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500 hover:text-white"><X /></button>
            </div>
            
            <form onSubmit={handleSavePart} className="p-6 space-y-6">
              {imageNotice && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-400">
                  {imageNotice}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Foto Section */}
                <div 
                  className="aspect-square rounded-[1.5rem] border-4 border-dashed border-zinc-800 flex flex-col items-center justify-center relative cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all overflow-hidden group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {editingPart?.imageUrl ? (
                    <>
                      <img src={editingPart.imageUrl} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-zinc-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Upload className="text-white w-10 h-10" />
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-4">
                      {isSaving ? (
                        <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto" />
                      ) : (
                        <>
                          <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-3 text-zinc-500 group-hover:text-emerald-500 transition-colors">
                            <Camera className="w-8 h-8" />
                          </div>
                          <span className="text-[10px] uppercase font-black text-zinc-500">Tirar Foto ou Galeria</span>
                        </>
                      )}
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-zinc-500 mb-2 block">Nome da Peça</label>
                    <input required className="w-full bg-zinc-800 p-4 rounded-xl outline-none border border-zinc-700 font-bold focus:border-emerald-500"
                      value={editingPart?.name || ''} onChange={e => updateField('name', e.target.value)} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-500 mb-2 block">Categoria</label>
                      <select className="w-full bg-zinc-800 p-4 rounded-xl outline-none border border-zinc-700 font-bold text-sm"
                        value={editingPart?.category} onChange={e => updateField('category', e.target.value)}>
                        {settings.categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-500 mb-2 block">Material Base</label>
                      <select className="w-full bg-zinc-800 p-4 rounded-xl outline-none border border-zinc-700 font-bold text-sm"
                        value={editingPart?.material} onChange={e => updateField('material', e.target.value)}>
                        {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Impressora Vinculada */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-zinc-500 mb-2 flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-emerald-500" />
                      Impressora para Cálculo de Energia
                    </label>
                    <select 
                      className="w-full bg-zinc-800 p-4 rounded-xl outline-none border border-zinc-700 font-bold text-sm"
                      value={editingPart?.printerId || ''} 
                      onChange={e => updateField('printerId', e.target.value)}
                    >
                      <option value="">Padrão do Sistema (350W)</option>
                      {printers.map(printer => (
                        <option key={printer.id} value={printer.id}>
                          {printer.brand} {printer.model} ({printer.power}W)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Composition Section */}
              <div className="bg-zinc-800/30 rounded-2xl p-5 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-100">
                    <Layers className="w-4 h-4 text-emerald-500" />
                    <h4 className="font-black uppercase text-[10px] tracking-widest">Composição de Filamentos</h4>
                  </div>
                  <button type="button" onClick={addRecipeItem} className="text-emerald-500 font-bold text-[10px] uppercase hover:underline flex items-center gap-1.5">
                    <PlusCircle className="w-3.5 h-3.5" /> Adicionar Cor/Material
                  </button>
                </div>

                {(!editingPart?.recipe || editingPart.recipe.length === 0) ? (
                  <p className="text-zinc-600 text-[10px] font-bold uppercase text-center py-2 italic">
                    Nenhum filamento específico vinculado (calculado com preço padrão de R${settings.defaultFilamentCost}/kg).
                  </p>
                ) : (
                  <div className="space-y-3">
                    {editingPart.recipe.map((item, idx) => (
                      <div key={idx} className="flex gap-2 bg-zinc-900/50 p-2 rounded-xl border border-zinc-800">
                        <select 
                          className="flex-1 bg-zinc-800 p-2 rounded-lg text-xs font-bold border-none outline-none min-w-0" 
                          value={item.filamentId} 
                          onChange={e => updateRecipeItem(idx, 'filamentId', e.target.value)}
                        >
                          {filaments.map(f => <option key={f.id} value={f.id}>{f.colorName} ({f.brand} - {f.material})</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                          <input type="number" placeholder="g" className="w-14 bg-zinc-800 p-2 rounded-lg text-xs font-black border-none text-right outline-none" 
                            value={item.grams} onChange={e => updateRecipeItem(idx, 'grams', Number(e.target.value))} />
                          <span className="text-[10px] font-bold text-zinc-600">g</span>
                        </div>
                        <button type="button" onClick={() => removeRecipeItem(idx)} className="text-zinc-600 hover:text-red-500 p-1"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Seção de Insumos & Componentes Adicionais */}
              <div className="bg-zinc-800/30 rounded-2xl p-5 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-100">
                    <PackageCheck className="w-4 h-4 text-cyan-400" />
                    <h4 className="font-black uppercase text-[10px] tracking-widest">Insumos & Componentes Extras (Argolas, Ímãs, Botões, etc.)</h4>
                  </div>
                  <button 
                    type="button" 
                    onClick={addSupplyItem} 
                    className="text-cyan-400 font-bold text-[10px] uppercase hover:underline flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Adicionar Insumo
                  </button>
                </div>

                {(!editingPart?.supplies || editingPart.supplies.length === 0) ? (
                  <p className="text-zinc-600 text-[10px] font-bold uppercase text-center py-2 italic">
                    Nenhum insumo extra vinculado. Para chaveiros, botões clicker ou caixas com ímãs, adicione insumos para compor o custo real da peça.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {editingPart.supplies.map((item, idx) => {
                      const selectedSup = supplies.find(s => s.id === item.supplyId);
                      const unitCost = Number(selectedSup?.unitCost) || 0;
                      const itemTotal = unitCost * (Number(item.quantity) || 0);

                      return (
                        <div key={idx} className="flex flex-col sm:flex-row gap-2 bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-800 items-start sm:items-center">
                          <select 
                            className="flex-1 bg-zinc-800 p-2 rounded-lg text-xs font-bold border-none outline-none min-w-0 w-full sm:w-auto" 
                            value={item.supplyId} 
                            onChange={e => updateSupplyItem(idx, 'supplyId', e.target.value)}
                          >
                            {supplies.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.category}) • Custo: {formatCurrency(s.unitCost)}/un
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-zinc-500">Qtd:</span>
                              <input 
                                type="number" 
                                min="1" 
                                className="w-16 bg-zinc-800 p-2 rounded-lg text-xs font-black border-none text-right outline-none text-cyan-300" 
                                value={item.quantity} 
                                onChange={e => updateSupplyItem(idx, 'quantity', Math.max(1, Number(e.target.value)))} 
                              />
                              <span className="text-[10px] font-bold text-zinc-600">un</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-cyan-400 min-w-[70px] text-right">
                              {formatCurrency(itemTotal)}
                            </span>
                            <button 
                              type="button" 
                              onClick={() => removeSupplyItem(idx)} 
                              className="text-zinc-600 hover:text-red-500 p-1"
                              title="Remover insumo"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quantidade de Peças por Impressão (Mesa / Lote) */}
              <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 p-4 rounded-2xl border border-emerald-500/30 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Boxes className="w-5 h-5 text-emerald-400" />
                      <label className="text-sm font-black uppercase text-zinc-100 tracking-wide">
                        Quantidade de peças por impressão
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                        Lote / Mesa
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Quantas unidades idênticas saem nesta mesma impressão. O consumo de filamento e o tempo informados abaixo correspondem a todo este lote na mesa.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 bg-zinc-950/80 p-1.5 rounded-xl border border-zinc-800 self-start sm:self-auto">
                    <input 
                      type="number" 
                      min="1" 
                      step="1"
                      required
                      className="w-20 bg-zinc-900 text-emerald-400 font-black text-center text-lg py-1.5 px-2 rounded-lg outline-none border border-zinc-700 focus:border-emerald-500"
                      value={editingPart?.unitsPerPrint ?? 1} 
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        updateField('unitsPerPrint', isNaN(val) ? '' : Math.max(1, val));
                      }} 
                    />
                    <span className="text-xs font-bold text-zinc-400 pr-2">unidades</span>
                  </div>
                </div>
              </div>

              {/* Metricas de Custo */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">Peso Total Lote (g)</span>
                  <input type="number" className={`bg-transparent w-full text-lg font-black outline-none ${editingPart?.recipe?.length ? 'text-emerald-500' : 'text-zinc-100'}`} 
                    readOnly={editingPart?.recipe?.length! > 0} 
                    value={editingPart?.weight || 0} onChange={e => updateField('weight', Number(e.target.value))} />
                  <span className="text-[9px] text-zinc-500 block">Filamento total mesa</span>
                </div>
                <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">Impressão Lote (h)</span>
                  <input type="number" step="0.1" className="bg-transparent w-full text-lg font-black outline-none" 
                    value={editingPart?.printTime || 0} onChange={e => updateField('printTime', Number(e.target.value))} />
                  <span className="text-[9px] text-zinc-500 block">Tempo total fatiador</span>
                </div>
                <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-400" /> Mão de Obra (h)
                  </span>
                  <input type="number" step="0.1" placeholder="Ex: 0.5" className="bg-transparent w-full text-lg font-black outline-none text-emerald-400" 
                    value={editingPart?.postProcessingTime || 0} onChange={e => updateField('postProcessingTime', Number(e.target.value))} />
                  <span className="text-[9px] text-zinc-500 block">Pós-processamento lote</span>
                </div>
                <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">Margem Lucro %</span>
                  <input type="number" className="bg-transparent w-full text-lg font-black outline-none text-emerald-400" 
                    value={editingPart?.profitMargin || 0} onChange={e => updateField('profitMargin', Number(e.target.value))} />
                  <span className="text-[9px] text-zinc-500 block">Margem sobre custo</span>
                </div>
                <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-800 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">Perda / Falha %</span>
                  <input type="number" className="bg-transparent w-full text-lg font-black outline-none text-amber-400" 
                    value={editingPart?.wastePercent || 0} onChange={e => updateField('wastePercent', Number(e.target.value))} />
                  <span className="text-[9px] text-zinc-500 block">Risco filam./energia</span>
                </div>
              </div>

              {/* Detalhamento de Custos: DESTAQUE UNITÁRIO + RESUMO DO LOTE */}
              <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 space-y-4">
                {/* DESTAQUE PRINCIPAL: CUSTO UNITÁRIO DE FABRICAÇÃO E PREÇO UNITÁRIO */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/60 via-zinc-900 to-zinc-900 border-2 border-emerald-500/40 shadow-lg">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-emerald-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                        Valores por Unidade (1 Peça)
                      </span>
                    </div>
                    {(costs?.unitsPerPrint || 1) > 1 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        Lote de {costs?.unitsPerPrint} unidades na mesa
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Custo Unitário de Fabricação (MÁXIMO DESTAQUE) */}
                    <div className="bg-zinc-900/90 p-3.5 rounded-xl border border-zinc-700/60">
                      <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">
                        Custo Unitário de Fabricação
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-white">
                        {formatCurrency(costs?.unitTotalCost || 0)}
                      </div>
                      {(costs?.unitsPerPrint || 1) > 1 ? (
                        <div className="text-[10px] text-zinc-400 mt-1">
                          {formatCurrency(costs?.batchTotalCost || 0)} ÷ {costs?.unitsPerPrint} un
                        </div>
                      ) : (
                        <div className="text-[10px] text-zinc-500 mt-1">Custo de 1 unidade</div>
                      )}
                    </div>

                    {/* Preço de Venda Unitário Sugerido */}
                    <div className="bg-zinc-900/90 p-3.5 rounded-xl border border-emerald-500/30">
                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1">
                        Preço Sugerido por Unidade
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-emerald-400">
                        {formatCurrency(costs?.unitSuggestedPrice || 0)}
                      </div>
                      <div className="text-[10px] text-emerald-500/80 mt-1">
                        Margem de {editingPart?.profitMargin || 0}%
                      </div>
                    </div>

                    {/* Lucro Estimado por Unidade */}
                    <div className="bg-zinc-900/90 p-3.5 rounded-xl border border-zinc-700/60">
                      <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">
                        Lucro Estimado por Unidade
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-zinc-100">
                        {formatCurrency(costs?.unitProfit || 0)}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1">
                        {formatCurrency(costs?.unitSuggestedPrice || 0)} - {formatCurrency(costs?.unitTotalCost || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* RESUMO DO LOTE COMPLETO (MESA) */}
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                      <Boxes className="w-4 h-4 text-zinc-400" />
                      Resumo da Impressão Completa na Mesa ({costs?.unitsPerPrint || 1} {((costs?.unitsPerPrint || 1) === 1 ? 'peça' : 'peças')})
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      Filamento: {costs?.batchWeight || 0}g • Tempo: {costs?.batchPrintTime || 0}h
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                    <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[9px] uppercase font-bold text-zinc-500 block">Custo Total do Lote</span>
                      <span className="text-sm font-black text-zinc-200">{formatCurrency(costs?.batchTotalCost || 0)}</span>
                    </div>
                    <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[9px] uppercase font-bold text-zinc-500 block">Preço Total do Lote</span>
                      <span className="text-sm font-black text-emerald-400">{formatCurrency(costs?.batchSuggestedPrice || 0)}</span>
                    </div>
                    <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[9px] uppercase font-bold text-zinc-500 block">Lucro Total do Lote</span>
                      <span className="text-sm font-black text-zinc-200">{formatCurrency(costs?.batchProfit || 0)}</span>
                    </div>
                    <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80">
                      <span className="text-[9px] uppercase font-bold text-zinc-500 block">Perda/Risco Lote</span>
                      <span className="text-sm font-black text-amber-400">{formatCurrency(costs?.batchWasteCost || 0)}</span>
                    </div>
                  </div>

                  {/* Composição detalhada do custo do lote */}
                  <div className="pt-2 border-t border-zinc-800/60 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] text-zinc-400">
                    <div>Material: <span className="text-zinc-200 font-bold">{formatCurrency(costs?.batchMaterialCost || 0)}</span></div>
                    <div>Insumos: <span className="text-cyan-300 font-bold">{formatCurrency(costs?.batchSuppliesCost || 0)}</span></div>
                    <div>Energia: <span className="text-zinc-200 font-bold">{formatCurrency(costs?.batchEnergyCost || 0)}</span></div>
                    <div>Mão de Obra: <span className="text-zinc-200 font-bold">{formatCurrency(costs?.batchLaborCost || 0)}</span></div>
                    <div>Manutenção: <span className="text-zinc-200 font-bold">{formatCurrency(costs?.batchMaintenanceCost || 0)}</span></div>
                  </div>
                </div>
              </div>

              <button 
                type="submit" disabled={isSaving} 
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black rounded-xl shadow-xl shadow-emerald-500/10 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="animate-spin mx-auto" /> : 'SALVAR NO BANCO'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Modelo do Catálogo */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        title="Excluir Modelo do Catálogo"
        itemName={deleteTarget?.name}
        description="Deseja realmente excluir este modelo permanentemente do seu catálogo? Esta ação não pode ser desfeita."
        confirmText="Sim, Excluir Modelo"
        isLoading={isDeleting}
        onConfirm={confirmDeletePart}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Catalog;
