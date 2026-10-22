import React, { createContext, useContext, useState, useEffect } from 'react';
import { Part, Customer, Order, Settings, User, Filament, Printer, BusinessInfo } from '../types';
import { supabase } from '../services/supabase';
import { 
  SettingsSyncState, 
  DEFAULT_SETTINGS, 
  rowToSettings, 
  loadLocalSettings, 
  saveLocalSettings, 
  fetchRemoteSettings, 
  saveRemoteSettings, 
  sanitizeErrorMessage 
} from '../services/settingsService';

interface AppContextType {
  parts: Part[];
  customers: Customer[];
  orders: Order[];
  filaments: Filament[];
  printers: Printer[];
  settings: Settings;
  settingsSyncState: SettingsSyncState;
  settingsConflict: { remoteUpdatedAt: string; remoteVersion?: number; pendingSettings: Settings } | null;
  resolveConflict: (choice: 'keep_remote' | 'overwrite_remote') => Promise<void>;
  user: User | null;
  loading: boolean;
  dbError: string | null;
  setParts: (parts: Part[]) => void;
  setCustomers: (customers: Customer[]) => void;
  setOrders: (orders: Order[]) => void;
  setFilaments: (filaments: Filament[]) => void;
  setPrinters: (printers: Printer[]) => void;
  setSettings: (settings: Settings, options?: { force?: boolean; expectedVersion?: number }) => Promise<boolean>;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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
  const [settingsSyncState, setSettingsSyncState] = useState<SettingsSyncState>('synced');
  const [settingsConflict, setSettingsConflict] = useState<{ remoteUpdatedAt: string; remoteVersion?: number; pendingSettings: Settings } | null>(null);
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
        setSettingsSyncState('synced');
        setSettingsConflict(null);
        setDbError(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      refreshData();
    }

    const handleSyncOnVisible = () => {
      if (document.visibilityState === 'visible' && user) {
        refreshData();
      }
    };

    window.addEventListener('visibilitychange', handleSyncOnVisible);
    window.addEventListener('focus', handleSyncOnVisible);
    window.addEventListener('online', handleSyncOnVisible);

    return () => {
      window.removeEventListener('visibilitychange', handleSyncOnVisible);
      window.removeEventListener('focus', handleSyncOnVisible);
      window.removeEventListener('online', handleSyncOnVisible);
    };
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

      // Consulta protegida de settings usando settingsService
      let settingsError: string | null = null;
      try {
        const localCache = loadLocalSettings(user.id);
        const fallback = localCache ? localCache.settings : DEFAULT_SETTINGS;

        const { data: remoteData, error: sError } = await fetchRemoteSettings(user.id);

        if (sError) {
          console.warn('Aviso ao consultar settings no Supabase:', sError);
          settingsError = `Tabela "settings": ${sError}`;
          if (localCache) {
            setSettingsState(localCache.settings);
            setSettingsSyncState(localCache.hasPendingSync ? 'pending_local' : 'error');
          }
        } else if (remoteData) {
          const resolved = rowToSettings(remoteData, fallback);
          // Determina se a nuvem tem as colunas completas ou apenas as base
          const isFullCloud = ('business_info' in remoteData || 'businessInfo' in remoteData) &&
            ('hourly_labor_rate' in remoteData || 'hourlyLaborRate' in remoteData);
          setSettingsState(resolved);
          saveLocalSettings(user.id, resolved, !isFullCloud);
          setSettingsSyncState(isFullCloud ? 'synced' : 'pending_local');
          setSettingsConflict(null);
        } else {
          // Sem registro remoto ainda (primeiro acesso)
          if (localCache) {
            setSettingsState(localCache.settings);
            setSettingsSyncState('pending_local');
          } else {
            setSettingsState(DEFAULT_SETTINGS);
            setSettingsSyncState('pending_local');
          }
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

  const setSettings = async (
    newSettings: Settings, 
    options?: { force?: boolean; expectedVersion?: number }
  ): Promise<boolean> => {
    setSettingsSyncState('saving');

    // 1. Armazenamento local imediato (como cache/offline fallback isolado por usuário)
    if (user) {
      saveLocalSettings(user.id, newSettings, true);
    }

    if (!user) {
      setSettingsState(newSettings);
      setSettingsSyncState('pending_local');
      return true;
    }

    try {
      const result = await saveRemoteSettings(user.id, newSettings, options);

      if (result.conflict) {
        setSettingsConflict({
          remoteUpdatedAt: result.remoteUpdatedAt || new Date().toISOString(),
          remoteVersion: result.remoteVersion,
          pendingSettings: newSettings
        });
        setSettingsSyncState('pending_local');
        setDbError('Conflito de sincronização: este cadastro foi alterado em outro dispositivo.');
        return false;
      }

      setSettingsConflict(null);

      if (result.success) {
        setSettingsState(newSettings);
        if (result.cloudSyncedFull) {
          saveLocalSettings(user.id, newSettings, false);
          setSettingsSyncState('synced');
          setDbError(prev => (prev && (prev.includes('settings') || prev.includes('Configurações') || prev.includes('Conflito')) ? null : prev));
          return true;
        } else if (result.requiresMigration) {
          saveLocalSettings(user.id, newSettings, true);
          setSettingsSyncState('pending_local');
          setDbError('Custos básicos salvos no Supabase. Para sincronizar Dados Comerciais e Custos Horários entre computador e celular, execute o script SQL na aba Ajustes.');
          return true;
        }
      }

      saveLocalSettings(user.id, newSettings, true);
      setSettingsSyncState('error');
      setDbError(`Falha ao salvar configurações no Supabase: ${result.error || 'Erro desconhecido'}`);
      return false;
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err?.message || 'Falha de conexão');
      console.error('Exceção ao salvar configurações:', sanitized);
      saveLocalSettings(user.id, newSettings, true);
      setSettingsSyncState('error');
      setDbError(`Falha de conexão ao salvar configurações: ${sanitized}`);
      return false;
    }
  };

  const resolveConflict = async (choice: 'keep_remote' | 'overwrite_remote') => {
    if (choice === 'keep_remote') {
      setSettingsConflict(null);
      await refreshData();
    } else if (choice === 'overwrite_remote' && settingsConflict) {
      const toSave = settingsConflict.pendingSettings;
      const expectedVersion = settingsConflict.remoteVersion;
      const cachedConflict = { ...settingsConflict };
      
      const ok = await setSettings(toSave, { force: true, expectedVersion });
      if (ok) {
        setSettingsConflict(null);
      } else {
        // Se a sobrescrita foi rejeitada (ex: versão remota mudou de novo ou erro), não limpa o conflito
        setSettingsConflict(prev => prev || cachedConflict);
      }
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSettingsConflict(null);
    setSettingsSyncState('synced');
  };

  return (
    <AppContext.Provider value={{ 
      parts, setParts: setPartsState, 
      customers, setCustomers: setCustomersState, 
      orders, setOrders: setOrdersState, 
      filaments, setFilaments: setFilamentsState,
      printers, setPrinters: setPrintersState,
      settings, setSettings, 
      settingsSyncState,
      settingsConflict,
      resolveConflict,
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
