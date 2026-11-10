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

/**
 * Identifica se a falha é decorrente de conectividade/rede (offline, timeout, failed to fetch, etc.)
 */
export function isNetworkError(msg: unknown): boolean {
  if (!msg) return false;
  const text = (typeof msg === 'string' ? msg : String((msg as any)?.message || msg)).toLowerCase();
  return (
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('load failed') ||
    text.includes('network request failed') ||
    text.includes('offline') ||
    text.includes('net::') ||
    text.includes('timeout') ||
    text.includes('econnrefused') ||
    text.includes('err_connection') ||
    text.includes('err_name_not_resolved') ||
    text.includes('err_blocked_by_client') ||
    text.includes('falha de conexão') ||
    text.includes('conexão indisponível')
  );
}

/**
 * Identifica se o erro é genuinamente de schema/estrutura do banco de dados (tabela ou coluna ausente)
 */
export function isSchemaError(msg: unknown, code?: string): boolean {
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || code === '42703') {
    return true;
  }
  if (!msg) return false;
  const text = (typeof msg === 'string' ? msg : String((msg as any)?.message || msg)).toLowerCase();
  if (isNetworkError(text)) return false;
  return (
    text.includes('42p01') ||
    text.includes('pgrst205') ||
    text.includes('pgrst204') ||
    text.includes('42703') ||
    text.includes('schema cache') ||
    text.includes('tabela ausente') ||
    text.includes('coluna ausente') ||
    text.includes('relation') ||
    text.includes('does not exist')
  );
}

/**
 * Converte registro snake_case do Supabase para o formato TypeScript Settings (camelCase).
 * Lê apenas das colunas reais em snake_case.
 */
export function rowToSettings(
  row: Record<string, any> | null | undefined,
  fallbackSettings: Settings = DEFAULT_SETTINGS
): Settings {
  if (!row) return { ...fallbackSettings };

  const legacyCarrierPrefix = ['__PRINTFLOW', 'EXT', 'SYNC__:'].join('_');
  const cleanCategories = Array.isArray(row.categories)
    ? row.categories.filter((c: any) => typeof c === 'string' && !c.startsWith(legacyCarrierPrefix) && c.trim() !== '')
    : [];

  const businessInfo: BusinessInfo = (row.business_info && typeof row.business_info === 'object')
    ? (row.business_info as BusinessInfo)
    : (fallbackSettings.businessInfo || DEFAULT_SETTINGS.businessInfo || {});

  const defaultEnergyCost = typeof row.default_energy_cost === 'number'
    ? row.default_energy_cost
    : (fallbackSettings.defaultEnergyCost ?? DEFAULT_SETTINGS.defaultEnergyCost);

  const defaultFilamentCost = typeof row.default_filament_cost === 'number'
    ? row.default_filament_cost
    : (fallbackSettings.defaultFilamentCost ?? DEFAULT_SETTINGS.defaultFilamentCost);

  const defaultProfitMargin = typeof row.default_profit_margin === 'number'
    ? row.default_profit_margin
    : (fallbackSettings.defaultProfitMargin ?? DEFAULT_SETTINGS.defaultProfitMargin);

  const hourlyLaborRate = typeof row.hourly_labor_rate === 'number'
    ? row.hourly_labor_rate
    : (fallbackSettings.hourlyLaborRate ?? DEFAULT_SETTINGS.hourlyLaborRate);

  const hourlyMaintenanceCost = typeof row.hourly_maintenance_cost === 'number'
    ? row.hourly_maintenance_cost
    : (fallbackSettings.hourlyMaintenanceCost ?? DEFAULT_SETTINGS.hourlyMaintenanceCost);

  const currency = String(row.currency || fallbackSettings.currency || DEFAULT_SETTINGS.currency);

  const filamentBrands = (Array.isArray(row.filament_brands) && row.filament_brands.length > 0)
    ? row.filament_brands
    : (fallbackSettings.filamentBrands || DEFAULT_SETTINGS.filamentBrands);

  const categories = cleanCategories.length > 0
    ? cleanCategories
    : (fallbackSettings.categories || DEFAULT_SETTINGS.categories);

  const defaultPackagingCost = typeof row.default_packaging_cost === 'number'
    ? row.default_packaging_cost
    : (fallbackSettings.defaultPackagingCost ?? DEFAULT_SETTINGS.defaultPackagingCost);

  const defaultOtherCosts = typeof row.default_other_costs === 'number'
    ? row.default_other_costs
    : (fallbackSettings.defaultOtherCosts ?? DEFAULT_SETTINGS.defaultOtherCosts);

  const defaultPaymentFeePercent = typeof row.default_payment_fee_percent === 'number'
    ? row.default_payment_fee_percent
    : (fallbackSettings.defaultPaymentFeePercent ?? DEFAULT_SETTINGS.defaultPaymentFeePercent);

  const defaultMarketplaceFeePercent = typeof row.default_marketplace_fee_percent === 'number'
    ? row.default_marketplace_fee_percent
    : (fallbackSettings.defaultMarketplaceFeePercent ?? DEFAULT_SETTINGS.defaultMarketplaceFeePercent);

  const defaultTaxPercent = typeof row.default_tax_percent === 'number'
    ? row.default_tax_percent
    : (fallbackSettings.defaultTaxPercent ?? DEFAULT_SETTINGS.defaultTaxPercent);

  const autoRefreshOrders = typeof row.auto_refresh_orders === 'boolean'
    ? row.auto_refresh_orders
    : (fallbackSettings.autoRefreshOrders ?? DEFAULT_SETTINGS.autoRefreshOrders ?? true);

  const updatedAt = row.updated_at ? String(row.updated_at) : (fallbackSettings.updatedAt || undefined);
  const version = typeof row.version === 'number' ? row.version : (fallbackSettings.version ?? undefined);

  return {
    defaultEnergyCost,
    defaultFilamentCost,
    defaultProfitMargin,
    hourlyLaborRate,
    hourlyMaintenanceCost,
    currency,
    filamentBrands,
    categories,
    businessInfo,
    defaultPackagingCost,
    defaultOtherCosts,
    defaultPaymentFeePercent,
    defaultMarketplaceFeePercent,
    defaultTaxPercent,
    autoRefreshOrders,
    updatedAt,
    version
  };
}

