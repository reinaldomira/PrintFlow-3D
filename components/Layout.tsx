import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '../constants';
import { Menu, X, ChevronRight, Crown, Layers } from 'lucide-react';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Main items always in bottom nav for mobile
  const primaryMobileItems = NAVIGATION_ITEMS.filter(item => 
    ['dashboard', 'catalog', 'orders', 'history'].includes(item.id)
  );

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <div className="flex flex-col min-h-screen bg-[#0c1322] pb-20 md:pb-0 md:pl-64 text-slate-100">
      {/* Sidebar for desktop */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-[#0f172a] border-r border-[#1e293b] p-5 z-40">
        {/* Brand Lockup matching reference image */}
        <div className="flex flex-col items-center text-center pb-6 border-b border-[#1e293b]/70 mb-5">
          <div className="relative mb-2">
            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-600/30 to-cyan-400/10 border-2 border-cyan-400/80 flex items-center justify-center shadow-lg shadow-cyan-500/10">
              <span className="text-cyan-400 font-black text-2xl font-mono tracking-tighter">3</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold tracking-wider">
            <Crown className="w-3 h-3" />
            <span>PLANO PRO</span>
          </div>
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

        {/* Footer info in sidebar */}
        <div className="pt-4 border-t border-[#1e293b]/70 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>PrintFlow v2.4</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
        </div>
      </aside>

      {/* Top bar for mobile */}
      <header className="md:hidden flex items-center justify-between px-5 py-3.5 bg-[#0f172a]/90 backdrop-blur-md sticky top-0 z-40 border-b border-[#1e293b]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400/80 flex items-center justify-center text-cyan-400 font-bold text-sm">
            3
          </div>
          <div>
            <h1 className="font-bold text-sm text-white">PrintFlow</h1>
            <p className="text-[10px] text-cyan-400 font-medium">3D Manager</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
          <Crown className="w-2.5 h-2.5" />
          <span>PRO</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
            onClick={toggleMenu}
          />
          
          {/* Menu Panel */}
          <div className="absolute bottom-0 left-0 right-0 bg-[#0f172a] border-t border-[#1e293b] rounded-t-[2rem] p-6 pb-12 animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold uppercase tracking-wider text-cyan-400">Menu Principal</span>
              </div>
              <button 
                onClick={toggleMenu}
                className="w-8 h-8 bg-[#131d31] border border-[#1e293b] rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {NAVIGATION_ITEMS.map((item) => (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={toggleMenu}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all active:scale-95 ${
                    location.pathname === item.path 
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300' 
                      : 'bg-[#131d31] border-[#1e2a42] text-slate-300'
                  }`}
                >
                  <div className="flex flex-col gap-1.5">
                    <div className={location.pathname === item.path ? 'text-cyan-400' : 'text-slate-400'}>
                      {item.icon}
                    </div>
                    <span className="text-xs font-semibold">{item.label}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 ${location.pathname === item.path ? 'text-cyan-400' : 'text-slate-600'}`} />
                </Link>
              ))}
            </div>
            
            <p className="text-center text-slate-500 text-[10px] font-semibold mt-6 uppercase tracking-widest">
              PrintFlow 3D • Sistema Profissional
            </p>
          </div>
        </div>
      )}

      {/* Bottom nav for mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0f172a]/95 backdrop-blur-xl border-t border-[#1e293b] px-3 py-2 z-50 flex items-center justify-around">
        {primaryMobileItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`flex flex-col items-center gap-1 min-w-[56px] transition-all ${
                isActive ? 'text-cyan-400 font-bold' : 'text-slate-400'
              }`}
            >
              <span className={isActive ? 'scale-110 transition-transform text-cyan-400' : ''}>
                {item.icon}
              </span>
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
        
        {/* Special Menu Button */}
        <button
          onClick={toggleMenu}
          className={`flex flex-col items-center gap-1 min-w-[56px] transition-all ${
            isMobileMenuOpen ? 'text-cyan-400' : 'text-slate-400'
          }`}
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          <span className="text-[10px]">Mais</span>
        </button>
      </nav>
    </div>
  );
};

export default Layout;
