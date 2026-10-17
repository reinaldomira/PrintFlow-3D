import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, Share, PlusSquare, X, Check, Copy } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'header' | 'menu' | 'card' | 'settings';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  variant = 'menu',
  className = '' 
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // If already installed and running standalone, do not show install prompt
  if (isInstalled) {
    if (variant === 'settings') {
      return (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <Check className="w-5 h-5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-sm">Aplicativo Instalado</div>
            <div className="text-xs text-zinc-400">Você está utilizando a versão de aplicativo direto no dispositivo.</div>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleAction = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  const handleCopyLink = () => {
    const currentUrl = window.location.origin + window.location.pathname;
    navigator.clipboard.writeText(currentUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <>
      {variant === 'header' && (
        <button
          onClick={handleAction}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95 ${className}`}
          title="Instalar PrintFlow no Celular"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Instalar App</span>
        </button>
      )}

      {variant === 'menu' && (
        <button
          onClick={handleAction}
          className={`w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all active:scale-95 ${className}`}
        >
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                Instalar no Celular
                <span className="text-[10px] bg-emerald-500 text-zinc-950 font-black px-1.5 py-0.5 rounded-full uppercase">PWA</span>
              </div>
              <div className="text-xs text-zinc-400">Acesse com 1 toque sem loja de apps</div>
            </div>
          </div>
          <Download className="w-5 h-5 text-emerald-400" />
        </button>
      )}

      {variant === 'card' && (
        <div className={`p-5 rounded-2xl bg-zinc-900 border border-emerald-500/30 relative overflow-hidden ${className}`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500 text-zinc-950 flex items-center justify-center font-bold flex-shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-base text-zinc-100 mb-1">Instalar PrintFlow no Celular</h3>
              <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                Instale direto pelo navegador em segundos. Atualizações automáticas em tempo real e sem precisar de APK!
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleAction}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg text-xs flex items-center gap-2 active:scale-95 transition"
                >
                  <Download className="w-4 h-4" />
                  Instalar Agora
                </button>
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg text-xs flex items-center gap-1.5 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Link Copiado!' : 'Copiar Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {variant === 'settings' && (
        <div className={`p-6 rounded-2xl bg-zinc-900 border border-zinc-800 ${className}`}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-zinc-100">Aplicativo para Celular (PWA)</h4>
                <p className="text-xs text-zinc-400">Instalação direta e sem complicação</p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              PRONTO
            </span>
          </div>

          <p className="text-xs text-zinc-400 mb-4">
            Abra este sistema no navegador do celular (Chrome ou Safari) para instalar na tela inicial com ícone próprio e tela cheia.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleAction}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" />
              {isInstallable ? 'Instalar no Dispositivo' : 'Como Instalar no Celular'}
            </button>
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl flex items-center gap-2 transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Link Copiado!' : 'Copiar Link do App'}
            </button>
          </div>
        </div>
      )}

      {/* Installation Instructions Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl text-zinc-100">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Instalar no Celular</h3>
                <p className="text-xs text-zinc-400">PrintFlow direto na sua tela inicial</p>
              </div>
            </div>

            {isIOS ? (
              <div className="space-y-4 mb-6">
                <p className="text-xs text-zinc-300">
                  No <strong>iPhone / iPad (Safari)</strong>, siga estes 2 passos rápidos:
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-800/60 border border-zinc-700/50">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Share className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <span className="font-bold text-white">1. Toque no botão Compartilhar</span>
                      <p className="text-zinc-400 mt-0.5">Localizado na barra inferior do Safari.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-800/60 border border-zinc-700/50">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <PlusSquare className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <span className="font-bold text-white">2. Selecione "Adicionar à Tela de Início"</span>
                      <p className="text-zinc-400 mt-0.5">Role o menu de opções para baixo e confirme.</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                <p className="text-xs text-zinc-300">
                  No <strong>Android (Google Chrome)</strong>:
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-800/60 border border-zinc-700/50">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Download className="w-4 h-4" />
                    </div>
                    <div className="text-xs">
                      <span className="font-bold text-white">Toque no menu (3 pontinhos)</span>
                      <p className="text-zinc-400 mt-0.5">Selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3 mb-5">
              <div className="truncate text-xs text-zinc-400 font-mono">
                {window.location.href}
              </div>
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-sm transition"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};
