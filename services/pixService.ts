import QRCode from 'qrcode';
import { BusinessInfo } from '../types';

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export interface PixConfig {
  keyType: PixKeyType;
  key: string;
  receiverName: string;
  receiverDoc?: string;
  bank?: string;
  city?: string;
}

export interface PixPayloadResult {
  isValid: boolean;
  error?: string;
  payload?: string;
  qrCodeDataUrl?: string;
  formattedKey?: string;
  cleanKey?: string;
}

/**
 * Remove acentos e caracteres não-ASCII (exigência estrita do BACEN para o BR Code)
 */
export function removeAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-_.,@]/g, '')
    .trim();
}

/**
 * Formata um TLV (Tag-Length-Value) para a especificação EMV / BACEN Pix
 */
function formatTlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * Calcula o CRC-16/CCITT-FALSE (Polinômio 0x1021, Init 0xFFFF)
 * conforme a especificação do Banco Central do Brasil para o BR Code.
 */
export function calculateCrc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Higieniza a chave Pix de acordo com o tipo para o payload do BACEN
 */
export function sanitizePixKey(key: string, type: PixKeyType): string {
  const clean = key.trim();
  switch (type) {
    case 'cpf':
      return clean.replace(/\D/g, '').slice(0, 11);
    case 'cnpj':
      return clean.replace(/\D/g, '').slice(0, 14);
    case 'phone': {
      const digits = clean.replace(/\D/g, '');
      // Se não tiver o prefixo internacional +55, adiciona
      if (digits.startsWith('55') && digits.length >= 12) {
        return `+${digits}`;
      }
      return `+55${digits}`;
    }
    case 'email':
      return clean.toLowerCase();
    case 'random':
      return clean;
    default:
      return clean;
  }
}

/**
 * Formata a chave para exibição legível na interface e no PDF
 */
export function formatPixKeyForDisplay(key: string, type: PixKeyType): string {
  const trimmed = key.trim();
  if (!trimmed) return '';

  switch (type) {
    case 'cpf': {
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length === 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      }
      return trimmed;
    }
    case 'cnpj': {
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length === 14) {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
      }
      return trimmed;
    }
    case 'phone': {
      const digits = trimmed.replace(/\D/g, '');
      const raw = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
      if (raw.length === 11) {
        return raw.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
      } else if (raw.length === 10) {
        return raw.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
      }
      return trimmed;
    }
    case 'email':
      return trimmed.toLowerCase();
    case 'random':
    default:
      return trimmed;
  }
}

/**
 * Rótulo amigável em português para o tipo de chave Pix
 */
export function getPixKeyTypeLabel(type?: PixKeyType | string): string {
  switch (type) {
    case 'cpf':
      return 'CPF';
    case 'cnpj':
      return 'CNPJ';
    case 'email':
      return 'E-mail';
    case 'phone':
      return 'Telefone (Celular)';
    case 'random':
      return 'Chave Aleatória (EVP)';
    default:
      return 'Chave Pix';
  }
}

/**
 * Valida a chave Pix de acordo com o seu tipo
 */
export function validatePixKey(key: string, type: PixKeyType): { isValid: boolean; message?: string } {
  const clean = key.trim();
  if (!clean) {
    return { isValid: false, message: 'A chave Pix não pode estar vazia.' };
  }

  switch (type) {
    case 'cpf': {
      const digits = clean.replace(/\D/g, '');
      if (digits.length !== 11) {
        return { isValid: false, message: 'CPF inválido: deve conter exatamente 11 dígitos.' };
      }
      return { isValid: true };
    }
    case 'cnpj': {
      const digits = clean.replace(/\D/g, '');
      if (digits.length !== 14) {
        return { isValid: false, message: 'CNPJ inválido: deve conter exatamente 14 dígitos.' };
      }
      return { isValid: true };
    }
    case 'phone': {
      const digits = clean.replace(/\D/g, '');
      const localDigits = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
      if (localDigits.length < 10 || localDigits.length > 11) {
        return { isValid: false, message: 'Telefone inválido: informe DDD + número (10 ou 11 dígitos).' };
      }
      return { isValid: true };
    }
    case 'email': {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(clean)) {
        return { isValid: false, message: 'E-mail inválido para chave Pix.' };
      }
      return { isValid: true };
    }
    case 'random': {
      if (clean.length < 15) {
        return { isValid: false, message: 'Chave aleatória inválida ou muito curta.' };
      }
      return { isValid: true };
    }
    default:
      return { isValid: true };
  }
}

