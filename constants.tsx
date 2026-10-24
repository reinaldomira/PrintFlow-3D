
import React from 'react';
import { LayoutDashboard, Box, Users, ShoppingBag, Settings as SettingsIcon, TrendingUp, Layers, Monitor, Archive, PackageCheck } from 'lucide-react';
import { Part, Filament, Printer, Settings, Supply } from './types';

export const NAVIGATION_ITEMS = [
  { id: 'dashboard', label: 'Início', icon: <LayoutDashboard className="w-5 h-5" />, path: '/' },
  { id: 'catalog', label: 'Peças', icon: <Box className="w-5 h-5" />, path: '/catalog' },
  { id: 'filaments', label: 'Filamentos', icon: <Layers className="w-5 h-5" />, path: '/filaments' },
  { id: 'supplies', label: 'Insumos', icon: <PackageCheck className="w-5 h-5" />, path: '/supplies' },
  { id: 'printers', label: 'Impressoras', icon: <Monitor className="w-5 h-5" />, path: '/printers' },
  { id: 'orders', label: 'Pedidos', icon: <ShoppingBag className="w-5 h-5" />, path: '/orders' },
  { id: 'history', label: 'Histórico', icon: <Archive className="w-5 h-5" />, path: '/history' },
  { id: 'customers', label: 'Clientes', icon: <Users className="w-5 h-5" />, path: '/customers' },
  { id: 'reports', label: 'Relatórios', icon: <TrendingUp className="w-5 h-5" />, path: '/reports' },
  { id: 'settings', label: 'Ajustes', icon: <SettingsIcon className="w-5 h-5" />, path: '/settings' },
];

export const MATERIALS = ['PLA', 'ABS', 'PETG', 'Resina', 'TPU', 'Nylon'];

export const SUPPLY_CATEGORIES = [
  'Chaveiros & Acessórios',
  'Ímãs & Fixação',
  'Hardware & Parafusos',
  'Eletrônica & Mecânica',
  'Embalagens & Envio',
  'Outros'
];

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export interface PartCostResult {
  // Quantidade de peças produzidas na mesma impressão / lote (mínimo 1)
  unitsPerPrint: number;

  // CUSTOS TOTAIS DO LOTE (BATCH)
  batchTotalCost: number;       // Custo total de fabricação do lote completo
  batchSuggestedPrice: number;  // Preço de venda sugerido total do lote
  batchProfit: number;          // Lucro total estimado do lote
  batchMaterialCost: number;    // Custo total de filamento do lote
  batchSuppliesCost: number;    // Custo total de insumos do lote
  batchEnergyCost: number;      // Custo total de energia do lote
  batchMaintenanceCost: number; // Custo total de manutenção da máquina no lote
  batchLaborCost: number;       // Custo de mão de obra do lote
  batchWasteCost: number;       // Custo de perda 3D do lote
  consumptionKWh: number;       // Consumo de energia em kWh do lote

  // CUSTOS E VALORES UNITÁRIOS (POR 1 PEÇA)
  unitTotalCost: number;        // Custo Unitário de Fabricação (Custo do Lote ÷ Quantidade)
  unitCost: number;             // Alias explícito para Custo Unitário de Fabricação
  unitSuggestedPrice: number;   // Preço de Venda Unitário Sugerido (com margem de lucro)
  unitProfit: number;           // Lucro Estimado por Unidade
  unitMaterialCost: number;     // Custo de filamento por unidade
  unitSuppliesCost: number;     // Custo de insumos por unidade
  unitEnergyCost: number;       // Custo de energia por unidade
  unitMaintenanceCost: number;  // Custo de manutenção por unidade
  unitLaborCost: number;        // Custo de mão de obra por unidade
  unitWasteCost: number;        // Custo de perda por unidade
  unitWeight: number;           // Peso por unidade (g)
  unitPrintTime: number;        // Tempo de impressão por unidade (h)

  // ALIASES RETROCOMPATÍVEIS PARA PEDIDOS, ORÇAMENTOS E RELATÓRIOS
  // Em pedidos e orçamentos, o sistema multiplica o custo e preço pela quantidade pedida pelo cliente.
  // Portanto, totalCost e suggestedPrice retornam os valores UNITÁRIOS da peça.
  totalCost: number;            // Custo unitário (retrocompatível)
  suggestedPrice: number;       // Preço de venda unitário (retrocompatível)
  materialCost: number;         // Custo de material unitário (retrocompatível)
  suppliesCost: number;         // Custo de insumos unitário (retrocompatível)
  energyCost: number;           // Custo de energia unitário (retrocompatível)
  maintenanceCost: number;      // Custo de manutenção unitário (retrocompatível)
  laborCost: number;            // Custo de mão de obra unitário (retrocompatível)
  wasteCost: number;            // Custo de perda unitário (retrocompatível)
}

