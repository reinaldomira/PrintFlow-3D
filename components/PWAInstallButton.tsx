import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { 
  Download, Smartphone, Share, PlusSquare, X, Check, Copy, 
  QrCode, ExternalLink, Sparkles, CheckCircle2, RefreshCw, AlertCircle 
} from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'header' | 'menu' | 'card' | 'settings' | 'sidebar';
  className?: string;
}

export const PUBLIC_APP_URL = 'https://ais-pre-6o6ifmeubqtiwkgfnzqd2b-87898554493.us-east1.run.app';

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  variant = 'menu',
  className = '' 
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearedSuccess, setCacheClearedSuccess] = useState(false);
  const [activePlatformTab, setActivePlatformTab] = useState<'auto' | 'android' | 'ios'>(() => {
    if (typeof window !== 'undefined' && /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())) {
      return 'ios';
    }
    return 'android';
  });

  const getPublicLink = () => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin && origin.startsWith('http')) {
        return origin;
      }
    }
    return PUBLIC_APP_URL;
  };

  const handleAction = () => {
    setShowModal(true);
  };

  const handleCopyLink = () => {
    const url = getPublicLink();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleShare = async () => {
    const url = getPublicLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'PrintFlow 3D - Gestão de Impressão 3D',
          text: 'Acesse e instale o PrintFlow 3D no seu celular:',
          url: url
        });
        return;
      } catch (e) {
        // Fallback to copy
      }
    }
    handleCopyLink();
  };

  const handleForceUpdateAndClearCache = async () => {
    setClearingCache(true);
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          try {
            registration.active?.postMessage({ type: 'CLEAR_ALL_CACHES' });
            await registration.unregister();
          } catch (e) {
            console.warn('Error unregistering sw:', e);
          }
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }
      setCacheClearedSuccess(true);
      setTimeout(() => {
        // Hard refresh to fetch canonical manifest and icons
        window.location.href = window.location.origin + '/?refresh=' + Date.now();
      }, 700);
    } catch (err) {
      console.error('Failed to reset cache:', err);
      window.location.reload();
    }
  };

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(getPublicLink())}&margin=4`;

  // Se já estiver rodando standalone como PWA nativo
  if (isInstalled && variant !== 'settings') {
    return null;
  }

  return (
    <>
      {/* 1. Botão para Top Bar do Celular */}
      {variant === 'header' && (
        <button
          onClick={handleAction}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 font-bold text-[11px] shadow-sm transition-all active:scale-95 ${className}`}
          title="Instalar no Celular"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Instalar App</span>
        </button>
      )}

      {/* 2. Botão para Sidebar do Desktop */}
      {variant === 'sidebar' && (
        <button
          onClick={handleAction}
          className={`w-full group flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-[#121927] border border-emerald-500/30 text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/20 transition-all text-left shadow-sm ${className}`}
          title="Instalar PrintFlow no Celular"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform flex-shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-slate-200 group-hover:text-white flex items-center gap-1.5">
              <span>Acessar no Celular</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-[10px] text-slate-400 truncate">QR Code & Link Direto</div>
          </div>
        </button>
      )}

      {/* 3. Botão para Menu Gaveta Mobile */}
      {variant === 'menu' && (
        <button
          onClick={handleAction}
          className={`w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 to-cyan-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 transition-all active:scale-95 ${className}`}
        >
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                Instalar no Celular
                <span className="text-[10px] bg-emerald-500 text-slate-950 font-black px-1.5 py-0.5 rounded-full uppercase">PWA</span>
              </div>
              <div className="text-xs text-slate-400">Acesse com 1 toque sem loja de aplicativos</div>
            </div>
          </div>
          <Download className="w-5 h-5 text-emerald-400" />
        </button>
      )}

      {/* 4. Card Grande para o Dashboard ou Páginas */}
      {variant === 'card' && (
        <div className={`p-5 rounded-2xl bg-[#121927] border border-emerald-500/30 relative overflow-hidden shadow-lg ${className}`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-cyan-400/50 shadow-md shadow-cyan-500/20 bg-[#09090b] flex items-center justify-center flex-shrink-0">
                <img 
                  src="/logo.png" 
                  alt="PrintFlow 3D" 
                  className="w-full h-full object-cover" 
                />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                  PrintFlow no seu Smartphone
                  <span className="text-[10px] bg-emerald-500 text-slate-950 font-black px-1.5 py-0.5 rounded-full">PWA</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Instale na tela de início com ícone próprio e navegação sem barras do navegador.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleAction}
                className="flex-1 sm:flex-none px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 active:scale-95 transition"
              >
                <QrCode className="w-4 h-4" />
                <span>Instalar / QR Code</span>
              </button>
              <button
                onClick={handleCopyLink}
                className="px-3 py-2 bg-[#0b111e] hover:bg-[#1a263d] text-slate-300 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-[#1e2a42] transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado!' : 'Copiar Link'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Seção Dedicada na Página de Ajustes (Settings) */}
      {variant === 'settings' && (
        <div className={`p-6 rounded-3xl bg-[#121927] border border-emerald-500/30 shadow-lg ${className}`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[#1e2a42]/70 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  Instalação no Celular (Web App / PWA)
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    ATIVO
                  </span>
                </h4>
                <p className="text-xs text-slate-400">Acesse sua oficina de impressão 3D em qualquer lugar com sincronização em tempo real</p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={handleAction}
                className="flex-1 md:flex-none px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition active:scale-95"
              >
                <QrCode className="w-4 h-4" />
                <span>Ver QR Code & Passo a Passo</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Link Direto */}
            <div className="lg:col-span-2 space-y-3">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                Link do Aplicativo para Smartphone:
              </label>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#0b111e] border border-[#1e2a42]">
                <input 
                  type="text" 
                  readOnly 
                  value={getPublicLink()} 
                  className="bg-transparent text-xs text-cyan-400 font-mono flex-1 outline-none truncate select-all px-2"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition active:scale-95 flex-shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Link Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-[#0b111e] border border-[#1e2a42]">
                  <p className="text-xs font-bold text-slate-200 mb-1">Android (Google Chrome)</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Abra o link no Chrome, toque nos <strong>3 pontinhos ⋮</strong> e clique em <strong>"Adicionar à tela inicial"</strong> ou <strong>"Instalar aplicativo"</strong>.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0b111e] border border-[#1e2a42]">
                  <p className="text-xs font-bold text-slate-200 mb-1">iPhone / iPad (Safari)</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Abra o link no Safari, toque no botão <strong>Compartilhar ⎋</strong> e escolha <strong>"Adicionar à Tela de Início"</strong>.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleForceUpdateAndClearCache}
                  disabled={clearingCache}
                  className="px-3 py-2 rounded-xl bg-[#0b111e] hover:bg-[#1a263d] text-slate-300 border border-[#1e2a42] text-xs font-medium flex items-center gap-2 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${clearingCache ? 'animate-spin' : ''}`} />
                  <span>{clearingCache ? 'Atualizando cache...' : 'Sincronizar Novo Ícone / Limpar Cache'}</span>
                </button>
              </div>
            </div>

            {/* QR Code de Acesso Rápido */}
            <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-zinc-200 text-slate-950 text-center">
              <img 
                src={qrCodeUrl} 
                alt="QR Code PrintFlow" 
                className="w-32 h-32 object-contain rounded-lg"
              />
              <span className="text-[11px] font-bold text-slate-800 mt-2 flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-emerald-600" /> Aponte a câmera do celular
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal Interativo de Instalação no Celular */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#121927] border border-[#1e2a42] rounded-3xl p-6 sm:p-7 shadow-2xl text-slate-100 max-h-[95vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-[#0b111e] border border-[#1e2a42] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Cabeçalho com o Novo Ícone */}
            <div className="flex items-center gap-3.5 mb-5 pb-4 border-b border-[#1e2a42]">
              <div className="w-14 h-14 rounded-2xl overflow-hidden border border-cyan-400/50 shadow-lg shadow-cyan-500/20 bg-[#09090b] flex items-center justify-center flex-shrink-0">
                <img 
                  src="/logo.png" 
                  alt="PrintFlow 3D" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h3 className="font-black text-lg text-white flex items-center gap-1.5">
                  <span>Instalar PrintFlow</span>
                  <span className="text-cyan-400 font-mono text-base">3D</span>
                </h3>
                <p className="text-xs text-slate-400">Novo ícone oficial neon e tela cheia standalone</p>
              </div>
            </div>

            {/* Botão de Instalação Direta se o navegador permitir */}
            {isInstallable && (
              <div className="mb-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                <div className="text-xs">
                  <p className="font-bold text-emerald-400">Instalação Direta Pronta!</p>
                  <p className="text-slate-300 text-[11px]">Seu navegador suporta instalação com 1 clique.</p>
                </div>
                <button
                  onClick={async () => {
                    await install();
                    setShowModal(false);
                  }}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md transition active:scale-95 flex-shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Instalar Agora</span>
                </button>
              </div>
            )}

            {/* QR Code para Escanear com a Câmera */}
            <div className="mb-5 p-4 rounded-2xl bg-gradient-to-b from-[#0b111e] to-[#121927] border border-[#1e2a42] flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <div className="p-2.5 bg-white rounded-xl shadow-md flex-shrink-0">
                <img 
                  src={qrCodeUrl}
                  alt="QR Code PrintFlow"
                  className="w-28 h-28 object-contain"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                  <Sparkles className="w-3 h-3" />
                  <span>ABRIR NO CELULAR</span>
                </div>
                <h4 className="text-sm font-bold text-white">Escaneie com a Câmera</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Aponte a câmera do celular para o QR Code para abrir o PrintFlow diretamente no navegador do seu smartphone.
                </p>
              </div>
            </div>

            {/* Link para Copiar / Compartilhar */}
            <div className="space-y-2 mb-5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Link Direto do App:
                </label>
                <span className="text-[10px] text-emerald-400 font-mono">Disponível</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-[#0b111e] border border-[#1e2a42]">
                <input 
                  type="text" 
                  readOnly 
                  value={getPublicLink()} 
                  className="bg-transparent text-xs text-cyan-400 font-mono flex-1 outline-none truncate select-all px-2"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition active:scale-95 flex-shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Seletor de Plataforma para Instruções */}
            <div className="space-y-3 mb-5">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0b111e] border border-[#1e2a42]">
                <button
                  onClick={() => setActivePlatformTab('android')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    activePlatformTab === 'android'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Passo a Passo Android (Chrome)
                </button>
                <button
                  onClick={() => setActivePlatformTab('ios')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    activePlatformTab === 'ios'
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Passo a Passo iPhone (Safari)
                </button>
              </div>

              {activePlatformTab === 'android' ? (
                <div className="space-y-3 p-3.5 rounded-2xl bg-[#0b111e] border border-[#1e2a42] text-xs">
                  {/* Alerta de Travamento WebAPK */}
                  <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-200 space-y-2">
                    <div className="font-bold flex items-center gap-1.5 text-amber-300">
                      <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span>Travou em "Instalando..." no celular? Faça isso:</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      O Android às vezes tenta gerar o pacote pela Play Store e fica na fila. Para instalar <strong>na hora sem travar</strong>:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 text-slate-200">
                      <li>Puxe a barra de notificações do celular e cancele o download do PrintFlow (ou force a parada do Chrome).</li>
                      <li>Toque nos <strong>3 pontinhos (⋮)</strong> no topo do Chrome.</li>
                      <li>Toque em <strong>"Adicionar à tela inicial"</strong> (e não "Instalar").</li>
                    </ol>
                    <p className="text-[10px] text-emerald-400 font-semibold pt-1">
                      ✨ Pronto! Ele cria o app na tela inicial com o ícone neon oficial e abre em tela cheia idêntico a um aplicativo nativo.
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center flex-shrink-0 text-[10px]">1</span>
                    <p className="text-slate-300">
                      Abra o link no <strong>Google Chrome</strong> no celular.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center flex-shrink-0 text-[10px]">2</span>
                    <p className="text-slate-300">
                      Toque nos <strong>3 pontinhos ⋮</strong> no canto superior direito do Chrome.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center flex-shrink-0 text-[10px]">3</span>
                    <p className="text-slate-300">
                      Selecione <strong>"Adicionar à tela inicial"</strong>.
                    </p>
                  </div>

                  <div className="pt-1 border-t border-[#1e2a42]/60">
                    <button
                      onClick={handleForceUpdateAndClearCache}
                      disabled={clearingCache}
                      className="w-full py-2 px-3 rounded-lg bg-[#121927] hover:bg-[#1a263d] text-slate-300 border border-[#1e2a42] font-medium text-xs flex items-center justify-center gap-2 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${clearingCache ? 'animate-spin' : ''}`} />
                      <span>{cacheClearedSuccess ? 'Cache Limpo! Recarregando...' : 'Sincronizar Novo Ícone / Limpar Cache'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 p-3.5 rounded-2xl bg-[#0b111e] border border-[#1e2a42] text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-black flex items-center justify-center flex-shrink-0 text-[10px]">1</span>
                    <p className="text-slate-300">Abra o link acima no navegador <strong>Safari</strong> do iPhone/iPad.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-black flex items-center justify-center flex-shrink-0 text-[10px]">2</span>
                    <p className="text-slate-300">Toque no botão <strong>Compartilhar ⎋</strong> na barra inferior do Safari.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-black flex items-center justify-center flex-shrink-0 text-[10px]">3</span>
                    <p className="text-slate-300">Role para baixo e selecione <strong>"Adicionar à Tela de Início ⊞"</strong>.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Botões do Rodapé */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleShare}
                className="flex-1 py-3 bg-[#1e2a42] hover:bg-[#2a3c5d] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"
              >
                <Share className="w-4 h-4 text-cyan-400" />
                <span>Compartilhar Link</span>
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAInstallButton;
