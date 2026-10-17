# PrintFlow 3D - Sistema de Gestão para Impressão 3D

O **PrintFlow 3D** é uma plataforma completa e moderna para gerenciamento de oficinas e estúdios de impressão 3D, cobrindo desde a precificação precisa de peças até o controle de filamentos, impressoras, clientes, pedidos e fluxo de caixa.

---

## 🚀 Principais Módulos do Sistema

### 1. 📊 Dashboard
- Indicadores visuais de faturamento, pedidos ativos e custos de produção.
- Visão rápida da fila de produção e status de impressoras.

### 2. 🧩 Catálogo de Peças & Calculadora de Custos
- Cadastro completo de peças 3D com foto, categoria e material (PLA, ABS, PETG, etc.).
- Calculadora integrada de custos:
  - Consumo de filamento (peso em gramas e custo proporcional).
  - Custo de energia elétrica baseado no tempo de impressão e potência da impressora.
  - Custo de mão de obra e pós-processamento (lixamento, pintura, suportes).
  - Margem de lucro configurável com sugestão automática de preço de venda.

### 3. 🧵 Gestão de Filamentos & Estoque
- Controle de carretéis por marca, tipo de material, cor e valor pago por kg.
- Rastreamento em tempo real do peso restante em cada carretel.

### 4. 🖨️ Gestão de Impressoras
- Cadastro do parque de máquinas (marca, modelo e potência em Watts).
- Monitoramento do status operacional (Ativa, Imprimindo, Em Manutenção).

### 5. 👥 Clientes
- Cadastro de contatos, histórico de compras e preferências de pedidos.

### 6. 📦 Pedidos & Produção
- Criação ágil de pedidos vinculados a clientes.
- Seleção de múltiplas peças com quantidades personalizadas.
- Aplicação de descontos, controle de pagamentos e acompanhamento das etapas (Na fila, Em produção, Concluído, Entregue).

### 7. 📈 Relatórios & Gráficos
- Métricas financeiras e gráficos dinâmicos de faturamento, peças mais vendidas e consumo de insumos.

### 8. ⚙️ Configurações & Sincronização Cloud
- Definição de taxas horárias de mão de obra e manutenção.
- Custo padrão de energia elétrica (R$/kWh) e filamentos.
- Gerenciamento de marcas e categorias personalizadas.

---

## 📱 Instalação no Celular (PWA - Sem APK)

O PrintFlow é um **Progressive Web App (PWA)**, o que significa que você pode instalá-lo diretamente no seu smartphone sem precisar de Android Studio ou arquivos APK manuais.

### Vantagens do PWA:
- **Atualização Automática:** Qualquer melhoria feita no sistema entra em vigor no seu celular imediatamente ao reabrir o app.
- **Sincronização em Nuvem:** Dados sincronizados em tempo real entre celular e computador através do Supabase.
- **Aparência Nativa:** Executa em tela cheia, sem barra de navegação do navegador.

### Passo a passo para instalar:

#### No Android (Google Chrome):
1. Abra a URL do app no Chrome do celular:
   ```
   https://ais-pre-6o6ifmeubqtiwkgfnzqd2b-87898554493.us-east1.run.app
   ```
2. Toque no botão verde **"Instalar App"** na parte superior da tela ou abra o menu do Chrome (três pontinhos no canto superior direito).
3. Selecione **"Instalar aplicativo"** (ou **"Adicionar à tela inicial"**).
4. O ícone do PrintFlow será adicionado à sua tela inicial.

#### No iPhone / iPad (Safari):
1. Abra a URL do app no Safari.
2. Toque no botão de **Compartilhar** (ícone quadrado com uma seta para cima).
3. Role o menu para baixo e selecione **"Adicionar à Tela de Início"**.
4. Toque em **"Adicionar"** no canto superior direito.

---

## 🗄️ Estrutura do Banco de Dados (Supabase)

O sistema utiliza o **Supabase** para autenticação e armazenamento de dados em tempo real.

### Script SQL para criação das tabelas

Acesse o **SQL Editor** no painel do seu projeto Supabase e execute o seguinte script:

```sql
-- 1. TABELA DE FILAMENTOS
CREATE TABLE IF NOT EXISTS public.filaments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    brand text,
    material text,
    "colorName" text,
    "colorHex" text DEFAULT '#10b981',
    weight numeric DEFAULT 1000,
    "remainingWeight" numeric DEFAULT 1000,
    "pricePaid" numeric DEFAULT 120,
    "createdAt" timestamptz DEFAULT now()
);

-- 2. TABELA DE IMPRESSORAS
CREATE TABLE IF NOT EXISTS public.printers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    brand text,
    model text,
    power numeric DEFAULT 350,
    status text DEFAULT 'Ativa',
    "createdAt" timestamptz DEFAULT now()
);

-- 3. TABELA DE PEÇAS / CATÁLOGO
CREATE TABLE IF NOT EXISTS public.parts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    category text,
    material text DEFAULT 'PLA',
    weight numeric DEFAULT 0,
    "printTime" numeric DEFAULT 0,
    "postProcessingTime" numeric DEFAULT 0,
    "filamentCost" numeric,
    "energyCost" numeric,
    "wastePercent" numeric DEFAULT 5,
    "profitMargin" numeric DEFAULT 100,
    recipe jsonb DEFAULT '[]'::jsonb,
    "imageUrl" text,
    "createdAt" timestamptz DEFAULT now(),
    "updatedAt" timestamptz DEFAULT now()
);

-- 4. TABELA DE PEDIDOS
CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    "customerId" uuid,
    items jsonb DEFAULT '[]'::jsonb,
    "totalValue" numeric NOT NULL DEFAULT 0,
    status text DEFAULT 'Em produção',
    discount numeric DEFAULT 0,
    payments jsonb DEFAULT '[]'::jsonb,
    "paymentMethod" text,
    "createdAt" timestamptz DEFAULT now()
);

-- 5. TABELA DE CONFIGURAÇÕES DO USUÁRIO
CREATE TABLE IF NOT EXISTS public.settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    "defaultEnergyCost" numeric DEFAULT 0.85,
    "defaultFilamentCost" numeric DEFAULT 120,
    "defaultProfitMargin" numeric DEFAULT 100,
    "hourlyLaborRate" numeric DEFAULT 25,
    "hourlyMaintenanceCost" numeric DEFAULT 1.5,
    "filamentBrands" text[] DEFAULT ARRAY['3D Prime', 'Creality'],
    categories text[] DEFAULT ARRAY['Chaveiro', 'Organizador', 'Decoração']
);
```

### Configuração de Fotos (Supabase Storage)
Para upload de fotos das peças no catálogo:
1. Acesse o menu **Storage** no seu painel Supabase.
2. Crie um novo bucket chamado **`PARTS-IMAGES`**.
3. Marque a opção **Public bucket** para permitir que as fotos sejam carregadas no aplicativo.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Estilização:** [Tailwind CSS](https://tailwindcss.com/)
- **Ícones:** [Lucide React](https://lucide.dev/)
- **Gráficos:** [Recharts](https://recharts.org/)
- **Backend / Database:** [Supabase](https://supabase.com/) (PostgreSQL & Auth)
- **App Móvel:** Progressive Web App (PWA) com Service Worker e Web App Manifest

---

## 💻 Como Rodar Localmente

1. Clone o repositório ou descompacte os arquivos:
   ```bash
   cd printflow
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Abra no navegador:
   ```
   http://localhost:3000
   ```

5. Para gerar a versão de produção:
   ```bash
   npm run build
   ```
