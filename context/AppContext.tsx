import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Part, Customer, Order, Settings, User, Filament, Printer, BusinessInfo, Supply, PrintFailure, CashExpense, PaymentMethod } from '../types';
import { supabase } from '../services/supabase';
import { 
  SettingsSyncState, 
  DEFAULT_SETTINGS, 
  rowToSettings, 
  loadLocalSettings, 
  saveLocalSettings, 
  fetchRemoteSettings, 
  saveRemoteSettings, 
  sanitizeErrorMessage,
  extractCarrierData,
  isNetworkError,
  isSchemaError
} from '../services/settingsService';

const isValidUUID = (id?: string | null): boolean => {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
};

const rowToFailure = (row: any): PrintFailure => ({
  id: row.id,
  printerId: row.printer_id || undefined,
  printerName: row.printer_name || 'Impressora',
  reason: row.reason || '',
  filamentId: row.filament_id || undefined,
  filamentName: row.filament_name || undefined,
  gramsLost: Number(row.grams_lost) || 0,
  printTimeHoursLost: Number(row.print_time_hours_lost) || 0,
  costLost: Number(row.cost_lost) || 0,
  date: row.failure_date || (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
  notes: row.notes || undefined
});

const failureToRow = (data: Omit<PrintFailure, 'id'>, userId: string) => ({
  user_id: userId,
  printer_id: isValidUUID(data.printerId) ? data.printerId : null,
  printer_name: data.printerName || 'Impressora',
  reason: data.reason || 'Outro',
  filament_id: isValidUUID(data.filamentId) ? data.filamentId : null,
  filament_name: data.filamentName || null,
  grams_lost: Number(data.gramsLost) || 0,
  print_time_hours_lost: Number(data.printTimeHoursLost) || 0,
  cost_lost: Number(data.costLost) || 0,
  failure_date: data.date || new Date().toISOString().split('T')[0],
  notes: data.notes || null
});

const rowToCashExpense = (row: any): CashExpense => ({
  id: row.id,
  description: row.description || '',
  amount: Number(row.amount) || 0,
  category: (row.category || 'outros') as CashExpense['category'],
  date: row.expense_date || (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
  notes: row.notes || undefined,
  createdAt: row.created_at || new Date().toISOString()
});

const cashExpenseToRow = (data: Omit<CashExpense, 'id' | 'createdAt'>, userId: string) => ({
  user_id: userId,
  description: data.description,
  amount: Number(data.amount) || 0,
  category: data.category || 'outros',
  expense_date: data.date || new Date().toISOString().split('T')[0],
  notes: data.notes || null
});

interface AppContextType {
  parts: Part[];
  customers: Customer[];
  orders: Order[];
  filaments: Filament[];
  printers: Printer[];
  supplies: Supply[];
  failures: PrintFailure[];
  addFailure: (data: Omit<PrintFailure, 'id'>) => Promise<boolean>;
  deleteFailure: (id: string) => Promise<boolean>;
  cashExpenses: CashExpense[];
  addCashExpense: (data: Omit<CashExpense, 'id' | 'createdAt'>) => Promise<boolean>;
  deleteCashExpense: (id: string) => Promise<boolean>;
  settings: Settings;
  settingsSyncState: SettingsSyncState;
  settingsConflict: { remoteUpdatedAt: string; remoteVersion?: number; pendingSettings: Settings } | null;
  resolveConflict: (choice: 'keep_remote' | 'overwrite_remote') => Promise<void>;
  user: User | null;
  loading: boolean;
  dbError: string | null;
  connectionError: string | null;
  isOnline: boolean;
  setParts: (parts: Part[]) => void;
  setCustomers: (customers: Customer[]) => void;
  setOrders: (orders: Order[]) => void;
  setFilaments: (filaments: Filament[]) => void;
  setPrinters: (printers: Printer[]) => void;
  setSupplies: (supplies: Supply[]) => void;
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
  isNetwork?: boolean;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [parts, setPartsState] = useState<Part[]>([]);
  const [customers, setCustomersState] = useState<Customer[]>([]);
  const [orders, setOrdersState] = useState<Order[]>([]);
  const [filaments, setFilamentsState] = useState<Filament[]>([]);
  const [printers, setPrintersState] = useState<Printer[]>([]);
  const [supplies, setSuppliesState] = useState<Supply[]>([]);
  const [failures, setFailuresState] = useState<PrintFailure[]>([]);
  const [cashExpenses, setCashExpensesState] = useState<CashExpense[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsSyncState, setSettingsSyncState] = useState<SettingsSyncState>('synced');
  const [settingsConflict, setSettingsConflict] = useState<{ remoteUpdatedAt: string; remoteVersion?: number; pendingSettings: Settings } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const isRefreshingRef = useRef(false);
  const lastRefreshTimeRef = useRef(0);
  const warnedMissingTablesRef = useRef<Set<string>>(new Set());
  const migratedFailuresRef = useRef(false);
  const migratedExpensesRef = useRef(false);
  const migratedPaymentStatusRef = useRef(false);

  const applyUser = (sessionUser: { id: string; email?: string } | null) => {
    setUser(prev => {
      if (!sessionUser) return null;
      if (prev && prev.id === sessionUser.id && prev.email === (sessionUser.email || '')) {
        return prev;
      }
      return { id: sessionUser.id, email: sessionUser.email || '' };
    });
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (user?.id) {
        refreshData();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setConnectionError('Dispositivo sem conexão com a internet. Exibindo dados locais seguros.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        applyUser(session.user);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        applyUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setPartsState([]);
        setCustomersState([]);
        setOrdersState([]);
        setFilamentsState([]);
        setPrintersState([]);
        setSuppliesState([]);
        setFailuresState([]);
        setCashExpensesState([]);
        setSettingsState(DEFAULT_SETTINGS);
        setSettingsSyncState('synced');
        setSettingsConflict(null);
        setDbError(null);
        setConnectionError(null);
        warnedMissingTablesRef.current.clear();
        migratedFailuresRef.current = false;
        migratedExpensesRef.current = false;
        migratedPaymentStatusRef.current = false;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    refreshData();

    // Inscrição em tempo real para sincronização instantânea de configurações entre celular e computador
    const settingsChannel = supabase
      .channel(`realtime:settings:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settings',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const updatedRow = payload.new as Record<string, any>;
            setSettingsState(prev => {
              const merged = rowToSettings(updatedRow, prev);
              saveLocalSettings(user.id, merged, false);
              return merged;
            });
            setSettingsSyncState('synced');
            setSettingsConflict(null);
          }
        }
      )
      .subscribe();

    const handleSyncOnVisible = () => {
      // Sincroniza ao retornar para a aba se passou mais de 45 segundos
      const elapsed = Date.now() - lastRefreshTimeRef.current;
      if (document.visibilityState === 'visible' && user?.id && elapsed > 45000) {
        refreshData();
      }
    };

    window.addEventListener('visibilitychange', handleSyncOnVisible);
    window.addEventListener('online', handleSyncOnVisible);

    return () => {
      supabase.removeChannel(settingsChannel);
      window.removeEventListener('visibilitychange', handleSyncOnVisible);
      window.removeEventListener('online', handleSyncOnVisible);
    };
  }, [user?.id]);

  const refreshData = async () => {
    if (!user) return;
    
    // Prevent duplicate concurrent requests hammering database
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    lastRefreshTimeRef.current = Date.now();
    
    try {
      const fetchTable = async (table: string, orderCol?: string, ascending?: boolean): Promise<TableFetchResult> => {
        const queryTable = async () => {
          let query = supabase.from(table).select('*').eq('user_id', user.id);
          if (orderCol) {
            const isAsc = typeof ascending === 'boolean'
              ? ascending
              : (table !== 'orders' && table !== 'parts' && table !== 'failures' && table !== 'cash_expenses');
            query = query.order(orderCol, { ascending: isAsc });
          }
          return await query;
        };

        try {
          let { data, error } = await queryTable();

          // Auto-retry uma vez se for falha transitória de rede / Failed to fetch
          if (error && isNetworkError(error.message)) {
            await new Promise(res => setTimeout(res, 600));
            const retryRes = await queryTable();
            data = retryRes.data;
            error = retryRes.error;
          }

          if (error) {
            const rawMsg = error.message || `Código ${error.code || 'desconhecido'}`;
            const sanitized = sanitizeErrorMessage(rawMsg);
            const isNet = isNetworkError(rawMsg);

            // Se for tabela opcional (supplies, failures ou cash_expenses), trata com segurança sem emitir warning agressivo
            if (table === 'supplies' || table === 'failures' || table === 'cash_expenses') {
              if (!warnedMissingTablesRef.current.has(table)) {
                console.warn(`Aviso na tabela opcional "${table}":`, sanitized);
                warnedMissingTablesRef.current.add(table);
              }
              return { table, data: null, error: null, success: false, isNetwork: isNet };
            }

            // Se for falha de rede/conectividade, categoriza claramente como isNetwork
            if (isNet) {
              if (!warnedMissingTablesRef.current.has(`${table}_net`)) {
                console.warn(`Aviso de conexão na tabela "${table}":`, sanitized);
                warnedMissingTablesRef.current.add(`${table}_net`);
              }
              return { 
                table, 
                data: null, 
                error: `Tabela "${table}": Conexão indisponível (${sanitized})`, 
                success: false, 
                isNetwork: true 
              };
            }

            // Erro real de schema no banco de dados
            if (!warnedMissingTablesRef.current.has(table)) {
              console.warn(`Aviso na tabela "${table}":`, sanitized);
              warnedMissingTablesRef.current.add(table);
            }
            let formattedMsg = `Tabela "${table}": ${sanitized}`;
            if (error.code === '42P01' || error.code === 'PGRST205' || sanitized.includes('schema cache')) {
              formattedMsg = `Tabela "${table}" ausente no banco de dados`;
            } else if (error.code === 'PGRST204' || error.code === '42703' || sanitized.toLowerCase().includes('column') || sanitized.toLowerCase().includes('coluna')) {
              formattedMsg = `Coluna ausente na tabela "${table}": ${sanitized}`;
            }
            return { table, data: null, error: formattedMsg, success: false, isNetwork: false };
          }
          // Table exists and query succeeded
          warnedMissingTablesRef.current.delete(table);
          warnedMissingTablesRef.current.delete(`${table}_net`);
          return { table, data: data || [], error: null, success: true, isNetwork: false };
        } catch (err: any) {
          const rawMsg = err?.message || 'Falha de conexão';
          const sanitized = sanitizeErrorMessage(rawMsg);
          const isNet = isNetworkError(rawMsg);
          console.error(`Exceção ao consultar tabela "${table}":`, sanitized);
          return { 
            table, 
            data: null, 
            error: isNet 
              ? `Tabela "${table}": Conexão indisponível (${sanitized})` 
              : `Falha de conexão na tabela "${table}": ${sanitized}`, 
            success: false, 
            isNetwork: isNet 
          };
        }
      };

      const [partsRes, customersRes, ordersRes, filamentsRes, printersRes, suppliesRes, failuresRes, cashExpensesRes] = await Promise.all([
        fetchTable('parts', 'createdAt'),
        fetchTable('customers', 'name'),
        fetchTable('orders', 'createdAt'),
        fetchTable('filaments', 'brand'),
        fetchTable('printers', 'brand'),
        fetchTable('supplies', 'name'),
        fetchTable('failures', 'created_at', false),
        fetchTable('cash_expenses', 'created_at', false)
      ]);

      // Preserva e normaliza dados de peças, garantindo que insumos vinculados nunca sejam perdidos
      if (partsRes.success && partsRes.data !== null) {
        let cachedPartSupplies: Record<string, any[]> = {};
        let cachedPartMetadata: Record<string, any> = {};
        try {
          const storedSupplies = localStorage.getItem(`printflow_part_supplies_${user.id}`);
          if (storedSupplies) cachedPartSupplies = JSON.parse(storedSupplies);
          const storedMeta = localStorage.getItem(`printflow_part_metadata_${user.id}`);
          if (storedMeta) cachedPartMetadata = JSON.parse(storedMeta);
        } catch (e) {}

        const normalizedParts = partsRes.data.map((row: any) => {
          let supplies = row.supplies;
          // Se row.supplies for nulo/vazio (ex: coluna ausente no banco), restaura do cache ou do recipe embutido
          if (!Array.isArray(supplies) || supplies.length === 0) {
            if (cachedPartSupplies[row.id] && Array.isArray(cachedPartSupplies[row.id])) {
              supplies = cachedPartSupplies[row.id];
            } else if (Array.isArray(row.recipe)) {
              const embedded = row.recipe.find((item: any) => item && (item._embeddedSupplies || item._supplies));
              if (embedded && Array.isArray(embedded._embeddedSupplies || embedded._supplies)) {
                supplies = embedded._embeddedSupplies || embedded._supplies;
              }
            }
          }

          // Restaura unitsPerPrint (quantidade de peças por impressão / lote)
          let unitsPerPrint = Number(row.unitsPerPrint ?? row.units_per_print);
          if (!unitsPerPrint || isNaN(unitsPerPrint) || unitsPerPrint < 1) {
            if (cachedPartMetadata[row.id]?.unitsPerPrint) {
              unitsPerPrint = Number(cachedPartMetadata[row.id].unitsPerPrint);
            } else if (Array.isArray(row.recipe)) {
              const meta = row.recipe.find((item: any) => item && (item._metadata || item._unitsPerPrint));
              if (meta?._metadata?.unitsPerPrint) unitsPerPrint = Number(meta._metadata.unitsPerPrint);
              else if (meta?._unitsPerPrint) unitsPerPrint = Number(meta._unitsPerPrint);
            }
          }
          if (!unitsPerPrint || isNaN(unitsPerPrint) || unitsPerPrint < 1) {
            unitsPerPrint = 1;
          }

          // Remove marcadores internos (_embeddedSupplies, _metadata, _unitsPerPrint) do array de filamentos
          const cleanRecipe = Array.isArray(row.recipe) 
            ? row.recipe.filter((item: any) => item && !item._embeddedSupplies && !item._supplies && !item._metadata && !item._unitsPerPrint) 
            : [];

          return {
            ...row,
            recipe: cleanRecipe,
            supplies: supplies || [],
            unitsPerPrint: Math.floor(unitsPerPrint)
          };
        });

        setPartsState(normalizedParts);
        try {
          localStorage.setItem(`printflow_parts_${user.id}`, JSON.stringify(normalizedParts));
        } catch (e) {}
      } else {
        try {
          const cached = localStorage.getItem(`printflow_parts_${user.id}`);
          if (cached) setPartsState(JSON.parse(cached));
        } catch (e) {}
      }

      if (customersRes.success && customersRes.data !== null) {
        setCustomersState(customersRes.data);
        try {
          localStorage.setItem(`printflow_customers_${user.id}`, JSON.stringify(customersRes.data));
        } catch (e) {}
      } else {
        try {
          const cached = localStorage.getItem(`printflow_customers_${user.id}`);
          if (cached) setCustomersState(JSON.parse(cached));
        } catch (e) {}
      }

      if (ordersRes.success && ordersRes.data !== null) {
        const normalizedOrders = (ordersRes.data || []).map((row: any) => {
          const pm = row.paymentMethod || row.payment_method || (row.payments && row.payments[0]?.method) || PaymentMethod.PIX;
          const cid = row.customerId || row.customer_id || '';
          const tv = typeof row.totalValue === 'number' ? row.totalValue : (Number(row.total_value) || 0);
          const ca = row.createdAt || row.created_at || new Date().toISOString();

          // Leitura direta das colunas reais do banco
          const isPaid = Boolean(row.isPaid ?? row.is_paid ?? false);
          const paymentStatus = row.paymentStatus ?? row.payment_status ?? (isPaid ? 'PAID' : 'PENDING');
          const payments = Array.isArray(row.payments) ? row.payments : [];
          const consumedFilaments = (row.consumedFilaments && typeof row.consumedFilaments === 'object')
            ? row.consumedFilaments
            : ((row.consumed_filaments && typeof row.consumed_filaments === 'object') ? row.consumed_filaments : {});
          const stockDeductionStatus = row.stockDeductionStatus || row.stock_deduction_status || 'none';
          const stockUpdatedAt = row.stockUpdatedAt || row.stock_updated_at || undefined;
          const custosFinanceiros = row.custosFinanceiros || row.custos_financeiros || undefined;
          const detalhesPrecificacao = row.detalhesPrecificacao || row.detalhes_precificacao || undefined;
          const consumedSupplies = (row.consumedSupplies && typeof row.consumedSupplies === 'object')
            ? row.consumedSupplies
            : ((detalhesPrecificacao && typeof detalhesPrecificacao.consumedSupplies === 'object')
              ? detalhesPrecificacao.consumedSupplies
              : {});
          const discount = Number(row.discount) || 0;

          // Sanitiza itens de orders para remover quaisquer propriedades com '_'
          const cleanItems = Array.isArray(row.items)
            ? row.items.map((it: any) => {
                if (!it || typeof it !== 'object') return it;
                const clean: Record<string, any> = {};
                for (const [k, v] of Object.entries(it)) {
                  if (!k.startsWith('_')) clean[k] = v;
                }
                return clean;
              })
            : [];

          return {
            ...row,
            items: cleanItems,
            paymentMethod: pm,
            payment_method: pm,
            customerId: cid,
            customer_id: cid,
            totalValue: tv,
            total_value: tv,
            createdAt: ca,
            created_at: ca,
            isPaid,
            paymentStatus,
            payments,
            consumedFilaments,
            consumedSupplies,
            stockDeductionStatus,
            stockUpdatedAt,
            custosFinanceiros,
            detalhesPrecificacao,
            discount
          };
        });
        setOrdersState(normalizedOrders);
        try {
          localStorage.setItem(`printflow_orders_${user.id}`, JSON.stringify(normalizedOrders));
        } catch (e) {}
      } else {
        try {
          const cached = localStorage.getItem(`printflow_orders_${user.id}`);
          if (cached) setOrdersState(JSON.parse(cached));
        } catch (e) {}
      }

      if (filamentsRes.success && filamentsRes.data !== null) {
        setFilamentsState(filamentsRes.data);
        try {
          localStorage.setItem(`printflow_filaments_${user.id}`, JSON.stringify(filamentsRes.data));
        } catch (e) {}
      } else {
        try {
          const cached = localStorage.getItem(`printflow_filaments_${user.id}`);
          if (cached) setFilamentsState(JSON.parse(cached));
        } catch (e) {}
      }

      if (printersRes.success && printersRes.data !== null) {
        setPrintersState(printersRes.data);
        try {
          localStorage.setItem(`printflow_printers_${user.id}`, JSON.stringify(printersRes.data));
        } catch (e) {}
      } else {
        try {
          const cached = localStorage.getItem(`printflow_printers_${user.id}`);
          if (cached) setPrintersState(JSON.parse(cached));
        } catch (e) {}
      }

      if (suppliesRes.success && suppliesRes.data !== null) {
        const normalizedSupplies: Supply[] = (suppliesRes.data || []).map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          name: row.name,
          category: row.category || 'Outros',
          quantity: Number(row.quantity) || 0,
          minQuantity: Number(row.min_quantity ?? row.minQuantity ?? 5),
          unitCost: Number(row.unit_cost ?? row.unitCost ?? 0),
          packagePrice: Number(row.package_price ?? row.packagePrice ?? 0),
          packageUnits: Number(row.package_units ?? row.packageUnits ?? 1),
          supplier: row.supplier || undefined,
          link: row.link || undefined,
          notes: row.notes || undefined,
          createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString()
        }));
        setSuppliesState(normalizedSupplies);
        try {
          localStorage.setItem(`printflow_supplies_${user.id}`, JSON.stringify(normalizedSupplies));
        } catch (e) {}
      } else {
        try {
          const cached = localStorage.getItem(`printflow_supplies_${user.id}`);
          if (cached) setSuppliesState(JSON.parse(cached));
        } catch (e) {}
      }

      if (failuresRes.success && failuresRes.data !== null) {
        const normFailures = failuresRes.data.map(rowToFailure);
        setFailuresState(normFailures);
        try {
          localStorage.setItem(`printflow_failures_cache_${user.id}`, JSON.stringify(normFailures));
        } catch (e) {}
      } else {
        try {
          const cached = localStorage.getItem(`printflow_failures_cache_${user.id}`);
          if (cached) setFailuresState(JSON.parse(cached));
          else setFailuresState([]);
        } catch (e) {
          setFailuresState([]);
        }
      }

      if (cashExpensesRes.success && cashExpensesRes.data !== null) {
        const normExpenses = cashExpensesRes.data.map(rowToCashExpense);
        setCashExpensesState(normExpenses);
        try {
          localStorage.setItem(`printflow_expenses_cache_${user.id}`, JSON.stringify(normExpenses));
        } catch (e) {}
      } else {
        try {
          const cached = localStorage.getItem(`printflow_expenses_cache_${user.id}`);
          if (cached) setCashExpensesState(JSON.parse(cached));
          else setCashExpensesState([]);
        } catch (e) {
          setCashExpensesState([]);
        }
      }

      // Migração única de dados legados do localStorage para o Supabase
      if (!migratedFailuresRef.current) {
        try {
          const rawFailures = localStorage.getItem('printflow_failures');
          if (rawFailures) {
            const parsed = JSON.parse(rawFailures);
            if (Array.isArray(parsed) && parsed.length > 0) {
              migratedFailuresRef.current = true;
              const rows = parsed.map(f => failureToRow(f, user.id));
              const { data: inserted, error: mError } = await supabase
                .from('failures')
                .insert(rows)
                .select();

              if (!mError && inserted) {
                localStorage.removeItem('printflow_failures');
                setFailuresState(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const newItems = inserted.map(rowToFailure).filter(f => !existingIds.has(f.id));
                  return [...newItems, ...prev];
                });
                console.log(`Migradas ${inserted.length} falhas antigas do localStorage para o Supabase.`);
              } else {
                migratedFailuresRef.current = false;
                if (mError) console.warn('Aviso ao migrar printflow_failures:', mError.message);
              }
            } else {
              localStorage.removeItem('printflow_failures');
              migratedFailuresRef.current = true;
            }
          } else {
            migratedFailuresRef.current = true;
          }
        } catch (e) {
          migratedFailuresRef.current = false;
        }
      }

      if (!migratedExpensesRef.current) {
        try {
          const rawExpenses = localStorage.getItem(`printflow_cash_expenses_${user.id}`);
          if (rawExpenses) {
            const parsed = JSON.parse(rawExpenses);
            if (Array.isArray(parsed) && parsed.length > 0) {
              migratedExpensesRef.current = true;
              const rows = parsed.map(e => cashExpenseToRow(e, user.id));
              const { data: inserted, error: mError } = await supabase
                .from('cash_expenses')
                .insert(rows)
                .select();

              if (!mError && inserted) {
                localStorage.removeItem(`printflow_cash_expenses_${user.id}`);
                setCashExpensesState(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const newItems = inserted.map(rowToCashExpense).filter(e => !existingIds.has(e.id));
                  return [...newItems, ...prev];
                });
                console.log(`Migradas ${inserted.length} despesas antigas do localStorage para o Supabase.`);
              } else {
                migratedExpensesRef.current = false;
                if (mError) console.warn('Aviso ao migrar printflow_cash_expenses:', mError.message);
              }
            } else {
              localStorage.removeItem(`printflow_cash_expenses_${user.id}`);
              migratedExpensesRef.current = true;
            }
          } else {
            migratedExpensesRef.current = true;
          }
        } catch (e) {
          migratedExpensesRef.current = false;
        }
      }

      if (!migratedPaymentStatusRef.current) {
        try {
          const rawPaymentCache = localStorage.getItem('printflow_orders_payment_status');
          if (rawPaymentCache) {
            const parsed = JSON.parse(rawPaymentCache);
            if (parsed && typeof parsed === 'object') {
              migratedPaymentStatusRef.current = true;
              let updatedCount = 0;
              let hadError = false;

              for (const [orderId, cacheVal] of Object.entries(parsed)) {
                if (!cacheVal || typeof cacheVal !== 'object') continue;
                const cachedIsPaid = Boolean((cacheVal as any).isPaid);
                const matchingOrder = (ordersRes.data || []).find((o: any) => o.id === orderId);

                // Compara se o isPaid no banco é diferente do cache
                if (matchingOrder) {
                  const dbIsPaid = Boolean(matchingOrder.isPaid ?? matchingOrder.is_paid ?? false);
                  if (dbIsPaid !== cachedIsPaid) {
                    const cachedStatus = (cacheVal as any).paymentStatus || (cachedIsPaid ? 'PAID' : 'PENDING');
                    const cachedPayments = Array.isArray((cacheVal as any).payments) ? (cacheVal as any).payments : [];
                    const { error: updErr } = await supabase
                      .from('orders')
                      .update({
                        isPaid: cachedIsPaid,
                        paymentStatus: cachedStatus,
                        payments: cachedPayments
                      })
                      .eq('id', orderId)
                      .eq('user_id', user.id);

                    if (updErr) {
                      console.warn(`Erro ao migrar pagamento do pedido ${orderId}:`, updErr.message);
                      hadError = true;
                    } else {
                      updatedCount++;
                    }
                  }
                }
              }

              if (!hadError) {
                localStorage.removeItem('printflow_orders_payment_status');
                if (updatedCount > 0) {
                  const noticeMsg = `${updatedCount} pedido(s) tiveram o status de pagamento recuperado deste aparelho.`;
                  console.log(noticeMsg);
                  try {
                    sessionStorage.setItem('printflow_orders_migrated_notice', noticeMsg);
                    window.dispatchEvent(new CustomEvent('printflow_orders_notice', { detail: noticeMsg }));
                  } catch (e) {}

                  // Atualiza localmente o estado dos pedidos
                  setOrdersState(prev => prev.map(o => {
                    const c = parsed[o.id];
                    if (c && Boolean(c.isPaid) !== Boolean(o.isPaid)) {
                      return {
                        ...o,
                        isPaid: Boolean(c.isPaid),
                        paymentStatus: c.paymentStatus || (c.isPaid ? 'PAID' : 'PENDING'),
                        payments: Array.isArray(c.payments) ? c.payments : o.payments
                      };
                    }
                    return o;
                  }));
                }
              } else {
                migratedPaymentStatusRef.current = false;
              }
            } else {
              localStorage.removeItem('printflow_orders_payment_status');
              migratedPaymentStatusRef.current = true;
            }
          } else {
            migratedPaymentStatusRef.current = true;
          }
        } catch (e) {
          migratedPaymentStatusRef.current = false;
        }
      }

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
          setSettingsState(resolved);
          saveLocalSettings(user.id, resolved, false);
          setSettingsSyncState('synced');
          setSettingsConflict(null);

          // Auto-migração e auto-upload:
          // Se o dispositivo local continha dados comerciais salvos (ex: editados no celular)
          // mas a nuvem ainda não os tinha registrado, envia imediatamente ao Supabase com o carrier
          const localHasBusiness = localCache?.settings?.businessInfo &&
            Object.values(localCache.settings.businessInfo).some(v => v !== null && v !== undefined && String(v).trim() !== '');
          const { extData } = extractCarrierData(remoteData.categories);
          const remoteHasBusiness = (remoteData.business_info && Object.values(remoteData.business_info).some(v => v !== null && v !== undefined && String(v).trim() !== '')) ||
            (extData?.businessInfo && Object.values(extData.businessInfo).some(v => v !== null && v !== undefined && String(v).trim() !== ''));

          if (localHasBusiness && !remoteHasBusiness) {
            console.log('Dados comerciais locais detectados. Sincronizando automaticamente com Supabase Cloud...');
            saveRemoteSettings(user.id, resolved).then((res) => {
              if (res.success) {
                console.log('Dados comerciais sincronizados na nuvem!');
                saveLocalSettings(user.id, resolved, false);
                setSettingsSyncState('synced');
              }
            }).catch(err => {
              console.warn('Falha no auto-upload de dados comerciais locais:', err);
            });
          }
        } else {
          // Sem registro remoto ainda (primeiro acesso)
          if (localCache) {
            setSettingsState(localCache.settings);
            saveRemoteSettings(user.id, localCache.settings).then(() => {
              setSettingsSyncState('synced');
            });
          } else {
            setSettingsState(DEFAULT_SETTINGS);
            setSettingsSyncState('synced');
          }
        }
      } catch (err: any) {
        const sanitized = sanitizeErrorMessage(err?.message || 'Falha de conexão');
        console.error('Exceção ao consultar settings:', sanitized);
        settingsError = `Falha de conexão na tabela "settings": ${sanitized}`;
      }

      // Consolidação centralizada de erros separando erros reais de schema de falhas temporárias de conexão
      const schemaErrors: string[] = [];
      const connectionErrors: string[] = [];
      const failedSchemaTables: string[] = [];
      const failedConnectionTables: string[] = [];

      [partsRes, customersRes, ordersRes, filamentsRes, printersRes].forEach(res => {
        if (!res.success && res.error) {
          if (res.isNetwork) {
            connectionErrors.push(res.error);
            failedConnectionTables.push(res.table);
          } else {
            schemaErrors.push(res.error);
            failedSchemaTables.push(res.table);
          }
        }
      });

      if (settingsError) {
        if (isNetworkError(settingsError)) {
          connectionErrors.push(settingsError);
          failedConnectionTables.push('settings');
        } else {
          schemaErrors.push(settingsError);
          failedSchemaTables.push('settings');
        }
      }

      // dbError só é preenchido para ERROS DE SCHEMA (tabela ou coluna ausente no banco)
      if (schemaErrors.length === 0) {
        setDbError(null);
      } else if (schemaErrors.length === 1) {
        setDbError(schemaErrors[0]);
      } else {
        setDbError(`Tabelas ou colunas ausentes no banco de dados (${failedSchemaTables.join(', ')}): ${schemaErrors.join(' | ')}`);
      }

      // connectionError armazena falhas de conectividade/offline sem bloquear o app
      if (connectionErrors.length > 0) {
        setConnectionError(`Conexão com a nuvem indisponível no momento (${connectionErrors.length} tabelas aguardando rede: ${failedConnectionTables.join(', ')}). Seus dados locais continuam seguros.`);
      } else {
        setConnectionError(null);
      }
    } catch (error: any) {
      const sanitized = sanitizeErrorMessage(error?.message || 'Erro inesperado na sincronização');
      console.error('Erro ao buscar dados:', sanitized);
      if (isNetworkError(sanitized)) {
        setConnectionError(`Conexão com o Supabase indisponível no momento (${sanitized}). Exibindo dados locais.`);
      } else {
        setDbError(`Falha ao sincronizar dados: ${sanitized}`);
      }
    } finally {
      isRefreshingRef.current = false;
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

  const setSupplies = (newSupplies: Supply[]) => {
    setSuppliesState(newSupplies);
    if (user) {
      try {
        localStorage.setItem(`printflow_supplies_${user.id}`, JSON.stringify(newSupplies));
      } catch (e) {}
    }
  };

  const addFailure = async (data: Omit<PrintFailure, 'id'>): Promise<boolean> => {
    if (!user) return false;
    try {
      const row = failureToRow(data, user.id);
      const { data: inserted, error } = await supabase
        .from('failures')
        .insert(row)
        .select()
        .single();

      if (error) {
        const sanitized = sanitizeErrorMessage(error.message || `Código ${error.code || 'desconhecido'}`);
        setDbError(`Falha ao registrar perda: ${sanitized}`);
        console.error('Erro ao inserir falha:', sanitized);
        return false;
      }

      if (inserted) {
        setFailuresState(prev => [rowToFailure(inserted), ...prev]);
        return true;
      }
      return false;
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err?.message || 'Falha de conexão');
      setDbError(`Erro ao registrar falha: ${sanitized}`);
      console.error('Exceção ao inserir falha:', sanitized);
      return false;
    }
  };

  const deleteFailure = async (id: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('failures')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        const sanitized = sanitizeErrorMessage(error.message || `Código ${error.code || 'desconhecido'}`);
        setDbError(`Falha ao excluir registro de falha: ${sanitized}`);
        console.error('Erro ao excluir falha:', sanitized);
        return false;
      }

      setFailuresState(prev => prev.filter(f => f.id !== id));
      return true;
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err?.message || 'Falha de conexão');
      setDbError(`Erro ao excluir registro de falha: ${sanitized}`);
      console.error('Exceção ao excluir falha:', sanitized);
      return false;
    }
  };

  const addCashExpense = async (data: Omit<CashExpense, 'id' | 'createdAt'>): Promise<boolean> => {
    if (!user) return false;
    try {
      const row = cashExpenseToRow(data, user.id);
      const { data: inserted, error } = await supabase
        .from('cash_expenses')
        .insert(row)
        .select()
        .single();

      if (error) {
        const sanitized = sanitizeErrorMessage(error.message || `Código ${error.code || 'desconhecido'}`);
        setDbError(`Falha ao registrar despesa: ${sanitized}`);
        console.error('Erro ao inserir despesa:', sanitized);
        return false;
      }

      if (inserted) {
        setCashExpensesState(prev => [rowToCashExpense(inserted), ...prev]);
        return true;
      }
      return false;
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err?.message || 'Falha de conexão');
      setDbError(`Erro ao registrar despesa: ${sanitized}`);
      console.error('Exceção ao inserir despesa:', sanitized);
      return false;
    }
  };

  const deleteCashExpense = async (id: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('cash_expenses')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        const sanitized = sanitizeErrorMessage(error.message || `Código ${error.code || 'desconhecido'}`);
        setDbError(`Falha ao excluir despesa: ${sanitized}`);
        console.error('Erro ao excluir despesa:', sanitized);
        return false;
      }

      setCashExpensesState(prev => prev.filter(e => e.id !== id));
      return true;
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err?.message || 'Falha de conexão');
      setDbError(`Erro ao excluir despesa: ${sanitized}`);
      console.error('Exceção ao excluir despesa:', sanitized);
      return false;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSettingsConflict(null);
    setSettingsSyncState('synced');
    setFailuresState([]);
    setCashExpensesState([]);
    migratedFailuresRef.current = false;
    migratedExpensesRef.current = false;
  };

  return (
    <AppContext.Provider value={{ 
      parts, setParts: setPartsState, 
      customers, setCustomers: setCustomersState, 
      orders, setOrders: setOrdersState, 
      filaments, setFilaments: setFilamentsState,
      printers, setPrinters: setPrintersState,
      supplies, setSupplies,
      failures, addFailure, deleteFailure,
      cashExpenses, addCashExpense, deleteCashExpense,
      settings, setSettings, 
      settingsSyncState,
      settingsConflict,
      resolveConflict,
      user, setUser,
      loading, dbError,
      connectionError, isOnline,
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
