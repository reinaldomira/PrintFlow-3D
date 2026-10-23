
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

export const calculatePartCosts = (
  part: Partial<Part>, 
  allFilaments: Filament[] = [], 
  allPrinters: Printer[] = [],
  settings: Partial<Settings> = {},
  allSupplies: Supply[] = []
) => {
  const energyRateKWh = settings.defaultEnergyCost || 0.85;
  const laborRate = settings.hourlyLaborRate || 0;
  const maintenanceRate = settings.hourlyMaintenanceCost || 0;

  // 1. Custo de Material (Filamentos)
  let materialCost = 0;
  if (part.recipe && part.recipe.length > 0 && allFilaments.length > 0) {
    part.recipe.forEach(item => {
      const filament = allFilaments.find(f => f.id === item.filamentId);
      if (filament) {
        const costPerGram = filament.pricePaid / filament.weight;
        materialCost += item.grams * costPerGram;
      }
    });
  } else {
    materialCost = ((part.weight || 0) / 1000) * (part.filamentCost || 0);
  }

  // 2. Custo de Insumos Adicionais (Argolas, Ímãs, Botões, etc.)
  let suppliesCost = 0;
  if (part.supplies && part.supplies.length > 0 && allSupplies.length > 0) {
    part.supplies.forEach(item => {
      const supply = allSupplies.find(s => s.id === item.supplyId);
      if (supply) {
        suppliesCost += (Number(supply.unitCost) || 0) * (Number(item.quantity) || 0);
      }
    });
  }

  // 3. Custo de Energia
  const selectedPrinter = allPrinters.find(p => p.id === part.printerId);
  const powerWatts = selectedPrinter ? selectedPrinter.power : 350;
  const powerKW = powerWatts / 1000;
  const consumptionKWh = powerKW * (part.printTime || 0);
  const energyCostValue = consumptionKWh * energyRateKWh;

  // 4. Custo de Manutenção / Depreciação (Horas de uso da máquina)
  const maintenanceCostValue = (part.printTime || 0) * maintenanceRate;

  // 5. Mão de Obra (Horas humanas: fatiamento, pós-processamento, montagem, embalagem)
  const laborCostValue = (part.postProcessingTime || 0) * laborRate;

  // 6. Totais e Margens
  const productionSubtotal = materialCost + suppliesCost + energyCostValue + maintenanceCostValue;
  const wasteCost = productionSubtotal * ((part.wastePercent || 0) / 100);
  
  const totalCost = productionSubtotal + wasteCost + laborCostValue;
  const suggestedPrice = totalCost * (1 + ((part.profitMargin || 0) / 100));

  return {
    materialCost,
    suppliesCost,
    energyCost: energyCostValue,
    maintenanceCost: maintenanceCostValue,
    laborCost: laborCostValue,
    consumptionKWh,
    wasteCost,
    totalCost,
    suggestedPrice
  };
};
