
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
  setSettings: (settings: Settings) => Promise<boolean>;
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

/**
 * Sanitiza mensagens de erro, ocultando tokens, senhas, chaves de API e dados confidenciais.
 */
const sanitizeErrorMessage = (msg: unknown): string => {
  if (!msg) return 'Erro desconhecido';
  let text = typeof msg === 'string' ? msg : String((msg as any)?.message || msg);

  // Remove tokens JWT (ex: eyJ...)
  text = text.replace(/eyJ[a-zA-Z0-9_\-.]+/g, '[TOKEN_REMOVIDO]');
  // Remove tokens Bearer
  text = text.replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, 'Bearer [TOKEN_REMOVIDO]');
  // Remove parâmetros com senhas ou chaves
  text = text.replace(/(apikey|token|password|secret|key)=([^&\s]+)/gi, '$1=[REMOVIDO]');
  // Remove strings longas que possam ser credenciais privadas
  text = text.replace(/([a-zA-Z0-9_-]{45,})/g, '[DADO_SENSIVEL_REMOVIDO]');

  return text.trim();
};

interface TableFetchResult<T = any> {
  table: string;
  data: T[] | null;
  error: string | null;
  success: boolean;
}

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
        setSettingsState(DEFAULT_SETTINGS);
        setDbError(null);
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
    
    try {
      const fetchTable = async (table: string, orderCol?: string): Promise<TableFetchResult> => {
        try {
          let query = supabase.from(table).select('*').eq('user_id', user.id);
          if (orderCol) {
            query = query.order(orderCol, { ascending: table !== 'orders' && table !== 'parts' });
          }
          const { data, error } = await query;
          if (error) {
            const sanitized = sanitizeErrorMessage(error.message || `Código ${error.code || 'desconhecido'}`);
            console.warn(`Aviso na tabela "${table}":`, sanitized);
            let formattedMsg = `Tabela "${table}": ${sanitized}`;
            if (error.code === '42P01' || error.code === 'PGRST205') {
              formattedMsg = `Tabela "${table}" ausente no banco de dados`;
            } else if (error.code === 'PGRST204' || sanitized.toLowerCase().includes('column') || sanitized.toLowerCase().includes('coluna')) {
              formattedMsg = `Coluna ausente na tabela "${table}": ${sanitized}`;
            }
            return { table, data: null, error: formattedMsg, success: false };
          }
          return { table, data: data || [], error: null, success: true };
        } catch (err: any) {
          const sanitized = sanitizeErrorMessage(err?.message || 'Falha de conexão');
          console.error(`Exceção ao consultar tabela "${table}":`, sanitized);
          return { table, data: null, error: `Falha de conexão na tabela "${table}": ${sanitized}`, success: false };
        }
      };

      const [partsRes, customersRes, ordersRes, filamentsRes, printersRes] = await Promise.all([
        fetchTable('parts', 'createdAt'),
        fetchTable('customers', 'name'),
        fetchTable('orders', 'createdAt'),
        fetchTable('filaments', 'brand'),
        fetchTable('printers', 'brand')
      ]);

      // Preserva dados já carregados para tabelas cuja consulta falhou (nunca substitui por null ou [])
      if (partsRes.success && partsRes.data !== null) setPartsState(partsRes.data);
      if (customersRes.success && customersRes.data !== null) setCustomersState(customersRes.data);
      if (ordersRes.success && ordersRes.data !== null) setOrdersState(ordersRes.data);
      if (filamentsRes.success && filamentsRes.data !== null) setFilamentsState(filamentsRes.data);
      if (printersRes.success && printersRes.data !== null) setPrintersState(printersRes.data);

      // Consulta protegida de settings
      let settingsError: string | null = null;
      try {
        const { data: s, error: sError } = await supabase
          .from('settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (sError) {
          const sanitized = sanitizeErrorMessage(sError.message || `Código ${sError.code || 'desconhecido'}`);
          console.warn('Aviso na tabela "settings":', sanitized);
          if (sError.code === '42P01' || sError.code === 'PGRST205') {
            settingsError = 'Tabela "settings" ausente no banco de dados';
          } else if (sError.code === 'PGRST204' || sanitized.toLowerCase().includes('column') || sanitized.toLowerCase().includes('coluna')) {
            settingsError = `Coluna ausente na tabela "settings": ${sanitized}`;
          } else {
            settingsError = `Tabela "settings": ${sanitized}`;
          }
        } else if (s) {
          setSettingsState(s);
        }
      } catch (err: any) {
        const sanitized = sanitizeErrorMessage(err?.message || 'Falha de conexão');
        console.error('Exceção ao consultar settings:', sanitized);
        settingsError = `Falha de conexão na tabela "settings": ${sanitized}`;
      }

      // Consolidação centralizada de erros sem sobrescrever
      const collectedErrors: string[] = [];
      const failedTables: string[] = [];

      [partsRes, customersRes, ordersRes, filamentsRes, printersRes].forEach(res => {
        if (!res.success && res.error) {
          collectedErrors.push(res.error);
          failedTables.push(res.table);
        }
      });

      if (settingsError) {
        collectedErrors.push(settingsError);
        failedTables.push('settings');
      }

      if (collectedErrors.length === 0) {
        // Limpa o estado de erro somente quando uma atualização confirmar que não há mais erros
        setDbError(null);
      } else if (collectedErrors.length === 1) {
        setDbError(collectedErrors[0]);
      } else {
        // Mensagem consolidada detalhada sem omissão de tabelas falhas
        setDbError(`Erros de sincronização em ${collectedErrors.length} tabelas (${failedTables.join(', ')}): ${collectedErrors.join(' | ')}`);
      }
    } catch (error: any) {
      const sanitized = sanitizeErrorMessage(error?.message || 'Erro inesperado na sincronização');
      console.error('Erro ao buscar dados:', sanitized);
      setDbError(`Falha ao sincronizar dados: ${sanitized}`);
    } finally {
      setLoading(false);
    }
  };

  const setSettings = async (newSettings: Settings): Promise<boolean> => {
    if (!user) {
      setSettingsState(newSettings);
      return true;
    }

    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ ...newSettings, user_id: user.id });

      if (error) {
        const sanitized = sanitizeErrorMessage(error.message || `Código ${error.code || 'desconhecido'}`);
        console.error('Erro ao salvar configurações no Supabase:', sanitized);
        setDbError(`Falha ao salvar configurações: ${sanitized}`);
        // Preserva o estado anterior intacto e não simula sucesso falso
        return false;
      }

      // Gravado com sucesso no Supabase: reflete no estado local
      setSettingsState(newSettings);
      // Limpa erro caso fosse relativo a settings
      setDbError(prev => (prev && prev.includes('settings') ? null : prev));
      return true;
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err?.message || 'Falha de conexão');
      console.error('Exceção ao salvar configurações:', sanitized);
      setDbError(`Falha de conexão ao salvar configurações: ${sanitized}`);
      return false;
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
