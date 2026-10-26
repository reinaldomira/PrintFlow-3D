# PrintFlow 3D - Sistema de Gestão para Impressão 3D

O **PrintFlow 3D** é uma plataforma completa e moderna para gerenciamento profissional de oficinas e estúdios de impressão 3D. O sistema cobre desde a precificação precisa e o controle de estoque de filamentos até o funil de produção Kanban, simulador flash de orçamentos para WhatsApp e o fluxo de caixa real da oficina.

---

## 🚀 Principais Módulos do Sistema

### 1. 💰 Fluxo de Caixa Real da Oficina (Regime de Caixa)
Confronto financeiro direto entre o dinheiro que efetivamente entra e sai do bolso da sua oficina:
- **Entradas Realizadas:** Contabiliza exclusivamente os pedidos com pagamento liquidado/pago no mês selecionado.
- **Saídas Reais do Mês:**
  - **Carretéis Comprados:** Desembolso total na aquisição de novos rolos de filamento cadastrados no período.
  - **Insumos Adquiridos:** Compras de pacotes de ferragens, ímãs, parafusos e embalagens.
  - **Despesas Operacionais:** Lançamentos diretos de contas da oficina (energia elétrica, bicos/hotend, álcool isopropílico, ferramentas e fretes).
- **Saldo Real & Taxa de Reinvestimento:** Exibe claramente se o mês fechou em **Superávit de Caixa** ou em **Reinvestimento em Estoque** (amortizado nas próximas vendas), com barra percentual empilhada.
- **Extrato Cronológico do Mês:** Linha do tempo detalhada de todas as entradas e saídas, com filtros rápidos e exclusão de lançamentos avulsos.
- **Botão "+ Lançar Despesa da Oficina":** Modal com preenchimento em 1 clique para gastos frequentes da oficina (⚡ Conta de Luz, 🧴 Álcool Isopropílico, 🔧 Bicos & Peças, 📦 Caixas de Envio).

---

### 2. ⚡ Simulador Rápido de Orçamento (WhatsApp Flash)
Orce impressões sob medida para clientes em menos de 10 segundos, sem precisar cadastrar peças formais no catálogo:
- **Entrada Mínima:** Peso previsto (g), tempo estimado de fatiamento (h), filamento utilizado e adicionais (ímãs, parafusos, argolas).
- **Cálculo Automático:** Computa matéria-prima, energia elétrica, desgaste de máquina, margem de lucro e preço final sugerido.
- **Copiar para WhatsApp:** Gera com 1 clique o texto comercial pronto e formatado para colar na conversa com o cliente.
- **Converter em Pedido:** Transforma a cotação rápida diretamente em um pedido oficial no sistema com 1 clique.
- **Acesso Rápido:** Disponível no menu lateral, na barra superior móvel e na tela de pedidos.

---

### 3. 📊 Dashboard Gerencial Customizável
- **Filtro Mensal Dinâmico:** Navegue mês a mês com retenção de estado e botão de retorno rápido para o *Mês Atual*.
- **Indicadores Chave (Base Caixa):** Faturamento líquido recebido, lucro operacional, custos de produção e pendências a receber (`+ R$ X a receber`).
- **Funil de Produção (Pipeline Kanban):** Visão dos pedidos aguardando aprovação, na fila/impressão, prontos para envio e concluídos.
- **Panorama dos Estoques:** Métricas de capital imobilizado e alertas de estoque baixo (≤ 20%) para filamentos e insumos.
- **Gráficos Dinâmicos:** Evolução do lucro líquido nos últimos meses, composição de custos e vendas por canal (Venda Direta, Mercado Livre, Shopee, Instagram).
- **Desempenho de Impressoras:** Horas totais trabalhadas por cada máquina.
- **Personalização de Layout:** Modal para ativar, ocultar e reordenar qualquer card do painel com persistência automática por usuário.

---

### 4. 🧩 Catálogo de Peças & Calculadora de Custos
- Cadastro com upload de fotos (Supabase Storage), categoria, material e tempo de impressão.
- **Calculadora Precisa de Custos:**
  - Consumo de filamento em gramas com custo proporcional por carretel.
  - Custo de energia baseado no tempo e potência da impressora (W).
  - Depreciação e reserva técnica de manutenção por hora.
  - Mão de obra e pós-processamento (lixamento, pintura, remoção de suportes).
  - Vínculo direto de insumos e hardware (parafusos, ímãs, etc.).
  - Margem de lucro configurável com sugestão inteligente de preço de venda.

---

### 5. 🧵 Gestão de Filamentos & Estoque
- Controle de carretéis por marca, tipo de material (PLA, PETG, ABS, TPU, etc.), cor e valor pago por bobina.
- Rastreamento dinâmico de gramas consumidas e peso restante.
- Indicador visual de carretéis próximos do fim.

---

### 6. 🔩 Insumos & Componentes de Hardware
- Controle de estoque para itens não-plásticos: ímãs de neodímio, parafusos, porcas, argolas de chaveiro, rolamentos, caixas de papelão e fitas.
- Definição de quantidade mínima com alerta de reposição.
- Custo por pacote ou custo unitário com integração automática no custo das peças do catálogo.

---

### 7. 🖨️ Parque de Impressoras
- Cadastro completo de máquinas: marca, modelo e potência operacional em Watts.
- Monitoramento de status (Ativa, Imprimindo, Em Manutenção).
- Histórico de horas de impressão acumuladas por equipamento.

---

### 8. ⚠️ Controle de Falhas & Sucata
- Registro de impressões perdidas com cálculo automático do prejuízo financeiro (material perdido + energia desperdiçada + horas de máquina).
- Classificação por motivo (warping, entupimento, filamento quebrado, queda de energia, etc.).
- Relatório de prejuízo por impressora para identificar máquinas que exigem calibração.