/**
 * Extrai nome de cidade limpo e válido a partir de cityState ou fallback
 */
export function resolvePixCity(cityState?: string, customCity?: string): string {
  if (customCity && customCity.trim()) {
    const clean = removeAccents(customCity).toUpperCase().slice(0, 15);
    if (clean) return clean;
  }
  if (cityState && cityState.trim()) {
    // Ex: "São Paulo - SP" -> "SAO PAULO"
    const firstPart = cityState.split('-')[0].split('/')[0].trim();
    const clean = removeAccents(firstPart).toUpperCase().slice(0, 15);
    if (clean) return clean;
  }
  return 'SAO PAULO';
}

/**
 * Gera o payload oficial do Pix (BR Code estático do Banco Central do Brasil)
 * Compatível com todos os bancos e carteiras digitais brasileiras.
 */
export function generatePixBrCodePayload(options: {
  pixKey: string;
  pixKeyType: PixKeyType;
  receiverName: string;
  amount?: number;
  city?: string;
  txId?: string;
  description?: string;
}): { isValid: boolean; payload?: string; error?: string } {
  const { pixKey, pixKeyType, receiverName, amount, city, txId, description } = options;

  if (!pixKey || !pixKey.trim()) {
    return { isValid: false, error: 'Chave Pix não fornecida.' };
  }

  const keyValidation = validatePixKey(pixKey, pixKeyType);
  if (!keyValidation.isValid) {
    return { isValid: false, error: keyValidation.message };
  }

  const cleanKey = sanitizePixKey(pixKey, pixKeyType);
  
  // Nome do recebedor (BACEN: max 25 caracteres, maiúsculas, sem acentos)
  const cleanName = removeAccents(receiverName || 'PRINT 3DBR')
    .toUpperCase()
    .slice(0, 25);

  if (!cleanName) {
    return { isValid: false, error: 'Nome do titular não fornecido.' };
  }

  // Cidade (BACEN: max 15 caracteres, maiúsculas, sem acentos)
  const cleanCity = removeAccents(city || 'SAO PAULO')
    .toUpperCase()
    .slice(0, 15) || 'SAO PAULO';

  // Sub-campos da Tag 26 (Merchant Account Information)
  // 00: GUI (br.gov.bcb.pix)
  // 01: Chave Pix
  // 02: Descrição adicional (opcional, max 25 chars)
  let merchantAccountInfo = formatTlv('00', 'br.gov.bcb.pix') + formatTlv('01', cleanKey);
  if (description) {
    const cleanDesc = removeAccents(description).slice(0, 25);
    if (cleanDesc) {
      merchantAccountInfo += formatTlv('02', cleanDesc);
    }
  }

  // TxId no campo 62 (Additional Data Field Template)
  // Sub-campo 05: Reference Label (TxId). Se não houver, o padrão BACEN para estático é '***'
  const cleanTxId = txId ? removeAccents(txId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) : '***';
  const additionalDataField = formatTlv('05', cleanTxId || '***');

  // Montagem do payload EMV
  let payload = '';
  // 00 - Payload Format Indicator (fixo '01')
  payload += formatTlv('00', '01');
  // 01 - Point of Initiation Method ('12' = QR estático reutilizável ou com valor)
  payload += formatTlv('01', '12');
  // 26 - Merchant Account Information
  payload += formatTlv('26', merchantAccountInfo);
  // 52 - Merchant Category Code ('0000' = geral)
  payload += formatTlv('52', '0000');
  // 53 - Transaction Currency ('986' = BRL)
  payload += formatTlv('53', '986');

  // 54 - Transaction Amount (opcional, formato 0.00 com ponto)
  if (typeof amount === 'number' && amount > 0 && !isNaN(amount)) {
    const amountStr = amount.toFixed(2);
    payload += formatTlv('54', amountStr);
  }

  // 58 - Country Code ('BR')
  payload += formatTlv('58', 'BR');
  // 59 - Merchant Name
  payload += formatTlv('59', cleanName);
  // 60 - Merchant City
  payload += formatTlv('60', cleanCity);
  // 62 - Additional Data Field Template
  payload += formatTlv('62', additionalDataField);

  // 63 - CRC16 (Calculado sobre o payload concatenado com '6304')
  const payloadToCrc = `${payload}6304`;
  const crc = calculateCrc16(payloadToCrc);
  const fullPayload = `${payloadToCrc}${crc}`;

  return {
    isValid: true,
    payload: fullPayload
  };
}

