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
  updated_at?: string | null;
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
    logoUrl: ''
  },
  defaultPackagingCost: 2.50,
  defaultOtherCosts: 0.00,
  defaultPaymentFeePercent: 3.99,
  defaultMarketplaceFeePercent: 0.00,
  defaultTaxPercent: 6.00
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
 * Converte registro snake_case do Supabase para o formato TypeScript Settings (camelCase).
 * Se o registro do banco não tiver determinada coluna (ex: schema ainda não migrado),
 * preserva o valor atual do fallbackSettings (cache local do usuário) em vez de resetar para o default.
 */
export function rowToSettings(
  row: Record<string, any> | null | undefined,
  fallbackSettings: Settings = DEFAULT_SETTINGS
): Settings {
  if (!row) return { ...fallbackSettings };

  const cloudBusiness = (row.business_info && typeof row.business_info === 'object' && Object.keys(row.business_info).length > 0)
    ? row.business_info
    : (row.businessInfo && typeof row.businessInfo === 'object' && Object.keys(row.businessInfo).length > 0)
      ? row.businessInfo
      : undefined;

  const resolvedBusiness: BusinessInfo = cloudBusiness || fallbackSettings.businessInfo || DEFAULT_SETTINGS.businessInfo!;

  return {
    defaultEnergyCost: Number(row.default_energy_cost ?? row.defaultEnergyCost ?? fallbackSettings.defaultEnergyCost ?? DEFAULT_SETTINGS.defaultEnergyCost),
    defaultFilamentCost: Number(row.default_filament_cost ?? row.defaultFilamentCost ?? fallbackSettings.defaultFilamentCost ?? DEFAULT_SETTINGS.defaultFilamentCost),
    defaultProfitMargin: Number(row.default_profit_margin ?? row.defaultProfitMargin ?? fallbackSettings.defaultProfitMargin ?? DEFAULT_SETTINGS.defaultProfitMargin),
    hourlyLaborRate: Number(row.hourly_labor_rate ?? row.hourlyLaborRate ?? fallbackSettings.hourlyLaborRate ?? DEFAULT_SETTINGS.hourlyLaborRate),
    hourlyMaintenanceCost: Number(row.hourly_maintenance_cost ?? row.hourlyMaintenanceCost ?? fallbackSettings.hourlyMaintenanceCost ?? DEFAULT_SETTINGS.hourlyMaintenanceCost),
    currency: String(row.currency || fallbackSettings.currency || DEFAULT_SETTINGS.currency),
    filamentBrands: Array.isArray(row.filament_brands) ? row.filament_brands : (Array.isArray(row.filamentBrands) ? row.filamentBrands : (fallbackSettings.filamentBrands || DEFAULT_SETTINGS.filamentBrands)),
    categories: Array.isArray(row.categories) ? row.categories : (fallbackSettings.categories || DEFAULT_SETTINGS.categories),
    businessInfo: resolvedBusiness,
    defaultPackagingCost: Number(row.default_packaging_cost ?? row.defaultPackagingCost ?? fallbackSettings.defaultPackagingCost ?? DEFAULT_SETTINGS.defaultPackagingCost),
    defaultOtherCosts: Number(row.default_other_costs ?? row.defaultOtherCosts ?? fallbackSettings.defaultOtherCosts ?? DEFAULT_SETTINGS.defaultOtherCosts),
    defaultPaymentFeePercent: Number(row.default_payment_fee_percent ?? row.defaultPaymentFeePercent ?? fallbackSettings.defaultPaymentFeePercent ?? DEFAULT_SETTINGS.defaultPaymentFeePercent),
    defaultMarketplaceFeePercent: Number(row.default_marketplace_fee_percent ?? row.defaultMarketplaceFeePercent ?? fallbackSettings.defaultMarketplaceFeePercent ?? DEFAULT_SETTINGS.defaultMarketplaceFeePercent),
    defaultTaxPercent: Number(row.default_tax_percent ?? row.defaultTaxPercent ?? fallbackSettings.defaultTaxPercent ?? DEFAULT_SETTINGS.defaultTaxPercent),
    updatedAt: row.updated_at ? String(row.updated_at) : (fallbackSettings.updatedAt || undefined)
  };
}

