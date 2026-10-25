import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '../constants';
import { Menu, X, ChevronRight, Crown, Zap } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { QuickQuoteModal } from './QuickQuoteModal';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isQuickQuoteOpen, setIsQuickQuoteOpen] = useState(false);

  // Close drawer automatically on route navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Handle ESC key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex flex-col min-h-screen bg-[#0c1322] pb-6 md:pb-0 md:pl-64 text-slate-100">
      {/* ======================================================== */}
      {/* 1. SIDEBAR FIXA PARA DESKTOP                             */}
      {/* ======================================================== */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-[#0f172a] border-r border-[#1e293b] p-5 z-40">
        {/* Brand Lockup */}
        <div className="flex flex-col items-center text-center pb-6 border-b border-[#1e293b]/70 mb-5">
          <div className="relative mb-2.5 group">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-cyan-400/50 shadow-xl shadow-cyan-500/20 bg-[#09090b] transition-transform group-hover:scale-105">
              <img 
                src="/logo.png" 
                alt="PrintFlow 3D" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0f172a]" title="Online" />
          </div>
          
          <h2 className="text-sm font-black text-white tracking-wide flex items-center gap-1.5 mb-1.5">
            <span>PrintFlow</span>
            <span className="text-cyan-400 font-mono">3D</span>
          </h2>

          <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold tracking-wider">
            <Crown className="w-3 h-3" />
            <span>PLANO PRO</span>
          </div>
        </div>

        {/* Botão de Destaque: Orçamento Flash WhatsApp */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setIsQuickQuoteOpen(true)}
            className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500/15 via-zinc-800/80 to-cyan-500/15 hover:from-emerald-500/25 hover:to-cyan-500/25 border border-emerald-500/40 hover:border-emerald-400 text-white font-bold text-xs flex items-center justify-between shadow-md transition-all active:scale-95 group"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Zap className="w-3.5 h-3.5 fill-emerald-400" />
              </div>
              <span className="font-black text-xs text-emerald-300">Orçamento Flash</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
              Whats
            </span>
          </button>
        </div>
        
        {/* Nav Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
          {NAVIGATION_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.id}
                to={item.path}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive 
                    ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold shadow-sm' 
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#131d31]'
                }`}
              >
                <span className={isActive ? 'text-cyan-400' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile App Install in Sidebar */}
        <div className="pt-3 pb-2 border-t border-[#1e293b]/60">
          <PWAInstallButton variant="sidebar" />
        </div>

        {/* Footer info in sidebar */}
        <div className="pt-3 border-t border-[#1e293b]/70 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>PrintFlow v2.4</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. CABEÇALHO SUPERIOR PARA CELULAR COM BOTÃO HAMBÚRGUER  */}
      {/* ======================================================== */}
      <header className="md:hidden flex items-center justify-between px-3.5 py-2.5 bg-[#0f172a]/95 backdrop-blur-md sticky top-0 z-40 border-b border-[#1e293b]">
        {/* Botão Hambúrguer + Logo + Nome */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleMenu}
            aria-label="Abrir menu de navegação lateral"
            className="w-10 h-10 rounded-xl bg-[#131d31] hover:bg-[#1a263d] active:scale-90 border border-[#1e2a42] text-slate-200 hover:text-cyan-400 flex items-center justify-center transition-all shadow-sm"
          >
            <Menu className="w-5 h-5 text-cyan-400" />
          </button>

          <Link to="/" className="flex items-center gap-2 active:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-xl overflow-hidden border border-cyan-400/50 shadow-md shadow-cyan-500/20 bg-[#09090b] flex-shrink-0">
              <img 
                src="/logo.png" 
                alt="PrintFlow 3D" 
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-1 leading-tight">
                <span className="font-black text-sm text-white tracking-tight">PrintFlow</span>
                <span className="text-[11px] font-black text-cyan-400 font-mono">3D</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium leading-none">Gestão 3D</p>
            </div>
          </Link>
        </div>

        {/* Ações Rápidas na Direita */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsQuickQuoteOpen(true)}
            className="h-8 px-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-1 font-bold text-xs active:scale-95 transition-all shadow-sm"
            title="Orçamento Flash WhatsApp"
          >
            <Zap className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
            <span className="text-[11px]">Flash</span>
          </button>
          <PWAInstallButton variant="header" />
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
            <Crown className="w-2.5 h-2.5" />
            <span>PRO</span>
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 3. MENU LATERAL EXPANSÍVEL (SLIDE-OUT DRAWER) NO CELULAR */}
      {/* ======================================================== */}
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 z-50 md:hidden bg-black/80 backdrop-blur-sm transition-opacity duration-300 ${
          isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      {/* Gaveta Lateral Deslizante */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 md:hidden w-72 sm:w-80 bg-[#0f172a] border-r border-[#1e293b] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Cabeçalho da Gaveta Lateral */}
        <div className="p-4 border-b border-[#1e293b] flex items-center justify-between bg-[#0b111e]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-cyan-400/50 shadow-md shadow-cyan-500/20 bg-[#09090b] flex-shrink-0">
              <img 
                src="/logo.png" 
                alt="PrintFlow 3D" 
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm text-white">PrintFlow</span>
                <span className="text-xs font-black text-cyan-400 font-mono">3D</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold">
                <Crown className="w-2.5 h-2.5" />
                <span>PLANO PRO ATIVO</span>
              </div>
            </div>
          </div>

          <button 
            onClick={closeMenu}
            aria-label="Fechar menu lateral"
            className="w-9 h-9 rounded-xl bg-[#131d31] hover:bg-[#1a263d] border border-[#1e293b] flex items-center justify-center text-slate-400 hover:text-white active:scale-90 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de Navegação Vertical com Rolagem Suave */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          {/* Botão de Destaque no Drawer */}
          <div className="mb-2">
            <button
              type="button"
              onClick={() => {
                closeMenu();
                setIsQuickQuoteOpen(true);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500/20 via-zinc-800 to-cyan-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-between active:scale-95 transition-all shadow-md"
            >
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                <span>Simulador Flash WhatsApp</span>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-400" />
            </button>
          </div>

          <div className="px-3 py-1.5 text-[10px] font-black tracking-wider text-slate-500 uppercase flex items-center justify-between">
            <span>Módulos do Sistema</span>
            <span className="text-[9px] text-cyan-400/80 font-mono">{NAVIGATION_ITEMS.length} abas</span>
          </div>

          {NAVIGATION_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.id}
                to={item.path}
                onClick={closeMenu}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] ${
                  isActive 
                    ? 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-bold shadow-md shadow-cyan-500/10' 
                    : 'text-slate-300 hover:text-white hover:bg-[#131d31] border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`p-1 rounded-lg ${isActive ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 bg-[#131d31]'}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isActive ? 'text-cyan-400 translate-x-0.5' : 'text-slate-600'}`} />
              </Link>
            );
          })}

          {/* Banner de Instalação PWA no Menu Lateral */}
          <div className="pt-3 pb-1">
            <PWAInstallButton variant="menu" />
          </div>
        </div>

        {/* Rodapé da Gaveta */}
        <div className="p-3.5 border-t border-[#1e293b] bg-[#0b111e]/80 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            <span className="font-mono text-slate-300">Sistema Conectado</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">v2.4 Pro</span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. CONTEÚDO PRINCIPAL (TELA CHEIA NO MOBILE)             */}
      {/* ======================================================== */}
      <main className="flex-1 p-3.5 sm:p-5 md:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>

      {/* Modal Global: Simulador de Orçamento Flash WhatsApp */}
      <QuickQuoteModal
        isOpen={isQuickQuoteOpen}
        onClose={() => setIsQuickQuoteOpen(false)}
      />
    </div>
  );
};

export default Layout;

