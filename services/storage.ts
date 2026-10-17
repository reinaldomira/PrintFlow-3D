
/**
 * Simple mock storage for a demo app using LocalStorage.
 * In a real scenario, this would interface with Supabase/Firebase.
 */

const STORAGE_KEY = 'printflow_data_v2';

export const getStoredData = () => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : {
    parts: [],
    customers: [],
    orders: [],
    filaments: [],
    printers: [],
    settings: {
      defaultEnergyCost: 0.85,
      defaultFilamentCost: 120,
      defaultProfitMargin: 100,
      hourlyLaborRate: 25.00, // Ex: R$ 25,00 por hora de trabalho humano
      hourlyMaintenanceCost: 1.50, // Ex: R$ 1,50 reserva por hora de máquina
      currency: 'R$',
      filamentBrands: ['3D Prime', 'Creality', 'Voolt3D', 'GTMax'],
      categories: ['Chaveiro', 'Organizador', 'Decoração', 'Suporte', 'Action Figure', 'Outros']
    },
    user: null
  };
};

export const saveData = (data: any) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};
