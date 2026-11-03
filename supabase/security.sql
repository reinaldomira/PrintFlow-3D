-- ==============================================================================
-- PRINTFLOW 3D — POLÍTICAS DE ROW LEVEL SECURITY (RLS) E ISOLAMENTO MULTI-TENANT
-- 
-- Arquivo: supabase/security.sql
-- Instruções:
--   Copie e cole este script no SQL Editor do painel do Supabase (Dashboard > SQL Editor)
--   e clique em "Run" para aplicar o isolamento estrito em todas as tabelas.
--
-- Otimizações e Garantias:
--   - Usa `user_id = (SELECT auth.uid())` em USING e WITH CHECK, permitindo que o
--     PostgreSQL execute a resolução de usuário em tempo constante via subquery memoizada.
--   - RLS ativo e forçado para impedir vazamento de dados entre diferentes usuários/oficinas.
--   - Criação de índices B-Tree em `user_id` para acelerar todas as consultas filtradas.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABELA: filaments (Estoque de Filamentos / Carretéis)
-- ==============================================================================
ALTER TABLE public.filaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filaments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows" ON public.filaments;
DROP POLICY IF EXISTS "filaments_isolation_policy" ON public.filaments;

CREATE POLICY "own rows" ON public.filaments
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_filaments_user_id ON public.filaments(user_id);


-- ==============================================================================
-- 2. TABELA: printers (Parque de Impressoras 3D)
-- ==============================================================================
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows" ON public.printers;
DROP POLICY IF EXISTS "printers_isolation_policy" ON public.printers;

CREATE POLICY "own rows" ON public.printers
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_printers_user_id ON public.printers(user_id);


-- ==============================================================================
-- 3. TABELA: supplies (Insumos Adicionais / Ferragens / Embalagens)
-- ==============================================================================
ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows" ON public.supplies;
DROP POLICY IF EXISTS "supplies_isolation_policy" ON public.supplies;

CREATE POLICY "own rows" ON public.supplies
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_supplies_user_id ON public.supplies(user_id);


-- ==============================================================================
-- 4. TABELA: parts (Catálogo de Peças e Receitas de Custos)
-- ==============================================================================
ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows" ON public.parts;
DROP POLICY IF EXISTS "parts_isolation_policy" ON public.parts;

CREATE POLICY "own rows" ON public.parts
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_parts_user_id ON public.parts(user_id);


-- ==============================================================================
-- 5. TABELA: orders (Pedidos, Orçamentos e Controle de Produção)
-- ==============================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows" ON public.orders;
DROP POLICY IF EXISTS "orders_isolation_policy" ON public.orders;

CREATE POLICY "own rows" ON public.orders
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);


-- ==============================================================================
-- 6. TABELA: customers (Cadastro de Clientes da Oficina)
-- ==============================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows" ON public.customers;
DROP POLICY IF EXISTS "customers_isolation_policy" ON public.customers;

CREATE POLICY "own rows" ON public.customers
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);


-- ==============================================================================
-- 7. TABELA: cash_expenses (Despesas Operacionais do Fluxo de Caixa)
-- ==============================================================================
ALTER TABLE public.cash_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_expenses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows" ON public.cash_expenses;
DROP POLICY IF EXISTS "cash_expenses_isolation_policy" ON public.cash_expenses;

CREATE POLICY "own rows" ON public.cash_expenses
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_cash_expenses_user_id ON public.cash_expenses(user_id);


-- ==============================================================================
-- 8. TABELA: failures (Controle de Sucata e Falhas de Impressão)
-- ==============================================================================
ALTER TABLE public.failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failures FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows" ON public.failures;
DROP POLICY IF EXISTS "failures_isolation_policy" ON public.failures;

CREATE POLICY "own rows" ON public.failures
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_failures_user_id ON public.failures(user_id);


-- ==============================================================================
-- 9. TABELA: settings (Configurações da Oficina e Dados do Negócio)
-- ==============================================================================
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows" ON public.settings;
DROP POLICY IF EXISTS "settings_isolation_policy" ON public.settings;

CREATE POLICY "own rows" ON public.settings
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_settings_user_id ON public.settings(user_id);


-- ==============================================================================
-- 10. ALINHAMENTO DE PRIVILÉGIOS (anon x authenticated)
-- ==============================================================================
-- Revoga acesso anônimo das tabelas com dados privados da oficina
REVOKE ALL ON public.filaments, public.printers, public.supplies, public.parts,
               public.orders, public.customers, public.cash_expenses,
               public.failures, public.settings FROM anon;

-- Concede privilégios DML para usuários autenticados (sob controle do RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.filaments, public.printers, public.supplies, public.parts,
  public.orders, public.customers, public.cash_expenses,
  public.failures, public.settings TO authenticated;

COMMIT;
