
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Part, Customer, Order, Settings, User, Filament, Printer } from '../types';
import { supabase } from '../services/supabase';

interface AppContextType {
  parts: Part[];
  customers: Customer[];
  orders: Order[];
  filaments: Filament[];
  printers: Printer[];
  settings: Settings;
  user: User | null;
  loading: boolean;
  dbError: string | null;
  setParts: (parts: Part[]) => void;
  setCustomers: (customers: Customer[]) => void;
  setOrders: (orders: Order[]) => void;
  setFilaments: (filaments: Filament[]) => void;
  setPrinters: (printers: Printer[]) => void;
  setSettings: (settings: Settings) => void;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_SETTINGS: Settings = {
  defaultEnergyCost: 0.85,
  defaultFilamentCost: 120,
  defaultProfitMargin: 100,
  hourlyLaborRate: 25.00,
  hourlyMaintenanceCost: 1.50,
  currency: 'R$',
  filamentBrands: ['3D Prime', 'Creality', 'Voolt3D', 'GTMax'],
  categories: ['Chaveiro', 'Organizador', 'Decoração', 'Suporte', 'Action Figure', 'Outros']
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [parts, setPartsState] = useState<Part[]>([]);
  const [customers, setCustomersState] = useState<Customer[]>([]);
  const [orders, setOrdersState] = useState<Order[]>([]);
  const [filaments, setFilamentsState] = useState<Filament[]>([]);
  const [printers, setPrintersState] = useState<Printer[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! });
      } else {
        setUser(null);
        setPartsState([]);
        setCustomersState([]);
        setOrdersState([]);
        setFilamentsState([]);
        setPrintersState([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user]);

  const refreshData = async () => {
    if (!user) return;
    setDbError(null);
    
    try {
      const fetchTable = async (table: string, orderCol?: string) => {
        try {
          let query = supabase.from(table).select('*').eq('user_id', user.id);
          if (orderCol) query = query.order(orderCol, { ascending: table !== 'orders' && table !== 'parts' });
          const { data, error } = await query;
          if (error) {
            console.warn(`Aviso na tabela ${table}:`, error.message);
            if (error.code === '42P01') setDbError(`Tabela "${table}" ausente.`);
            else if (error.message.includes('column')) setDbError(`Coluna ausente em "${table}": ${error.message}`);
            return null;
          }
          return data || [];
        } catch (e) {
          return null;
        }
      };

      const results = await Promise.all([
        fetchTable('parts', 'createdAt'),
        fetchTable('customers', 'name'),
        fetchTable('orders', 'createdAt'),
        fetchTable('filaments', 'brand'),
        fetchTable('printers', 'brand')
      ]);

      if (results[0] !== null) setPartsState(results[0]);
      if (results[1] !== null) setCustomersState(results[1]);
      if (results[2] !== null) setOrdersState(results[2]);
      if (results[3] !== null) setFilamentsState(results[3]);
      if (results[4] !== null) setPrintersState(results[4]);

      const { data: s, error: sError } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (s && !sError) setSettingsState(s);
      
    } catch (error: any) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const setSettings = async (newSettings: Settings) => {
    setSettingsState(newSettings);
    if (user) {
      await supabase.from('settings').upsert({ ...newSettings, user_id: user.id });
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AppContext.Provider value={{ 
      parts, setParts: setPartsState, 
      customers, setCustomers: setCustomersState, 
      orders, setOrders: setOrdersState, 
      filaments, setFilaments: setFilamentsState,
      printers, setPrinters: setPrintersState,
      settings, setSettings, 
      user, setUser,
      loading, dbError,
      logout, refreshData
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
