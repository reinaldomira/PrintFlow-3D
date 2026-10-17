import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '../constants';
import { Menu, X, ChevronRight } from 'lucide-react';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Ícones principais que ficam sempre visíveis na barra inferior
  const primaryMobileItems = NAVIGATION_ITEMS.filter(item => 
    ['dashboard', 'catalog', 'orders', 'history'].includes(item.id)
  );

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 pb-20 md:pb-0 md:pl-64 text-zinc-100">
      {/* Sidebar for desktop */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-zinc-900 border-r border-zinc-800 p-6">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-zinc-950 font-bold text-xl">PF</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">PrintFlow</h1>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">3D Manager</span>
          </div>
        </div>
        
        <nav className="flex-1 space-y-1 overflow-y-auto pr-2 custom-scrollbar">
          {NAVIGATION_ITEMS.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                location.pathname === item.path 
                  ? 'bg-emerald-500/10 text-emerald-500 font-bold' 
                  : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/50'
              }`}
            >
              {item.icon}
              <span className="text-sm">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Top bar for mobile */}
      <header className="md:hidden flex items-center justify-between px-6 py-4 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 border-b border-zinc-900">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <span className="text-zinc-950 font-bold text-sm">PF</span>
          </div>
          <h1 className="font-bold">PrintFlow</h1>
        </div>
        <div className="text-[10px] bg-zinc-900 px-2 py-1 rounded border border-zinc-800 text-zinc-500 font-bold uppercase">
          v2.1
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md animate-in fade-in duration-300"
            onClick={toggleMenu}
          />
          
          {/* Menu Panel */}
          <div className="absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-[2.5rem] p-8 pb-12 animate-in slide-in-from-bottom duration-500 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black uppercase tracking-tighter text-emerald-500">Menu Principal</h2>
              <button 
                onClick={toggleMenu}
                className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 active:scale-90 transition-transform"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {NAVIGATION_ITEMS.map((item) => (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={toggleMenu}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all active:scale-95 ${
                    location.pathname === item.path 
                      ? 'bg-emerald-500 border-emerald-400 text-zinc-950' 
                      : 'bg-zinc-800/50 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <div className={location.pathname === item.path ? 'text-zinc-950' : 'text-emerald-500'}>
                      {item.icon}
                    </div>
                    <span className="text-xs font-bold">{item.label}</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${location.pathname === item.path ? 'opacity-50' : 'text-zinc-600'}`} />
                </Link>
              ))}
            </div>
            
            <p className="text-center text-zinc-600 text-[10px] font-bold mt-8 uppercase tracking-widest">
              PrintFlow • Gerenciamento 3D Profissional
            </p>
          </div>
        </div>
      )}

      {/* Bottom nav for mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 px-2 py-3 z-50 flex items-center justify-around">
        {primaryMobileItems.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            className={`flex flex-col items-center gap-1 min-w-[64px] transition-all ${
              location.pathname === item.path ? 'text-emerald-500 scale-110' : 'text-zinc-500'
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-bold">{item.label}</span>
          </Link>
        ))}
        
        {/* Special Menu Button */}
        <button
          onClick={toggleMenu}
          className={`flex flex-col items-center gap-1 min-w-[64px] transition-all ${
            isMobileMenuOpen ? 'text-emerald-500 scale-110' : 'text-zinc-500'
          }`}
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          <span className="text-[10px] font-bold">Mais</span>
        </button>
      </nav>
    </div>
  );
};

export default Layout;
