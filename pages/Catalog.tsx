
import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Part, PartRecipeItem } from '../types';
import { supabase } from '../services/supabase';
import { MATERIALS, calculatePartCosts, formatCurrency } from '../constants';
import { Plus, Search, Trash2, Edit2, Upload, X, Layers, Image as ImageIcon, Loader2, PlusCircle, Camera } from 'lucide-react';

const Catalog: React.FC = () => {
  const { parts, settings, filaments, printers, user, refreshData } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingPart, setEditingPart] = useState<Partial<Part> | null>(null);

  const costs = useMemo(() => {
    if (!editingPart) return null;
    return calculatePartCosts(editingPart, filaments, printers, settings);
  }, [editingPart, filaments, printers, settings]);

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
        };
      };
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && user) {
      setIsSaving(true);
      try {
        const compressedBlob = await compressImage(file);
        const fileName = `${user.id}/${Date.now()}.jpg`;
        
        // USANDO O NOME EXATO DO SEU BUCKET: PARTS-IMAGES
        const { data, error } = await supabase.storage
          .from('PARTS-IMAGES')
          .upload(fileName, compressedBlob, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage.from('PARTS-IMAGES').getPublicUrl(data.path);
        updateField('imageUrl', publicUrl);
      } catch (err: any) {
        console.error('Erro upload:', err);
        alert('Erro no upload: ' + err.message);
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
      const payload: any = { 
        user_id: user.id,
        name: editingPart.name,
        category: editingPart.category || settings.categories[0],
        material: editingPart.material || 'PLA',
        weight: Number(editingPart.weight) || 0,
        printTime: Number(editingPart.printTime) || 0,
        wastePercent: Number(editingPart.wastePercent) || 5,
        profitMargin: Number(editingPart.profitMargin) || settings.defaultProfitMargin,
        recipe: editingPart.recipe || [],
        imageUrl: editingPart.imageUrl || null,
        updatedAt: new Date().toISOString()
      };

      let result;
      if (editingPart.id) {
        result = await supabase.from('parts').update(payload).eq('id', editingPart.id);
      } else {
        payload.createdAt = new Date().toISOString();
        result = await supabase.from('parts').insert([payload]);
      }

      if (result.error) throw result.error;

      await refreshData();
      setIsModalOpen(false);
      setEditingPart(null);
    } catch (err: any) {
      console.error('Erro salvar peça:', err);
      alert('Erro ao salvar: ' + (err.message || 'Erro desconhecido. Verifique o Script SQL.'));
    } finally {
      setIsSaving(false);
    }
  };

  const deletePart = async (id: string) => {
    if (!confirm('Excluir este modelo permanentemente?')) return;
    const { error } = await supabase.from('parts').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else refreshData();
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
    if (filaments.length === 0) return alert("Cadastre filamentos primeiro.");
    const currentRecipe = editingPart?.recipe || [];
    updateField('recipe', [...currentRecipe, { filamentId: filaments[0].id, grams: 0 }]);
  };

  const removeRecipeItem = (index: number) => {
    const currentRecipe = [...(editingPart?.recipe || [])];
    currentRecipe.splice(index, 1);
    const newTotalWeight = currentRecipe.reduce((sum, item) => sum + item.grams, 0);
    setEditingPart(prev => ({ ...prev!, recipe: currentRecipe, weight: newTotalWeight || prev?.weight || 0 }));
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Catálogo</h2>
          <p className="text-zinc-500">{parts.length} modelos</p>
        </div>
        <button 
          onClick={() => { 
            setEditingPart({ 
              name: '', 
              category: settings.categories[0], 
              material: 'PLA',
              weight: 0, 
              recipe: [], 
              printTime: 0, 
              wastePercent: 5,
              profitMargin: settings.defaultProfitMargin
            }); 
            setIsModalOpen(true); 
          }}
          className="bg-emerald-500 text-zinc-950 px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" /> Nova Peça
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input type="text" placeholder="Buscar no catálogo..." className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl outline-none"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {parts.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(part => (
          <div key={part.id} className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden group hover:border-emerald-500/50 transition-colors flex flex-col">
            <div className="aspect-square relative bg-zinc-800 overflow-hidden">
              {part.imageUrl ? (
                <img src={part.imageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-700"><ImageIcon className="w-10 h-10" /></div>
              )}
              <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                <button onClick={() => { setEditingPart(part); setIsModalOpen(true); }} className="p-2 bg-zinc-950/80 rounded-full text-zinc-100 hover:bg-emerald-500 hover:text-zinc-950"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => deletePart(part.id)} className="p-2 bg-zinc-950/80 rounded-full text-red-500 hover:bg-red-500 hover:text-white"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="p-4 flex-1 text-center sm:text-left">
              <h3 className="font-bold text-sm truncate text-zinc-200">{part.name}</h3>
              <div className="flex justify-between items-center mt-2 flex-col sm:flex-row gap-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500">{part.category}</span>
                <p className="text-emerald-500 font-black text-sm">{formatCurrency(calculatePartCosts(part, filaments, printers, settings).suggestedPrice)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-950/95 backdrop-blur-md">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] w-full max-w-3xl max-h-[95vh] overflow-y-auto custom-scrollbar shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-30">
              <h3 className="text-xl font-black uppercase tracking-tight">{editingPart?.id ? 'Editar Modelo' : 'Novo Modelo'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500 hover:text-white"><X /></button>
            </div>
            
            <form onSubmit={handleSavePart} className="p-6 space-y-6">
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
                    <PlusCircle className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>

                {(!editingPart?.recipe || editingPart.recipe.length === 0) ? (
                  <p className="text-zinc-600 text-[10px] font-bold uppercase text-center py-2 italic">Nenhum filamento vinculado.</p>
                ) : (
                  <div className="space-y-3">
                    {editingPart.recipe.map((item, idx) => (
                      <div key={idx} className="flex gap-2 bg-zinc-900/50 p-2 rounded-xl border border-zinc-800">
                        <select 
                          className="flex-1 bg-zinc-800 p-2 rounded-lg text-xs font-bold border-none outline-none min-w-0" 
                          value={item.filamentId} 
                          onChange={e => updateRecipeItem(idx, 'filamentId', e.target.value)}
                        >
                          {filaments.map(f => <option key={f.id} value={f.id}>{f.colorName} ({f.brand})</option>)}
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">Peso (g)</span>
                  <input type="number" className={`bg-transparent w-full text-lg font-black outline-none ${editingPart?.recipe?.length ? 'text-emerald-500' : 'text-zinc-100'}`} 
                    readOnly={editingPart?.recipe?.length! > 0} 
                    value={editingPart?.weight || 0} onChange={e => updateField('weight', Number(e.target.value))} />
                </div>
                <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">Tempo (h)</span>
                  <input type="number" step="0.1" className="bg-transparent w-full text-lg font-black outline-none" 
                    value={editingPart?.printTime || 0} onChange={e => updateField('printTime', Number(e.target.value))} />
                </div>
                <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">Margem %</span>
                  <input type="number" className="bg-transparent w-full text-lg font-black outline-none" 
                    value={editingPart?.profitMargin || 0} onChange={e => updateField('profitMargin', Number(e.target.value))} />
                </div>
                <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-800">
                  <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">Perda %</span>
                  <input type="number" className="bg-transparent w-full text-lg font-black outline-none" 
                    value={editingPart?.wastePercent || 0} onChange={e => updateField('wastePercent', Number(e.target.value))} />
                </div>
              </div>

              <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 space-y-3">
                <div className="flex justify-between items-center text-xs font-bold text-zinc-500">
                  <span>Custo Produção</span>
                  <span>{formatCurrency(costs?.totalCost || 0)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-zinc-800">
                  <span className="text-[10px] font-black uppercase text-zinc-300">Preço Sugerido</span>
                  <span className="text-2xl font-black text-emerald-500">{formatCurrency(costs?.suggestedPrice || 0)}</span>
                </div>
              </div>

              <button 
                type="submit" disabled={isSaving} 
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-black rounded-xl shadow-xl shadow-emerald-500/10 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="animate-spin mx-auto" /> : 'SALVAR NO BANCO'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Catalog;
