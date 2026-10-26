import { Order, OrderStatus } from '../types';

export interface StatusConfig {
  key: OrderStatus;
  label: string;
  shortLabel: string;
  emoji: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  badgeClass: string;
  description: string;
  isFaturado: boolean;
  stepOrder: number;
}

export const STATUS_LIST: StatusConfig[] = [
  {
    key: OrderStatus.PENDING,
    label: 'Aguardando Aprovação',
    shortLabel: 'Aguardando',
    emoji: '🟡',
    bgColor: 'bg-amber-500/15',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    description: 'Orçamento enviado ao cliente, aguardando aprovação ou sinal.',
    isFaturado: false,
    stepOrder: 1,
  },
  {
    key: OrderStatus.QUEUE,
    label: 'Na Fila de Impressão',
    shortLabel: 'Na Fila',
    emoji: '🔵',
    bgColor: 'bg-blue-500/15',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    description: 'Pedido aprovado no sistema e aguardando fatiamento ou máquina livre.',
    isFaturado: true,
    stepOrder: 2,
  },
  {
    key: OrderStatus.PRINTING,
    label: 'Imprimindo',
    shortLabel: 'Imprimindo',
    emoji: '⚙️',
    bgColor: 'bg-cyan-500/15',
    textColor: 'text-cyan-400',
    borderColor: 'border-cyan-500/30',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    description: 'Peças em processo de manufatura aditiva ativa na impressora 3D.',
    isFaturado: true,
    stepOrder: 3,
  },
  {
    key: OrderStatus.FINISHING,
    label: 'Em Acabamento / Pós-cura',
    shortLabel: 'Acabamento',
    emoji: '🛠️',
    bgColor: 'bg-orange-500/15',
    textColor: 'text-orange-400',
    borderColor: 'border-orange-500/30',
    badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    description: 'Remoção de suportes, lixamento, banho químico, cura UV ou montagem.',
    isFaturado: true,
    stepOrder: 4,
  },
  {
    key: OrderStatus.READY,
    label: 'Pronto para Envio / Retirada',
    shortLabel: 'Pronto',
    emoji: '📦',
    bgColor: 'bg-teal-500/15',
    textColor: 'text-teal-400',
    borderColor: 'border-teal-500/30',
    badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    description: 'Peça conferida, higienizada, embalada e pronta para retirada ou postagem.',
    isFaturado: true,
    stepOrder: 5,
  },
  {
    key: OrderStatus.DELIVERED,
    label: 'Entregue',
    shortLabel: 'Entregue',
    emoji: '✅',
    bgColor: 'bg-emerald-500/15',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    description: 'Pedido finalizado e entregue ao cliente ou postado com rastreio.',
    isFaturado: true,
    stepOrder: 6,
  },
  {
    key: OrderStatus.CANCELLED,
    label: 'Cancelado',
    shortLabel: 'Cancelado',
    emoji: '❌',
    bgColor: 'bg-red-500/15',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/30',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
    description: 'Pedido cancelado comercialmente ou tecnicamente.',
    isFaturado: false,
    stepOrder: 99,
  }
];

/**
 * Normaliza status legados salvos no Supabase (ex: 'Em produção', 'pendente', 'aprovado')
 */
export function normalizeOrderStatus(status?: string | OrderStatus): OrderStatus {
  if (!status) return OrderStatus.QUEUE;

  const s = String(status).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove acentos para matching

  if (s === 'em producao' || s === 'imprimindo' || s === 'producao') return OrderStatus.PRINTING;
  if (s === 'aguardando aprovacao' || s === 'aguardando' || s === 'pendente' || s === 'orcamento pendente') return OrderStatus.PENDING;
  if (s === 'na fila de impressao' || s === 'na fila' || s === 'fila' || s === 'na_fila' || s === 'aprovado') return OrderStatus.QUEUE;
  if (s === 'em acabamento' || s === 'acabamento' || s === 'em acabamento / pos-cura' || s === 'pos-cura' || s === 'pos cura') return OrderStatus.FINISHING;
  if (s === 'pronto' || s === 'pronto para envio / retirada' || s === 'pronto para envio' || s === 'pronto para retirada') return OrderStatus.READY;
  if (s === 'entregue' || s === 'finalizado') return OrderStatus.DELIVERED;
  if (s === 'cancelado') return OrderStatus.CANCELLED;

  return (status as OrderStatus) || OrderStatus.QUEUE;
}

/**
 * Obtém configuração visual completa para qualquer status
 */
export function getStatusConfig(status?: string | OrderStatus): StatusConfig {
  const normalized = normalizeOrderStatus(status);
  const found = STATUS_LIST.find(s => s.key === normalized);
  return found || STATUS_LIST[1]; // default: Na Fila
}

/**
 * Verifica se um status é ativo na fábrica (não finalizado e não cancelado)
 */
export function isOrderActive(status?: string | OrderStatus): boolean {
  const normalized = normalizeOrderStatus(status);
  return normalized !== OrderStatus.DELIVERED && normalized !== OrderStatus.CANCELLED;
}

/**
 * Determina se o pedido está com pagamento confirmado (Faturamento Realizado)
 * Regime de Caixa: pedidos pagos entram em Faturamento Realizado.
 * Pedidos pendentes entram em "A Receber / Em Aberto".
 * Pedidos cancelados nunca entram no faturamento.
 */
export function isOrderPaid(order?: Order | null): boolean {
  if (!order) return false;
  const normalized = normalizeOrderStatus(order.status);
  if (normalized === OrderStatus.CANCELLED) return false;
  if (order.paymentStatus === 'PAID' || order.isPaid === true) return true;
  return false;
}

