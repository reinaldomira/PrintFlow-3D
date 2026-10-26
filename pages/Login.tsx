
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Mail, Lock, LogIn, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar e-mail salvo ao iniciar
  useEffect(() => {
    const savedEmail = localStorage.getItem('printflow_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      // Se login for bem sucedido, salvar ou remover o e-mail do localStorage
      if (rememberMe) {
        localStorage.setItem('printflow_remembered_email', email);
      } else {
        localStorage.removeItem('printflow_remembered_email');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar solicitação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-zinc-950">
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center">
          <div className="w-24 h-24 rounded-3xl overflow-hidden mx-auto mb-4 border-2 border-cyan-400/60 shadow-2xl shadow-cyan-500/25 bg-[#09090b]">
            <img 
              src="/logo.png" 
              alt="PrintFlow 3D" 
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-1 text-white">
            PrintFlow <span className="text-cyan-400 font-mono">3D</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium">Sua oficina de impressão 3D na Nuvem</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
          {/* Luz de fundo decorativa */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 blur-[80px] pointer-events-none" />

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-400 ml-1">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600" />
                <input 
                  type="email" 
                  required
                  placeholder="seu@email.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-12 pr-4 py-4 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-white"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-400 ml-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600" />
                <input 
                  type="password" 
                  required
                  placeholder="••••••••"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-12 pr-4 py-4 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-white"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            {/* Checkbox de Lembrar E-mail */}
            <div className="flex items-center justify-between px-1">
              <button 
                type="button"
                onClick={() => setRememberMe(!rememberMe)}
                className="flex items-center gap-2 group cursor-pointer"
              >
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                  rememberMe ? 'bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-zinc-700 bg-zinc-800'
                }`}>
                  {rememberMe && <CheckCircle2 className="w-4 h-4 text-zinc-950" />}
                </div>
                <span className={`text-sm font-bold transition-colors ${rememberMe ? 'text-zinc-200' : 'text-zinc-500'}`}>
                  Lembrar meu e-mail
                </span>
              </button>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-black rounded-2xl text-lg shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  ENTRAR NO PRINTFLOW
                </>
              )}
            </button>
          </form>
        </div>
        
        <p className="text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
          Sistema de Gestão 3D • Sincronizado
        </p>
      </div>
    </div>
  );
};

export default Login;
