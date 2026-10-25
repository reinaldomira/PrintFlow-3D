
export enum OrderStatus {
  PENDING = 'Aguardando Aprovação',
  QUEUE = 'Na Fila de Impressão',
  PRINTING = 'Imprimindo',
  PRODUCTION = 'Imprimindo', // Mantém compatibilidade com referências legadas
  FINISHING = 'Em Acabamento / Pós-cura',
  READY = 'Pronto para Envio / Retirada',
  DELIVERED = 'Entregue',
  CANCELLED = 'Cancelado'
}

export enum PaymentMethod {
  PIX = 'Pix',
  CASH = 'Dinheiro',
  CARD = 'Cartão',
  CREDIT_CARD = 'Cartão',
  DEBIT_CARD = 'Cartão de Débito'
}

export interface FinancialConfig {
  imposto: number; // % (ex: 6% MEI/Simples)
  taxaPagamento: number; // % (ex: 3.99% Cartão / 0% Pix)
  comissaoMarketplace: number; // % (ex: 18% ML / 14% Shopee)
  embalagem: number; // R$ (ex: 2.50 caixa/plástico bolha)
  outrosCustos: number; // R$ (ex: fita, adesivo, brinde)
  margemLucro: number; // % sobre o custo base (markup)
  arredondamentoComercial?: boolean;
}

export interface PricingBreakdown {
  custoProducao: number;
  embalagem: number;
  outrosCustos: number;
  custoBase: number;
  margemLucro: number;
  lucroDesejado: number;
  subtotalNecessario: number;
  totalTaxasPercentual: number;
  impostoPercentual: number;
  impostoValor: number;
  taxaPagamentoPercentual: number;
  taxaPagamentoValor: number;
  marketplacePercentual: number;
  marketplaceValor: number;
  totalTaxasValor: number;
  precoBaseVenda: number;
  descontoValor: number;
  descontoPercentual: number;
  totalFinal: number;
  precoVenda: number;
  lucroLiquido: number;
  margemEfetiva: number;
  lucroSobreCustoEfetivo: number;
  alertaPrejuizo: boolean;
  alertaMargemBaixa: boolean;
  erro?: string;
}

export interface Printer {
  id: string;
  brand: string;
  model: string;
  power: number; // em Watts
  status: 'Ativa' | 'Manutenção' | 'Inativa';
  createdAt: string;
}

export interface Filament {
  id: string;
  brand: string;
  material: string;
  colorName: string;
  colorHex: string;
  weight: number; 
  remainingWeight: number; 
  pricePaid: number; 
  createdAt: string;
}

export interface PartRecipeItem {
  filamentId: string;
  grams: number;
}

export interface PartSupplyItem {
  supplyId: string;
  quantity: number;
}

export interface Supply {
  id: string;
  user_id?: string;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  unitCost: number;
  packagePrice?: number;
  packageUnits?: number;
  supplier?: string;
  link?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Part {
  id: string;
  name: string;
  category: string;
  material: string; 
  weight: number; 
  unitsPerPrint?: number; // Quantidade de peças produzidas na mesma impressão / lote (padrão: 1)
  recipe: PartRecipeItem[]; 
  supplies?: PartSupplyItem[];
  printTime: number; 
  postProcessingTime: number; // Tempo humano gasto (slicing, acabamento, etc)
  printerId?: string;
  filamentCost: number; 
  energyCost: number; 
  wastePercent: number; 
  profitMargin: number; 
  imageUrl: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: string;
}

export interface OrderItem {
  partId: string;
  name?: string;
  quantity: number;
  unitPrice: number;
}

export interface Payment {
  id: string;
  amount: number;
  date: string;
  method: PaymentMethod;
}

export interface Order {
  id: string;
  customerId: string;
  customer_id?: string;
  items: OrderItem[];
  discount: number;
  totalValue: number;
  total_value?: number;
  status: OrderStatus;
  payments: Payment[];
  paymentMethod: PaymentMethod;
  payment_method?: string | PaymentMethod;
  paymentStatus?: 'PENDING' | 'PAID' | 'PARTIAL';
  isPaid?: boolean;
  createdAt: string;
  created_at?: string;
  custosFinanceiros?: FinancialConfig;
  detalhesPrecificacao?: PricingBreakdown;
  consumedFilaments?: Record<string, number>;
  stockDeductionStatus?: 'none' | 'confirmed' | 'partial' | 'refunded';
  stockUpdatedAt?: string;
}

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export interface BusinessInfo {
  companyName?: string;
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  email?: string;
  website?: string;
  cityState?: string;
  address?: string;
  logoUrl?: string;
  // Dados Pix para recebimento e PDFs
  pixKeyType?: PixKeyType;
  pixKey?: string;
  pixReceiverName?: string;
  pixReceiverDoc?: string; // CPF ou CNPJ do titular (opcional)
  pixBank?: string; // Instituição financeira / Banco (opcional)
  pixCity?: string; // Cidade para BR Code (opcional)
}

export interface Settings {
  defaultEnergyCost: number; // R$ por kWh
  defaultFilamentCost: number;
  defaultProfitMargin: number;
  hourlyLaborRate: number; // Valor da hora do empreendedor
  hourlyMaintenanceCost: number; // Valor reserva para manutenção/depreciação por hora de máquina
  currency: string;
  filamentBrands: string[];
  categories: string[];
  businessInfo?: BusinessInfo;
  defaultPackagingCost?: number; // Custo padrão de embalagem (R$)
  defaultOtherCosts?: number; // Outros custos fixos padrão (R$)
  defaultPaymentFeePercent?: number; // Taxa de meio de pagamento padrão (%)
  defaultMarketplaceFeePercent?: number; // Comissão de marketplace padrão (%)
  defaultTaxPercent?: number; // Impostos padrão (%)
  autoRefreshOrders?: boolean; // Atualização automática de pedidos
  updatedAt?: string; // Timestamp ISO da última atualização na nuvem/local
  version?: number; // Versão sequencial inteira (OCC / CAS) incrementada pelo banco
}

export interface User {
  id: string;
  email: string;
}

export interface PrintFailure {
  id: string;
  printerId?: string;
  printerName: string;
  reason: string;
  filamentId?: string;
  filamentName?: string;
  gramsLost: number;
  printTimeHoursLost: number;
  costLost: number;
  date: string;
  notes?: string;
}

export interface DashboardCardConfig {
  id: string;
  title: string;
  category: 'kpi' | 'pipeline' | 'charts' | 'lists' | 'widgets';
  visible: boolean;
  order: number;
}

export interface CashExpense {
  id: string;
  description: string;
  amount: number;
  category: 'energia' | 'manutencao' | 'limpeza_insumos' | 'ferramentas' | 'frete' | 'aluguel_fixo' | 'outros';
  date: string; // YYYY-MM-DD
  notes?: string;
  createdAt: string;
}