/**
 * Converte o formato TypeScript Settings (camelCase) para o registro em snake_case do Supabase.
 */
export function settingsToFullRow(settings: Settings, userId: string): SupabaseSettingsRow {
  return {
    user_id: userId,
    default_energy_cost: settings.defaultEnergyCost,
    default_filament_cost: settings.defaultFilamentCost,
    default_profit_margin: settings.defaultProfitMargin,
    hourly_labor_rate: settings.hourlyLaborRate,
    hourly_maintenance_cost: settings.hourlyMaintenanceCost,
    currency: settings.currency || 'R$',
    filament_brands: settings.filamentBrands || [],
    categories: settings.categories || [],
    business_info: settings.businessInfo || {},
    default_packaging_cost: settings.defaultPackagingCost ?? 2.50,
    default_other_costs: settings.defaultOtherCosts ?? 0.00,
    default_payment_fee_percent: settings.defaultPaymentFeePercent ?? 3.99,
    default_marketplace_fee_percent: settings.defaultMarketplaceFeePercent ?? 0.00,
    default_tax_percent: settings.defaultTaxPercent ?? 6.00,
    updated_at: new Date().toISOString()
  };
}

/**
 * Retorna apenas o payload estritamente compatível com as colunas já confirmadas no Supabase
 */
export function settingsToBaseRow(settings: Settings, userId: string): Record<string, any> {
  return {
    user_id: userId,
    default_energy_cost: settings.defaultEnergyCost,
    default_filament_cost: settings.defaultFilamentCost,
    default_profit_margin: settings.defaultProfitMargin,
    currency: settings.currency || 'R$',
    filament_brands: settings.filamentBrands || [],
    categories: settings.categories || []
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
  error: string | null;
}

/**
 * Salva configurações no Supabase com estratégia segura e transparente:
 * 1. Verifica concorrência/timestamp de outro dispositivo para prevenir sobrescrita acidental (conflito)
 * 2. Tenta salvar o payload completo snake_case com todas as colunas
 * 3. Se o banco remoto ainda não tiver as novas colunas (PGRST204 / 42703), salva as colunas base no Supabase
 *    e sinaliza requiresMigration: true para que o usuário seja informado com precisão.
 */
export async function saveRemoteSettings(
  userId: string,
  settings: Settings,
  options?: { force?: boolean }
): Promise<SaveRemoteSettingsResult> {
  const fullRow = settingsToFullRow(settings, userId);

  try {
    // 1. TENTATIVA PRIMÁRIA ATÔMICA: Execução via função RPC no banco (com bloqueio FOR UPDATE)
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('save_settings_atomic', {
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
            remoteUpdatedAt: rpcData.remote_updated_at,
            error: rpcData.error || 'Conflito de concorrência: o registro foi atualizado por outro dispositivo.'
          };
        }

        if (rpcData.success) {
          settings.updatedAt = rpcData.updated_at || fullRow.updated_at || new Date().toISOString();
          return {
            success: true,
            cloudSyncedFull: true,
            requiresMigration: false,
            error: null
          };
        }
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

      return {
        success: true,
        cloudSyncedFull: false,
        requiresMigration: true,
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
          isCloudStorage: false,
          notice: 'Logotipo salvo de forma compacta no cadastro. O bucket PARTS-IMAGES não possui política pública ativa.'
        };
      }
    }
  } catch (storageErr) {
    console.warn('Storage indisponível para logotipo, usando imagem compacta:', storageErr);
  }

  return {
    url: compressed.dataUrl,
    isCloudStorage: false,
    notice: 'Logotipo salvo de forma compacta no cadastro. Para hospedar na nuvem, configure o bucket PARTS-IMAGES no Supabase.'
  };
}
