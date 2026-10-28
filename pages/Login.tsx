
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { 
  Mail, Lock, LogIn, UserPlus, Loader2, AlertCircle, 
  CheckCircle2, KeyRound, ArrowLeft, Sparkles, User
} from 'lucide-react';

type AuthMode = 'login' | 'register' | 'forgot_password';

const Login: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Carregar e-mail salvo ao iniciar
  useEffect(() => {
    const savedEmail = localStorage.getItem('printflow_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  const formatAuthError = (err: any): string => {
    if (!err) return 'Ocorreu um erro ao processar sua solicitação';
    const msg = String(err.message || err).toLowerCase();
    if (msg.includes('invalid login credentials')) {
      return 'E-mail ou senha incorretos. Verifique suas credenciais.';
    }
    if (msg.includes('user already registered') || msg.includes('already exists')) {
      return 'Este e-mail já está cadastrado. Faça login ou use a recuperação de senha.';
    }
    if (msg.includes('password should be at least')) {
      return 'A senha precisa ter pelo menos 6 caracteres.';
    }
    if (msg.includes('email not confirmed')) {
      return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada e spam.';
    }
    if (msg.includes('rate limit')) {
      return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.';
    }
    if (msg.includes('invalid email') || msg.includes('unable to validate email')) {
      return 'Por favor, informe um endereço de e-mail válido.';
    }
    if (msg.includes('failed to fetch') || msg.includes('network')) {
      return 'Falha de conexão com os servidores. Verifique sua conexão com a internet.';
    }
    return err.message || 'Erro ao processar solicitação.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ 
          email: cleanEmail, 
          password 
        });
        if (error) throw error;
        
        // Se login for bem sucedido, salvar ou remover o e-mail do localStorage
        if (rememberMe) {
          localStorage.setItem('printflow_remembered_email', cleanEmail);
        } else {
          localStorage.removeItem('printflow_remembered_email');
        }
      } else if (mode === 'register') {
        if (password.length < 6) {
          throw new Error('A senha deve ter pelo menos 6 caracteres.');
        }
        if (password !== confirmPassword) {
          throw new Error('As senhas digitadas não coincidem.');
        }

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              display_name: name.trim() || cleanEmail.split('@')[0]
            }
          }
        });

        if (error) throw error;

        if (rememberMe) {
          localStorage.setItem('printflow_remembered_email', cleanEmail);
        }

        if (data.session) {
          // Usuário autenticado imediatamente pelo Supabase
          setSuccessMessage('Conta criada com sucesso! Redirecionando...');
        } else if (data.user) {
          // Requer confirmação por e-mail no Supabase
          setSuccessMessage(
            'Conta cadastrada com sucesso! Enviamos um link de confirmação para o seu e-mail. Por favor, verifique sua caixa de entrada ou pasta de spam para ativar sua conta.'
          );
        }
      } else if (mode === 'forgot_password') {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
        });
        if (error) throw error;
        setSuccessMessage('Instruções de recuperação foram enviadas para o seu e-mail!');
      }
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-zinc-950">
      <div className="w-full max-w-md space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Cabeçalho / Logo */}
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

        {/* Card Principal */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Luz de fundo decorativa */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/10 blur-[80px] pointer-events-none" />

          {/* Abas Alternadoras: Entrar / Criar Conta (apenas se não estiver na recuperação de senha) */}
          {mode !== 'forgot_password' && (
            <div className="flex bg-zinc-800/80 p-1.5 rounded-2xl mb-6 border border-zinc-700/60">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'login'
                    ? 'bg-zinc-900 text-white shadow-md border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <LogIn className="w-4 h-4 text-cyan-400" />
                <span>Entrar</span>
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'register'
                    ? 'bg-zinc-900 text-emerald-400 shadow-md border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>Criar Conta</span>
              </button>
            </div>
          )}

          {/* Título de Recuperação de Senha */}
          {mode === 'forgot_password' && (
            <div className="mb-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white transition-all active:scale-95"
                title="Voltar ao Login"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-lg font-black text-white">Recuperar Senha</h2>
                <p className="text-xs text-zinc-400">Enviaremos um link de redefinição para o seu e-mail</p>
              </div>
            </div>
          )}

          {/* Alertas de Erro */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="leading-snug">{error}</p>
            </div>
          )}

          {/* Mensagem de Sucesso */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3">
              <div className="flex items-start gap-3 text-emerald-400 text-sm">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="leading-snug">{successMessage}</p>
              </div>
              {mode !== 'login' && (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full py-2.5 px-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-black transition-all"
                >
                  Ir para a tela de Login
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* Campo Nome (Apenas Cadastro) */}
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 ml-1">Seu Nome ou Oficina</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input 
                    type="text" 
                    placeholder="Ex: Carlos (Oficina 3D)"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-white text-sm"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Campo E-mail */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 ml-1">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input 
                  type="email" 
                  required
                  placeholder="seu@email.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-white text-sm"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Campo Senha (Login e Cadastro) */}
            {mode !== 'forgot_password' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-xs font-bold text-zinc-300">Senha</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot_password')}
                      className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input 
                    type="password" 
                    required
                    placeholder={mode === 'register' ? 'Mínimo de 6 caracteres' : '••••••••'}
                    minLength={mode === 'register' ? 6 : undefined}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-white text-sm"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Campo Confirmar Senha (Apenas Cadastro) */}
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 ml-1">Confirmar Senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input 
                    type="password" 
                    required
                    placeholder="Repita sua senha"
                    minLength={6}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-white text-sm"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Checkbox de Lembrar E-mail (Apenas Login) */}
            {mode === 'login' && (
              <div className="flex items-center justify-between px-1">
                <button 
                  type="button"
                  onClick={() => setRememberMe(!rememberMe)}
                  className="flex items-center gap-2 group cursor-pointer text-left"
                >
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                    rememberMe ? 'bg-emerald-500 border-emerald-500 shadow-md shadow-emerald-500/20' : 'border-zinc-700 bg-zinc-800'
                  }`}>
                    {rememberMe && <CheckCircle2 className="w-3.5 h-3.5 text-zinc-950" />}
                  </div>
                  <span className={`text-xs font-bold transition-colors ${rememberMe ? 'text-zinc-200' : 'text-zinc-500'}`}>
                    Lembrar meu e-mail
                  </span>
                </button>
              </div>
            )}

            {/* Botão de Envio Principal */}
            <button 
              type="submit"
              disabled={loading}
              className={`w-full py-4 text-zinc-950 font-black rounded-2xl text-base sm:text-lg shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 ${
                mode === 'register'
                  ? 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'
                  : mode === 'forgot_password'
                  ? 'bg-cyan-500 hover:bg-cyan-400 shadow-cyan-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'
              }`}
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : mode === 'register' ? (
                <>
                  <UserPlus className="w-5 h-5" />
                  CRIAR CONTA NO PRINTFLOW
                </>
              ) : mode === 'forgot_password' ? (
                <>
                  <KeyRound className="w-5 h-5" />
                  ENVIAR LINK DE RECUPERAÇÃO
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  ENTRAR NO PRINTFLOW
                </>
              )}
            </button>
          </form>

          {/* Dicas de Apoio no Rodapé do Card */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80 text-center">
            {mode === 'login' ? (
              <p className="text-xs text-zinc-400">
                Novo por aqui?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
                >
                  Criar uma conta gratuita
                </button>
              </p>
            ) : mode === 'register' ? (
              <p className="text-xs text-zinc-400">
                Já possui uma conta?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-4"
                >
                  Fazer login agora
                </button>
              </p>
            ) : (
              <p className="text-xs text-zinc-400">
                Lembrou da senha?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-4"
                >
                  Voltar ao login
                </button>
              </p>
            )}
          </div>
        </div>
        
        {/* Rodapé Informativo */}
        <div className="flex items-center justify-center gap-2 text-zinc-500 text-[11px] font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Gestão de Impressão 3D • Sincronizado na Nuvem</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