/**
 * Gera a imagem Data URL do QR Code Pix em alta resolução para renderização no PDF e visualização na UI
 */
export async function generatePixQrCodeDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    margin: 1,
    width: 256,
    color: {
      dark: '#0B0F19',
      light: '#FFFFFF'
    }
  });
}

/**
 * Helper unificado para obter payload e QR code completos a partir de BusinessInfo e valor do pedido
 */
export async function getCompletePixData(
  businessInfo?: BusinessInfo | null,
  amount?: number,
  orderRef?: string
): Promise<PixPayloadResult> {
  if (!businessInfo) {
    return { isValid: false, error: 'Configurações da empresa não encontradas.' };
  }

  const { pixKey, pixKeyType = 'cpf', pixReceiverName, pixCity, cityState, companyName } = businessInfo;

  if (!pixKey || !pixKey.trim()) {
    return { isValid: false, error: 'Chave Pix da empresa não cadastrada.' };
  }

  const receiverName = pixReceiverName || companyName || 'PRINT 3DBR';
  const resolvedCity = resolvePixCity(cityState, pixCity);
  const cleanTxId = orderRef ? orderRef.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) : '***';

  const brCodeResult = generatePixBrCodePayload({
    pixKey,
    pixKeyType,
    receiverName,
    amount,
    city: resolvedCity,
    txId: cleanTxId,
    description: orderRef ? `PEDIDO ${orderRef}` : undefined
  });

  if (!brCodeResult.isValid || !brCodeResult.payload) {
    return {
      isValid: false,
      error: brCodeResult.error || 'Erro ao estruturar o payload do Pix.',
      formattedKey: formatPixKeyForDisplay(pixKey, pixKeyType),
      cleanKey: sanitizePixKey(pixKey, pixKeyType)
    };
  }

  try {
    const qrCodeDataUrl = await generatePixQrCodeDataUrl(brCodeResult.payload);
    return {
      isValid: true,
      payload: brCodeResult.payload,
      qrCodeDataUrl,
      formattedKey: formatPixKeyForDisplay(pixKey, pixKeyType),
      cleanKey: sanitizePixKey(pixKey, pixKeyType)
    };
  } catch (err: any) {
    console.warn('Falha ao converter QR Code para imagem:', err);
    return {
      isValid: true,
      payload: brCodeResult.payload,
      formattedKey: formatPixKeyForDisplay(pixKey, pixKeyType),
      cleanKey: sanitizePixKey(pixKey, pixKeyType),
      error: 'Não foi possível gerar a imagem visual do QR Code, mas a chave Pix é válida.'
    };
  }
}

/**
 * Verifica se a forma de pagamento selecionada corresponde a Pix (case-insensitive)
 */
export function isPixPaymentMethod(method?: string | null): boolean {
  if (!method) return false;
  const normalized = method.trim().toLowerCase();
  return normalized === 'pix' || normalized.includes('pix');
}