---

### 9. 📦 Pedidos & Produção (Regime de Caixa)
- Criação e edição de pedidos vinculando clientes e peças.
- **Alternância de Pagamento em 1 Clique:** Alterne entre **Pago** e **Pendente** diretamente no card do pedido ou no formulário.
- Gestão de múltiplos itens por lote, descontos comerciais e formas de pagamento (Pix, Cartão, Dinheiro).
- Acompanhamento de status de produção e entrega.

---

### 10. 👥 Gestão de Clientes
- Cadastro de contatos (WhatsApp, e-mail), anotações e histórico completo de pedidos realizados.

---

### 11. ⚙️ Ajustes & Parâmetros da Oficina
- Custo da energia elétrica da sua distribuidora (R$/kWh).
- Custo padrão de filamento e margem de lucro padrão.
- Taxa horária de manutenção/depreciação e taxa horária de mão de obra.
- Gestão de marcas e categorias personalizadas.

---

## 📱 Instalação no Celular (PWA - Sem APK)

O PrintFlow 3D é um **Progressive Web App (PWA)** de alta performance, podendo ser instalado diretamente na tela inicial do seu smartphone:

### Vantagens do PWA:
- **Atualização Instantânea:** Qualquer melhoria publicada entra em vigor automaticamente sem necessidade de baixar novos instaladores.
- **Sincronização em Nuvem:** Dados sincronizados em tempo real entre celular, tablet e computador via Supabase.
- **Experiência Nativa:** Execução em tela cheia, sem barra de navegação de navegador e com inicialização rápida.

### Passo a passo para instalar:

#### No Android (Google Chrome):
1. Acesse o sistema pelo Chrome:
   ```
   https://ais-pre-6o6ifmeubqtiwkgfnzqd2b-87898554493.us-east1.run.app
   ```
2. Abra o menu do Chrome (três pontinhos no canto superior) e toque em **"Instalar aplicativo"** (ou **"Adicionar à tela inicial"**). Você também pode tocar no botão **"Instalar no Dispositivo"** na aba **Ajustes**.
3. O ícone do PrintFlow será fixado na sua tela inicial.

#### No iPhone / iPad (Safari):
1. Abra o link do aplicativo no **Safari**.
2. Toque no botão de **Compartilhar** (ícone quadrado com a seta para cima).
3. Role até a opção **"Adicionar à Tela de Início"** e confirme em **"Adicionar"**.

---

## 🗄️ Estrutura do Banco de Dados (Supabase)

O PrintFlow 3D utiliza o **Supabase** (PostgreSQL & Row-Level Security) para autenticação e armazenamento persistente.

### Script SQL para criação das tabelas:

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

-- 3. TABELA DE INSUMOS & HARDWARE
CREATE TABLE IF NOT EXISTS public.supplies (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    category text DEFAULT 'Ferragens',
    quantity numeric DEFAULT 0,
    "minQuantity" numeric DEFAULT 10,
    "unitCost" numeric DEFAULT 0,
    "packagePrice" numeric,
    "packageUnits" numeric,
    supplier text,
    link text,
    notes text,
    "createdAt" timestamptz DEFAULT now(),
    "updatedAt" timestamptz DEFAULT now()
);

-- 4. TABELA DE PEÇAS / CATÁLOGO
CREATE TABLE IF NOT EXISTS public.parts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    category text,
    material text DEFAULT 'PLA',
    weight numeric DEFAULT 0,
    "unitsPerPrint" numeric DEFAULT 1,
    "printTime" numeric DEFAULT 0,
    "postProcessingTime" numeric DEFAULT 0,
    "printerId" text,
    "filamentCost" numeric,
    "energyCost" numeric,
    "wastePercent" numeric DEFAULT 5,
    "profitMargin" numeric DEFAULT 100,
    recipe jsonb DEFAULT '[]'::jsonb,
    supplies jsonb DEFAULT '[]'::jsonb,
    "imageUrl" text,
    "createdAt" timestamptz DEFAULT now(),
    "updatedAt" timestamptz DEFAULT now()
);

-- 5. TABELA DE PEDIDOS
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

-- 6. TABELA DE CONFIGURAÇÕES DO USUÁRIO
CREATE TABLE IF NOT EXISTS public.settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    "defaultEnergyCost" numeric DEFAULT 0.85,
    "defaultFilamentCost" numeric DEFAULT 120,
    "defaultProfitMargin" numeric DEFAULT 100,
    "hourlyLaborRate" numeric DEFAULT 25,
    "hourlyMaintenanceCost" numeric DEFAULT 1.5,
    "filamentBrands" text[] DEFAULT ARRAY['3D Prime', 'Creality', 'Voolt3D', 'Bambu Lab'],
    categories text[] DEFAULT ARRAY['Chaveiro', 'Organizador', 'Decoração', 'Engenharia', 'Action Figure'],
    "updatedAt" timestamptz DEFAULT now()
);

-- 7. TABELA DE CLIENTES
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    notes text,
    "createdAt" timestamptz DEFAULT now()
);
```

### Configuração de Fotos (Supabase Storage)
Para habilitar o upload de imagens das peças do catálogo:
1. No painel do seu projeto Supabase, acesse **Storage**.
2. Crie um novo bucket público chamado **`PARTS-IMAGES`** (marcando a opção *Public bucket*).

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

1. Clone o repositório ou descompacte o projeto:
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

4. Acesse no navegador:
   ```
   http://localhost:3000
   ```

5. Para gerar o build de produção:
   ```bash
   npm run build
   ```
