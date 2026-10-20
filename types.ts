
export enum OrderStatus {
  PRODUCTION = 'Em produção',
  READY = 'Pronto',
  DELIVERED = 'Entregue'
}

export enum PaymentMethod {
  PIX = 'Pix',
  CASH = 'Dinheiro',
  CARD = 'Cartão'
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

export interface Part {
  id: string;
  name: string;
  category: string;
  material: string; 
  weight: number; 
  recipe: PartRecipeItem[]; 
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
  items: OrderItem[];
  discount: number;
  totalValue: number;
  status: OrderStatus;
  payments: Payment[];
  paymentMethod: PaymentMethod;
  createdAt: string;
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
}

export interface User {
  id: string;
  email: string;
}