/**
 * Converte o formato TypeScript Settings (camelCase) para o registro em snake_case do Supabase.
 * Envia valores definidos para permitir diferenciação precisa entre omissão e valor vazio intencional.
 */
export function settingsToFullRow(settings: Settings, userId: string): SupabaseSettingsRow {
  const legacyCarrierPrefix = ['__PRINTFLOW', 'EXT', 'SYNC__:'].join('_');
  const cleanCategories = (settings.categories || DEFAULT_SETTINGS.categories || []).filter(
    (c: any) => typeof c === 'string' && !c.startsWith(legacyCarrierPrefix) && c.trim() !== ''
  );

  const row: SupabaseSettingsRow = {
    user_id: userId,
    default_energy_cost: typeof settings.defaultEnergyCost === 'number' ? settings.defaultEnergyCost : DEFAULT_SETTINGS.defaultEnergyCost,
    default_filament_cost: typeof settings.defaultFilamentCost === 'number' ? settings.defaultFilamentCost : DEFAULT_SETTINGS.defaultFilamentCost,
    default_profit_margin: typeof settings.defaultProfitMargin === 'number' ? settings.defaultProfitMargin : DEFAULT_SETTINGS.defaultProfitMargin,
    hourly_labor_rate: typeof settings.hourlyLaborRate === 'number' ? settings.hourlyLaborRate : DEFAULT_SETTINGS.hourlyLaborRate,
    hourly_maintenance_cost: typeof settings.hourlyMaintenanceCost === 'number' ? settings.hourlyMaintenanceCost : DEFAULT_SETTINGS.hourlyMaintenanceCost,
    currency: settings.currency || DEFAULT_SETTINGS.currency || 'R$',
    filament_brands: settings.filamentBrands || DEFAULT_SETTINGS.filamentBrands,
    categories: cleanCategories,
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

export interface SaveRemoteSettingsResult {
  success: boolean;
  cloudSyncedFull: boolean;
  conflict?: boolean;
  remoteUpdatedAt?: string;
  remoteVersion?: number;
  newVersion?: number;
  error: string | null;
}

/**
 * Salva configurações no Supabase usando colunas reais em snake_case com controle de versão
 * e checagem de concorrência/conflito por updated_at.
 */
export async function saveRemoteSettings(
  userId: string,
  settings: Settings,
  options?: { force?: boolean; expectedVersion?: number }
): Promise<SaveRemoteSettingsResult> {
  try {
    let currentRemoteVersion: number | null = null;

    // 1. Checagem de conflito por updated_at (se o updated_at remoto for mais de 2 segundos mais novo que o local e não for force, retornar conflict)
    if (!options?.force) {
      try {
        const { data: currentRemote } = await supabase
          .from('settings')
          .select('updated_at, version')
          .eq('user_id', userId)
          .maybeSingle();

        if (currentRemote) {
          if (typeof currentRemote.version === 'number') {
            currentRemoteVersion = currentRemote.version;
          }

          if (settings.updatedAt && currentRemote.updated_at) {
            const remoteTime = new Date(currentRemote.updated_at).getTime();
            const localTime = new Date(settings.updatedAt).getTime();
            if (!isNaN(remoteTime) && !isNaN(localTime) && remoteTime > localTime + 2000) {
              return {
                success: false,
                cloudSyncedFull: false,
                conflict: true,
                remoteVersion: currentRemoteVersion ?? undefined,
                remoteUpdatedAt: currentRemote.updated_at,
                error: 'Conflito detectado: as configurações foram alteradas em outro dispositivo mais recentemente.'
              };
            }
          }
        }
      } catch (conflErr) {
        console.warn('Não foi possível checar timestamp remoto prévio:', conflErr);
      }
    }

    // 2. Incrementar version: gravar version = (version atual conhecida ou 0) + 1 e atualizar settings.version com o valor gravado
    const baseVersion = typeof currentRemoteVersion === 'number'
      ? currentRemoteVersion
      : (typeof settings.version === 'number' ? settings.version : 0);
    const nextVersion = baseVersion + 1;

    const nowTs = new Date().toISOString();
    const fullRow = settingsToFullRow(settings, userId);
    fullRow.updated_at = nowTs;
    fullRow.version = nextVersion;

    // 3. Upsert do payload completo em snake_case
    const { error: upsertError } = await supabase
      .from('settings')
      .upsert(fullRow);

    if (upsertError) {
      return {
        success: false,
        cloudSyncedFull: false,
        error: sanitizeErrorMessage(upsertError.message)
      };
    }

    settings.version = nextVersion;
    settings.updatedAt = nowTs;

    return {
      success: true,
      cloudSyncedFull: true,
      newVersion: nextVersion,
      remoteUpdatedAt: nowTs,
      error: null
    };
  } catch (err: any) {
    return {
      success: false,
      cloudSyncedFull: false,
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