export const calculatePartCosts = (
  part: Partial<Part>, 
  allFilaments: Filament[] = [], 
  allPrinters: Printer[] = [],
  settings: Partial<Settings> = {},
  allSupplies: Supply[] = []
): PartCostResult => {
  const energyRateKWh = settings.defaultEnergyCost || 0.85;
  const laborRate = settings.hourlyLaborRate || 0;
  const maintenanceRate = settings.hourlyMaintenanceCost || 0;

  // 0. Quantidade de peças produzidas na mesma impressão / lote (padrão: 1)
  // Previne divisão por zero, números negativos, vazios ou inválidos
  const rawUnits = Number(part.unitsPerPrint);
  const unitsPerPrint = (!isNaN(rawUnits) && rawUnits >= 1) ? Math.floor(rawUnits) : 1;

  // 1. Custo de Material (Filamentos) do Lote
  let batchMaterialCost = 0;
  let batchTotalWeight = 0;
  if (part.recipe && part.recipe.length > 0 && allFilaments.length > 0) {
    part.recipe.forEach(item => {
      // Ignora metadados embutidos
      if ((item as any)._embeddedSupplies || (item as any)._metadata || (item as any)._unitsPerPrint) return;
      const filament = allFilaments.find(f => f.id === item.filamentId);
      if (filament) {
        const costPerGram = filament.pricePaid / filament.weight;
        batchMaterialCost += (item.grams || 0) * costPerGram;
        batchTotalWeight += (item.grams || 0);
      }
    });
  } else {
    batchTotalWeight = part.weight || 0;
    batchMaterialCost = (batchTotalWeight / 1000) * (part.filamentCost || 0);
  }

  // 2. Custo de Insumos Adicionais do Lote (Argolas, Ímãs, Botões, etc.)
  let batchSuppliesCost = 0;
  if (part.supplies && part.supplies.length > 0 && allSupplies.length > 0) {
    part.supplies.forEach(item => {
      const supply = allSupplies.find(s => s.id === item.supplyId);
      if (supply) {
        batchSuppliesCost += (Number(supply.unitCost) || 0) * (Number(item.quantity) || 0);
      }
    });
  }

  // 3. Custo de Energia do Lote
  const selectedPrinter = allPrinters.find(p => p.id === part.printerId);
  const powerWatts = selectedPrinter ? selectedPrinter.power : 350;
  const powerKW = powerWatts / 1000;
  const consumptionKWh = powerKW * (part.printTime || 0);
  const batchEnergyCost = consumptionKWh * energyRateKWh;

  // 4. Custo de Manutenção / Depreciação do Lote (Horas de uso da máquina)
  const batchMaintenanceCost = (part.printTime || 0) * maintenanceRate;

  // 5. Mão de Obra do Lote (Horas humanas: fatiamento, pós-processamento, acabamento)
  const batchLaborCost = (part.postProcessingTime || 0) * laborRate;

  // 6. Custo Total de Fabricação do Lote
  // A taxa de perda (wastePercent) incide sobre o processo 3D (filamento, energia e máquina), nunca sobre insumos comprados prontos
  const printCostSubtotal = batchMaterialCost + batchEnergyCost + batchMaintenanceCost;
  const batchWasteCost = printCostSubtotal * ((part.wastePercent || 0) / 100);
  
  // Custo total do lote completo
  const batchTotalCost = printCostSubtotal + batchSuppliesCost + batchWasteCost + batchLaborCost;
  
  // Preço de venda sugerido total do lote (aplicando margem de lucro informada)
  const marginPercent = Number(part.profitMargin ?? settings.defaultProfitMargin ?? 100);
  const batchSuggestedPrice = batchTotalCost * (1 + (marginPercent / 100));
  const batchProfit = batchSuggestedPrice - batchTotalCost;

  // 7. CUSTO UNITÁRIO DE FABRICAÇÃO (Custo total do lote ÷ Quantidade de peças no lote)
  const unitTotalCost = batchTotalCost / unitsPerPrint;
  const unitSuggestedPrice = batchSuggestedPrice / unitsPerPrint;
  const unitProfit = batchProfit / unitsPerPrint;

  // Decomposição unitária proporcional
  const unitMaterialCost = batchMaterialCost / unitsPerPrint;
  const unitSuppliesCost = batchSuppliesCost / unitsPerPrint;
  const unitEnergyCost = batchEnergyCost / unitsPerPrint;
  const unitMaintenanceCost = batchMaintenanceCost / unitsPerPrint;
  const unitLaborCost = batchLaborCost / unitsPerPrint;
  const unitWasteCost = batchWasteCost / unitsPerPrint;
  const unitWeight = (part.weight || batchTotalWeight) / unitsPerPrint;
  const unitPrintTime = (part.printTime || 0) / unitsPerPrint;

  return {
    unitsPerPrint,

    // TOTAIS DO LOTE
    batchTotalCost,
    batchSuggestedPrice,
    batchProfit,
    batchMaterialCost,
    batchSuppliesCost,
    batchEnergyCost,
    batchMaintenanceCost,
    batchLaborCost,
    batchWasteCost,
    consumptionKWh,

    // VALORES UNITÁRIOS POR PEÇA
    unitTotalCost,
    unitCost: unitTotalCost,
    unitSuggestedPrice,
    unitProfit,
    unitMaterialCost,
    unitSuppliesCost,
    unitEnergyCost,
    unitMaintenanceCost,
    unitLaborCost,
    unitWasteCost,
    unitWeight,
    unitPrintTime,

    // ALIASES RETROCOMPATÍVEIS PARA ORÇAMENTOS E PEDIDOS (BASE UNITÁRIA)
    totalCost: unitTotalCost,
    suggestedPrice: unitSuggestedPrice,
    materialCost: unitMaterialCost,
    suppliesCost: unitSuppliesCost,
    energyCost: unitEnergyCost,
    maintenanceCost: unitMaintenanceCost,
    laborCost: unitLaborCost,
    wasteCost: unitWasteCost
  };
};
