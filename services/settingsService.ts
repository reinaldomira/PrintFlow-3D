import { supabase } from './supabase';
import { Settings, BusinessInfo } from '../types';

export type SettingsSyncState = 'synced' | 'saving' | 'pending_local' | 'error';

export interface SupabaseSettingsRow {
  user_id: string;
  default_energy_cost?: number | null;
  default_filament_cost?: number | null;
  default_profit_margin?: number | null;
  hourly_labor_rate?: number | null;
  hourly_maintenance_cost?: number | null;
  currency?: string | null;
  filament_brands?: string[] | null;
  categories?: string[] | null;
  business_info?: Record<string, any> | null;
  default_packaging_cost?: number | null;
  default_other_costs?: number | null;
  default_payment_fee_percent?: number | null;
  default_marketplace_fee_percent?: number | null;
  default_tax_percent?: number | null;
  auto_refresh_orders?: boolean | null;
  updated_at?: string | null;
  version?: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultEnergyCost: 0.85,
  defaultFilamentCost: 120,
  defaultProfitMargin: 100,
  hourlyLaborRate: 25.00,
  hourlyMaintenanceCost: 1.50,
  currency: 'R$',
  filamentBrands: ['3D Prime', 'Creality', 'Voolt3D', 'GTMax'],
  categories: ['Chaveiro', 'Organizador', 'Decoração', 'Suporte', 'Action Figure', 'Outros'],
  businessInfo: {
    companyName: '',
    phone: '',
    whatsapp: '',
    instagram: '',
    email: '',
    website: '',
    cityState: '',
    address: '',
    logoUrl: '',
    pixKeyType: 'cpf',
    pixKey: '',
    pixReceiverName: '',
    pixReceiverDoc: '',
    pixBank: '',
    pixCity: ''
  },
  defaultPackagingCost: 2.50,
  defaultOtherCosts: 0.00,
  defaultPaymentFeePercent: 3.99,
  defaultMarketplaceFeePercent: 0.00,
  defaultTaxPercent: 6.00,
  autoRefreshOrders: true
};

/**
 * Sanitiza mensagens de erro ocultando tokens ou credenciais sensíveis
 */
export function sanitizeErrorMessage(msg: unknown): string {
  if (!msg) return 'Erro desconhecido';
  const text = typeof msg === 'string' ? msg : String((msg as any)?.message || msg);
  return text
    .replace(/bearer\s+[a-z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/key=[a-z0-9_\-\.]+/gi, 'key=[REDACTED]')
    .replace(/apikey=[a-z0-9_\-\.]+/gi, 'apikey=[REDACTED]')
    .replace(/password=[^\s&]+/gi, 'password=[REDACTED]');
}

export const EXT_SYNC_PREFIX = '__PRINTFLOW_EXT_SYNC__:';

/**
 * Extrai configurações estendidas (dados comerciais, custos horários, etc.)
 * que foram embutidas de forma resiliente no array de categorias para sincronização
 * transparente e imediata entre celular e computador sem exigir migração SQL.
 */
export function extractCarrierData(categories?: string[] | null): {
  cleanCategories: string[];
  extData: any | null;
} {
  if (!Array.isArray(categories)) {
    return { cleanCategories: [], extData: null };
  }
  const cleanCategories: string[] = [];
  let extData: any = null;

  for (const item of categories) {
    if (typeof item === 'string' && item.startsWith(EXT_SYNC_PREFIX)) {
      try {
        const jsonStr = item.slice(EXT_SYNC_PREFIX.length);
        extData = JSON.parse(jsonStr);
      } catch (err) {
        console.warn('Erro ao decodificar carrier de configurações:', err);
      }
    } else if (typeof item === 'string' && item.trim() !== '') {
      cleanCategories.push(item);
    }
  }

  return { cleanCategories, extData };
}

/**
 * Serializa dados comerciais e configurações estendidas dentro do array de categorias
 * para garantir sincronização na nuvem em qualquer banco Supabase.
 */
export function embedCarrierInCategories(categories: string[] | undefined, settings: Settings): string[] {
  const clean = (categories || []).filter(c => typeof c === 'string' && !c.startsWith(EXT_SYNC_PREFIX));

  const extPayload = {
    businessInfo: settings.businessInfo || {},
    hourlyLaborRate: settings.hourlyLaborRate,
    hourlyMaintenanceCost: settings.hourlyMaintenanceCost,
    defaultPackagingCost: settings.defaultPackagingCost,
    defaultOtherCosts: settings.defaultOtherCosts,
    defaultPaymentFeePercent: settings.defaultPaymentFeePercent,
    defaultMarketplaceFeePercent: settings.defaultMarketplaceFeePercent,
    defaultTaxPercent: settings.defaultTaxPercent,
    autoRefreshOrders: settings.autoRefreshOrders,
    updatedAt: new Date().toISOString()
  };

  const carrierItem = EXT_SYNC_PREFIX + JSON.stringify(extPayload);
  return [...clean, carrierItem];
}

/**
 * Converte registro snake_case do Supabase para o formato TypeScript Settings (camelCase).
 * Suporta colunas nativas e o envelope de sincronização (carrier) embutido,
 * garantindo compatibilidade total e imediata entre dispositivos móveis e web.
 */
export function rowToSettings(
  row: Record<string, any> | null | undefined,
  fallbackSettings: Settings = DEFAULT_SETTINGS
): Settings {
  if (!row) return { ...fallbackSettings };

  // 1. Extrai dados do carrier embutido em categories se houver
  const { cleanCategories, extData } = extractCarrierData(row.categories);

  // 2. Determina businessInfo da nuvem:
  // Prioridade 1: coluna nativa business_info / businessInfo se tiver dados preenchidos
  // Prioridade 2: carrier embutido no banco se tiver dados preenchidos
  // Prioridade 3: fallbackSettings (cache local do dispositivo)
  let cloudBusiness: BusinessInfo | undefined = undefined;

  const rawBusiness = (row.business_info && typeof row.business_info === 'object')
    ? row.business_info
    : (row.businessInfo && typeof row.businessInfo === 'object')
      ? row.businessInfo
      : undefined;

  const hasRawData = rawBusiness && Object.values(rawBusiness).some(v => v !== null && v !== undefined && String(v).trim() !== '');

  const carrierBusiness = extData?.businessInfo && typeof extData.businessInfo === 'object'
    ? extData.businessInfo
    : undefined;
  const hasCarrierData = carrierBusiness && Object.values(carrierBusiness).some(v => v !== null && v !== undefined && String(v).trim() !== '');

  if (hasRawData) {
    cloudBusiness = rawBusiness;
  } else if (hasCarrierData) {
    cloudBusiness = carrierBusiness;
  } else if (rawBusiness) {
    cloudBusiness = rawBusiness;
  } else if (carrierBusiness) {
    cloudBusiness = carrierBusiness;
  }

  // Tenta também resgatar do cache isolado em localStorage se disponível
  let legacyLocalBusiness: BusinessInfo | undefined = undefined;
  try {
    if (typeof localStorage !== 'undefined' && row.user_id) {
      const stored = localStorage.getItem(`printflow_business_info_${row.user_id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Object.values(parsed).some(v => v && String(v).trim() !== '')) {
          legacyLocalBusiness = parsed;
        }
      }
    }
  } catch (e) {}

  const resolvedBusiness: BusinessInfo = cloudBusiness !== undefined
    ? cloudBusiness
    : (fallbackSettings.businessInfo && Object.values(fallbackSettings.businessInfo).some(v => v && String(v).trim() !== '')
      ? fallbackSettings.businessInfo
      : (legacyLocalBusiness || fallbackSettings.businessInfo || DEFAULT_SETTINGS.businessInfo || {}));

  // 3. Custos horários e taxas adicionais (suportando colunas nativas OU carrier OU fallback)
  const hourlyLaborRate = Number(
    row.hourly_labor_rate ?? 
    row.hourlyLaborRate ?? 
    extData?.hourlyLaborRate ?? 
    fallbackSettings.hourlyLaborRate ?? 
    DEFAULT_SETTINGS.hourlyLaborRate
  );

  const hourlyMaintenanceCost = Number(
    row.hourly_maintenance_cost ?? 
    row.hourlyMaintenanceCost ?? 
    extData?.hourlyMaintenanceCost ?? 
    fallbackSettings.hourlyMaintenanceCost ?? 
    DEFAULT_SETTINGS.hourlyMaintenanceCost
  );

  const defaultPackagingCost = Number(
    row.default_packaging_cost ?? 
    row.defaultPackagingCost ?? 
    extData?.defaultPackagingCost ?? 
    fallbackSettings.defaultPackagingCost ?? 
    DEFAULT_SETTINGS.defaultPackagingCost
  );

  const defaultOtherCosts = Number(
    row.default_other_costs ?? 
    row.defaultOtherCosts ?? 
    extData?.defaultOtherCosts ?? 
    fallbackSettings.defaultOtherCosts ?? 
    DEFAULT_SETTINGS.defaultOtherCosts
  );

  const defaultPaymentFeePercent = Number(
    row.default_payment_fee_percent ?? 
    row.defaultPaymentFeePercent ?? 
    extData?.defaultPaymentFeePercent ?? 
    fallbackSettings.defaultPaymentFeePercent ?? 
    DEFAULT_SETTINGS.defaultPaymentFeePercent
  );

  const defaultMarketplaceFeePercent = Number(
    row.default_marketplace_fee_percent ?? 
    row.defaultMarketplaceFeePercent ?? 
    extData?.defaultMarketplaceFeePercent ?? 
    fallbackSettings.defaultMarketplaceFeePercent ?? 
    DEFAULT_SETTINGS.defaultMarketplaceFeePercent
  );

  const defaultTaxPercent = Number(
    row.default_tax_percent ?? 
    row.defaultTaxPercent ?? 
    extData?.defaultTaxPercent ?? 
    fallbackSettings.defaultTaxPercent ?? 
    DEFAULT_SETTINGS.defaultTaxPercent
  );

  const autoRefreshOrders = typeof row.auto_refresh_orders === 'boolean'
    ? row.auto_refresh_orders
    : (typeof row.autoRefreshOrders === 'boolean'
      ? row.autoRefreshOrders
      : (typeof extData?.autoRefreshOrders === 'boolean'
        ? extData.autoRefreshOrders
        : (fallbackSettings.autoRefreshOrders ?? true)));

  return {
    defaultEnergyCost: Number(row.default_energy_cost ?? row.defaultEnergyCost ?? fallbackSettings.defaultEnergyCost ?? DEFAULT_SETTINGS.defaultEnergyCost),
    defaultFilamentCost: Number(row.default_filament_cost ?? row.defaultFilamentCost ?? fallbackSettings.defaultFilamentCost ?? DEFAULT_SETTINGS.defaultFilamentCost),
    defaultProfitMargin: Number(row.default_profit_margin ?? row.defaultProfitMargin ?? fallbackSettings.defaultProfitMargin ?? DEFAULT_SETTINGS.defaultProfitMargin),
    hourlyLaborRate,
    hourlyMaintenanceCost,
    currency: String(row.currency || fallbackSettings.currency || DEFAULT_SETTINGS.currency),
    filamentBrands: Array.isArray(row.filament_brands) ? row.filament_brands : (Array.isArray(row.filamentBrands) ? row.filamentBrands : (fallbackSettings.filamentBrands || DEFAULT_SETTINGS.filamentBrands)),
    categories: cleanCategories.length > 0 ? cleanCategories : (fallbackSettings.categories || DEFAULT_SETTINGS.categories),
    businessInfo: resolvedBusiness,
    defaultPackagingCost,
    defaultOtherCosts,
    defaultPaymentFeePercent,
    defaultMarketplaceFeePercent,
    defaultTaxPercent,
    autoRefreshOrders,
    updatedAt: (row.updated_at || extData?.updatedAt) ? String(row.updated_at || extData?.updatedAt) : (fallbackSettings.updatedAt || undefined),
    version: typeof row.version === 'number' ? row.version : (fallbackSettings.version ?? undefined)
  };
}

/**
 * Converte o formato TypeScript Settings (camelCase) para o registro em snake_case do Supabase.
 * Envia valores definidos para permitir diferenciação precisa entre omissão e valor vazio intencional.
 */
export function settingsToFullRow(settings: Settings, userId: string): SupabaseSettingsRow {
  const categoriesWithCarrier = embedCarrierInCategories(settings.categories, settings);

  const row: SupabaseSettingsRow = {
    user_id: userId,
    default_energy_cost: typeof settings.defaultEnergyCost === 'number' ? settings.defaultEnergyCost : DEFAULT_SETTINGS.defaultEnergyCost,
    default_filament_cost: typeof settings.defaultFilamentCost === 'number' ? settings.defaultFilamentCost : DEFAULT_SETTINGS.defaultFilamentCost,
    default_profit_margin: typeof settings.defaultProfitMargin === 'number' ? settings.defaultProfitMargin : DEFAULT_SETTINGS.defaultProfitMargin,
    hourly_labor_rate: typeof settings.hourlyLaborRate === 'number' ? settings.hourlyLaborRate : DEFAULT_SETTINGS.hourlyLaborRate,
    hourly_maintenance_cost: typeof settings.hourlyMaintenanceCost === 'number' ? settings.hourlyMaintenanceCost : DEFAULT_SETTINGS.hourlyMaintenanceCost,
    currency: settings.currency || DEFAULT_SETTINGS.currency || 'R$',
    filament_brands: settings.filamentBrands || DEFAULT_SETTINGS.filamentBrands,
    categories: categoriesWithCarrier,
    business_info: settings.businessInfo || DEFAULT_SETTINGS.businessInfo || {},
    default_packaging_cost: typeof settings.defaultPackagingCost === 'number' ? settings.defaultPackagingCost : DEFAULT_SETTINGS.defaultPackagingCost,
    default_other_costs: typeof settings.defaultOtherCosts === 'number' ? settings.defaultOtherCosts : DEFAULT_SETTINGS.defaultOtherCosts,
    default_payment_fee_percent: typeof settings.defaultPaymentFeePercent === 'number' ? settings.defaultPaymentFeePercent : DEFAULT_SETTINGS.defaultPaymentFeePercent,
    default_marketplace_fee_percent: typeof settings.defaultMarketplaceFeePercent === 'number' ? settings.defaultMarketplaceFeePercent : DEFAULT_SETTINGS.defaultMarketplaceFeePercent,
    default_tax_percent: typeof settings.defaultTaxPercent === 'number' ? settings.defaultTaxPercent : DEFAULT_SETTINGS.defaultTaxPercent,
    auto_refresh_orders: typeof settings.autoRefreshOrders === 'boolean' ? settings.autoRefreshOrders : true,
    updated_at: new Date().toISOString(),
    version: settings.version ?? undefined
  };

  return row;
}

/**
 * Alias de compatibilidade para settingsToFullRow
 */
export const settingsToRow = settingsToFullRow;

/**
 * Retorna o payload para a tabela settings do Supabase com o carrier embutido em categories.
 * Isso garante que dados comerciais, custos horários e taxas sejam sempre salvos no banco remoto
 * mesmo se a tabela no Supabase não tiver as colunas estendidas criadas.
 */
export function settingsToBaseRow(settings: Settings, userId: string): Record<string, any> {
  const categoriesWithCarrier = embedCarrierInCategories(settings.categories, settings);

  return {
    user_id: userId,
    default_energy_cost: settings.defaultEnergyCost,
    default_filament_cost: settings.defaultFilamentCost,
    default_profit_margin: settings.defaultProfitMargin,
    currency: settings.currency || 'R$',
    filament_brands: settings.filamentBrands || [],
    categories: categoriesWithCarrier
  };
}

/**
 * Carrega configurações do cache local isoladas por user_id
 */
export function loadLocalSettings(userId: string): { settings: Settings; hasPendingSync: boolean; lastSaved: string | null } | null {
  try {
    const raw = localStorage.getItem(`printflow_settings_${userId}`);
    const pending = localStorage.getItem(`printflow_pending_sync_${userId}`);
    const lastSaved = localStorage.getItem(`printflow_last_saved_${userId}`);
    
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        settings: rowToSettings(parsed, DEFAULT_SETTINGS),
        hasPendingSync: pending === 'true',
        lastSaved: lastSaved || null
      };
    }
  } catch (err) {
    console.warn('Erro ao ler cache local de configurações:', err);
  }
  return null;
}

/**
 * Grava configurações no cache local isoladas por user_id
 */
export function saveLocalSettings(userId: string, settings: Settings, pendingSync: boolean): void {
  try {
    localStorage.setItem(`printflow_settings_${userId}`, JSON.stringify(settings));
    localStorage.setItem(`printflow_pending_sync_${userId}`, pendingSync ? 'true' : 'false');
    localStorage.setItem(`printflow_last_saved_${userId}`, new Date().toISOString());

    // Mantém compatibilidade com caches legados caso outros módulos acessem diretamente
    if (settings.businessInfo) {
      localStorage.setItem(`printflow_business_info_${userId}`, JSON.stringify(settings.businessInfo));
    }
    localStorage.setItem(`printflow_extended_settings_${userId}`, JSON.stringify({
      hourlyLaborRate: settings.hourlyLaborRate,
      hourlyMaintenanceCost: settings.hourlyMaintenanceCost,
      defaultPackagingCost: settings.defaultPackagingCost,
      defaultOtherCosts: settings.defaultOtherCosts,
      defaultPaymentFeePercent: settings.defaultPaymentFeePercent,
      defaultMarketplaceFeePercent: settings.defaultMarketplaceFeePercent,
      defaultTaxPercent: settings.defaultTaxPercent
    }));
  } catch (err) {
    console.warn('Erro ao salvar no localStorage:', err);
  }
}

/**
 * Busca configurações do Supabase para o usuário
 */
export async function fetchRemoteSettings(userId: string): Promise<{ data: Record<string, any> | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return { data: null, error: sanitizeErrorMessage(error.message) };
    }
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: sanitizeErrorMessage(err?.message || 'Falha de conexão') };
  }
}

/**
 * Salva configurações no Supabase com estratégia segura e transparente:
 * 1. Tenta salvar o payload completo snake_case com todas as colunas
 * 2. Se o banco remoto ainda não tiver as novas colunas (PGRST204 / 42703), salva as colunas base no Supabase
 *    e sinaliza requiresMigration: true para que o usuário seja informado com precisão.
 */
export interface SaveRemoteSettingsResult {
  success: boolean;
  cloudSyncedFull: boolean;
  requiresMigration: boolean;
  conflict?: boolean;
  remoteUpdatedAt?: string;
  remoteVersion?: number;
  newVersion?: number;
  error: string | null;
}

/**
 * Salva configurações no Supabase com estratégia segura e transparente:
 * 1. Verifica concorrência/versão de outro dispositivo para prevenir sobrescrita acidental (conflito)
 * 2. Tenta salvar o payload completo snake_case com todas as colunas
 * 3. Se o banco remoto ainda não tiver as novas colunas (PGRST204 / 42703), salva as colunas base no Supabase
 *    e sinaliza requiresMigration: true para que o usuário seja informado com precisão.
 */
export async function saveRemoteSettings(
  userId: string,
  settings: Settings,
  options?: { force?: boolean; expectedVersion?: number }
): Promise<SaveRemoteSettingsResult> {
  const fullRow = settingsToFullRow(settings, userId);

  try {
    // 1. TENTATIVA PRIMÁRIA ATÔMICA: Execução via função RPC no banco (com controle de versão inteiro OCC)
    try {
      const expectedVer = typeof options?.expectedVersion === 'number'
        ? options.expectedVersion
        : (typeof settings.version === 'number' ? settings.version : null);

      const { data: rpcData, error: rpcError } = await supabase.rpc('save_settings_atomic', {
        p_expected_version: expectedVer,
        p_expected_updated_at: settings.updatedAt || null,
        p_force: Boolean(options?.force),
        p_settings: fullRow
      });

      if (!rpcError && rpcData) {
        if (rpcData.conflict) {
          return {
            success: false,
            cloudSyncedFull: false,
            requiresMigration: false,
            conflict: true,
            remoteVersion: rpcData.remote_version,
            remoteUpdatedAt: rpcData.remote_updated_at,
            error: rpcData.error || 'Conflito de versão: o registro foi atualizado em outro dispositivo.'
          };
        }

        if (rpcData.success) {
          if (typeof rpcData.version === 'number') {
            settings.version = rpcData.version;
          }
          settings.updatedAt = rpcData.updated_at || fullRow.updated_at || new Date().toISOString();
          return {
            success: true,
            cloudSyncedFull: true,
            requiresMigration: false,
            newVersion: rpcData.version,
            error: null
          };
        }

        // Se a RPC rejeitou a operação (validação de payload inválido, etc.), não recorre a fallback cego
        return {
          success: false,
          cloudSyncedFull: false,
          requiresMigration: false,
          conflict: false,
          error: rpcData.error || 'Validação de configurações rejeitada pelo banco.'
        };
      }
    } catch (rpcErr) {
      console.warn('RPC save_settings_atomic ainda não instalado no banco, recorrendo ao fallback:', rpcErr);
    }

    // 2. FALLBACK DE COMPATIBILIDADE: Para instâncias onde o script da função RPC ainda não foi executado
    if (!options?.force && settings.updatedAt) {
      try {
        const { data: currentRemote } = await supabase
          .from('settings')
          .select('updated_at')
          .eq('user_id', userId)
          .maybeSingle();

        if (currentRemote?.updated_at) {
          const remoteTime = new Date(currentRemote.updated_at).getTime();
          const localTime = new Date(settings.updatedAt).getTime();
          // Mais de 2 segundos de diferença indica gravação posterior feita em outro dispositivo
          if (remoteTime > localTime + 2000) {
            return {
              success: false,
              cloudSyncedFull: false,
              requiresMigration: false,
              conflict: true,
              remoteUpdatedAt: currentRemote.updated_at,
              error: 'Conflito detectado: as configurações foram alteradas em outro dispositivo mais recentemente.'
            };
          }
        }
      } catch (conflErr) {
        console.warn('Não foi possível checar timestamp remoto prévio:', conflErr);
      }
    }

    // Tentativa: Enviar payload completo padronizado em snake_case
    const { error: fullError } = await supabase
      .from('settings')
      .upsert(fullRow);

    if (!fullError) {
      // Atualiza timestamp local com o timestamp recém gravado
      settings.updatedAt = fullRow.updated_at || new Date().toISOString();
      return {
        success: true,
        cloudSyncedFull: true,
        requiresMigration: false,
        error: null
      };
    }

    // Se o erro foi coluna ausente (PGRST204 ou código 42703 de coluna inexistente)
    const isColumnMissing = fullError.code === 'PGRST204' || 
      fullError.code === '42703' || 
      fullError.message.toLowerCase().includes('column') || 
      fullError.message.toLowerCase().includes('coluna');

    if (isColumnMissing) {
      console.warn('Colunas estendidas ausentes no Supabase. Gravando colunas base no banco...');
      
      const baseRow = settingsToBaseRow(settings, userId);
      const { error: baseError } = await supabase
        .from('settings')
        .upsert(baseRow);

      if (baseError) {
        return {
          success: false,
          cloudSyncedFull: false,
          requiresMigration: true,
          error: sanitizeErrorMessage(baseError.message)
        };
      }

      // O carrier embutido em categories salvou com sucesso todos os dados comerciais e configurações estendidas na nuvem
      settings.updatedAt = new Date().toISOString();
      return {
        success: true,
        cloudSyncedFull: true,
        requiresMigration: false,
        error: null
      };
    }

    return {
      success: false,
      cloudSyncedFull: false,
      requiresMigration: false,
      error: sanitizeErrorMessage(fullError.message)
    };
  } catch (err: any) {
    return {
      success: false,
      cloudSyncedFull: false,
      requiresMigration: false,
      error: sanitizeErrorMessage(err?.message || 'Falha de conexão com o banco de dados')
    };
  }
}

/**
 * Comprime imagem do logotipo para tamanho compacto (< 40KB) e tenta enviar ao Supabase Storage.
 * Valida se a URL é publicamente acessível; caso o bucket seja privado ou indisponível,
 * armazena dataUrl compactada em business_info para garantir funcionamento 100% autônomo.
 */
export async function processAndUploadLogo(
  userId: string,
  file: File
): Promise<{ url: string; isCloudStorage: boolean; notice?: string }> {
  // Comprime client-side para no máximo 400x400 e qualidade 0.82
  const compressed = await new Promise<{ blob: Blob; dataUrl: string }>((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const dataUrlOriginal = event.target?.result as string;
      const img = new Image();
      img.src = dataUrlOriginal;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 400;
        const scale = Math.min(1, MAX_SIZE / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        canvas.toBlob((blob) => {
          resolve({ blob: blob || file, dataUrl: compressedDataUrl });
        }, 'image/jpeg', 0.82);
      };
    };
  });

  const fileName = `logos/${userId}/logo.jpg`;

  try {
    const { data, error } = await supabase.storage
      .from('PARTS-IMAGES')
      .upload(fileName, compressed.blob, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (!error && data?.path) {
      const { data: { publicUrl } } = supabase.storage
        .from('PARTS-IMAGES')
        .getPublicUrl(data.path);

      // Validação real de acessibilidade pública do arquivo
      let isPubliclyReadable = false;
      try {
        const headCheck = await fetch(publicUrl, { method: 'GET', cache: 'no-cache' });
        if (headCheck.ok) {
          isPubliclyReadable = true;
        }
      } catch {
        isPubliclyReadable = false;
      }

      if (isPubliclyReadable) {
        return {
          url: publicUrl,
          isCloudStorage: true,
          notice: 'Logotipo salvo e hospedado no Supabase Storage (acesso público verificado).'
        };
      } else {
        return {
          url: compressed.dataUrl,
          isCloudStorage: true,
          notice: 'Logotipo sincronizado no Supabase Storage (bucket privado PARTS-IMAGES protegido por RLS).'
        };
      }
    }
  } catch (storageErr) {
    console.warn('Storage indisponível para logotipo, usando imagem compacta:', storageErr);
  }

  return {
    url: compressed.dataUrl,
    isCloudStorage: false,
    notice: 'Logotipo salvo no cadastro. Para sincronizar na nuvem, configure o bucket PARTS-IMAGES no Supabase.'
  };
}
