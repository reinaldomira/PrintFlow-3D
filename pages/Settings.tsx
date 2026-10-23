import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { BusinessInfo } from '../types';
import { 
  LogOut, Plus, Trash2, Database, Copy, AlertCircle, Check, 
  User as UserIcon, Tag, Layers, Zap, Image as ImageIcon,
  Building2, Upload, Info, Cloud, CheckCircle2, Save, Calculator, RefreshCw
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { processAndUploadLogo } from '../services/settingsService';

const Settings: React.FC = () => {
  const { 
    settings, 
    setSettings, 
    logout, 
    user, 
    dbError, 
    settingsSyncState, 
    refreshData, 
    settingsConflict, 
    resolveConflict 
  } = useApp();
  const [newBrand, setNewBrand] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedSyncSql, setCopiedSyncSql] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [logoNotice, setLogoNotice] = useState<string | null>(null);
  const [businessForm, setBusinessForm] = useState<BusinessInfo>(() => settings.businessInfo || {});
  const [isDirty, setIsDirty] = useState(false);

  // Reseta estado sujo e re-inicializa formulário ao trocar de usuário ou deslogar
  React.useEffect(() => {
    setIsDirty(false);
    setSaveStatus('idle');
    setLogoNotice(null);
    setBusinessForm(settings.businessInfo || {});
  }, [user?.id]);

  // Sincroniza formulário local quando dados chegam da nuvem (ex: outro dispositivo ou login)
  React.useEffect(() => {
    if (!isDirty && settings.businessInfo) {
      setBusinessForm(settings.businessInfo);
    }
  }, [settings.businessInfo, isDirty]);

  // Sincronização automática em segundo plano (autosave debounced)
  React.useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      saveBusinessData(businessForm);
    }, 1500);

    return () => clearTimeout(timer);
  }, [businessForm, isDirty]);

  const businessSyncSql = `-- =============================================================================
-- PRINTFLOW 3D: MIGRAÇÃO TRANSAÇÃO SEGURA, PERSISTÊNCIA ATÔMICA E STORAGE
-- Executar no SQL EDITOR do Supabase Dashboard
-- =============================================================================

-- =============================================================================
-- BLOCO 1: BANCO DE DADOS RELACIONAL, INTEGRIDADE E RPC SAVE_SETTINGS_ATOMIC
-- Transação atômica: se qualquer diagnóstico, pre-check ou criação falhar aqui,
-- NENHUMA alteração é gravada no banco relacional (ROLLBACK automático total).
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- ETAPA 1: Estrutura da Tabela, Diagnóstico de Integridade e Restrições
-- -----------------------------------------------------------------------------
-- 1.1 Garante que a tabela settings exista se ainda não tiver sido criada
CREATE TABLE IF NOT EXISTS public.settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    default_energy_cost numeric DEFAULT 0.85,
    default_filament_cost numeric DEFAULT 120.00,
    default_profit_margin numeric DEFAULT 100.00,
    hourly_labor_rate numeric DEFAULT 25.00,
    hourly_maintenance_cost numeric DEFAULT 1.50,
    currency text DEFAULT 'R$',
    filament_brands text[] DEFAULT ARRAY['3D Prime', 'Creality', 'Voolt3D', 'GTMax']::text[],
    categories text[] DEFAULT ARRAY['Chaveiro', 'Organizador', 'Decoração', 'Suporte', 'Action Figure', 'Outros']::text[],
    business_info jsonb DEFAULT '{}'::jsonb,
    default_packaging_cost numeric DEFAULT 2.50,
    default_other_costs numeric DEFAULT 0.00,
    default_payment_fee_percent numeric DEFAULT 3.99,
    default_marketplace_fee_percent numeric DEFAULT 0.00,
    default_tax_percent numeric DEFAULT 6.00,
    auto_refresh_orders boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    version integer DEFAULT 1
);

-- 1.2 Diagnóstico de colunas estruturais críticas: verifica se user_id existe na tabela legada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: A tabela public.settings existe mas não possui a coluna estrutural "user_id". Ajuste a estrutura da tabela antes de prosseguir.';
  END IF;
END $$;

-- 1.3 Preservação e integridade da coluna id em tabelas legadas
-- Trata explicitamente os tipos UUID, TEXT, VARCHAR, SMALLINT, INTEGER e BIGINT sem conversão destrutiva
DO $$
DECLARE
  v_id_type text;
  v_char_len integer;
  v_dup_id_count integer;
  v_dup_ids text;
  v_neg_count integer;
  v_max_bigint bigint;
  v_null_count_bigint bigint;
  v_max_numeric numeric;
  v_null_count_numeric numeric;
BEGIN
  SELECT data_type, character_maximum_length 
  INTO v_id_type, v_char_len
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'id';

  IF v_id_type IS NULL THEN
    -- A coluna id não existe: adiciona como uuid com default sem alterar outras colunas ou registros
    ALTER TABLE public.settings ADD COLUMN id uuid DEFAULT gen_random_uuid();
  ELSE
    -- A coluna id já existe com tipo legado:
    -- A. Para tipos numéricos inteiros, verifica IDs negativos prévios via SQL dinâmico
    -- (O uso de EXECUTE evita erros de tipo em tempo de planejamento caso id seja UUID ou texto)
    IF v_id_type IN ('smallint', 'integer', 'bigint') THEN
      EXECUTE 'SELECT count(*) FROM public.settings WHERE id < 0' INTO v_neg_count;
      IF v_neg_count > 0 THEN
        RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: Existem % registro(s) com id negativo na tabela public.settings. Inspecione: SELECT * FROM public.settings WHERE id < 0;', v_neg_count;
      END IF;
    END IF;

    -- B. Preenchimento de IDs nulos com cálculo intermediário em tipos mais amplos para prevenir overflow
    IF v_id_type = 'uuid' THEN
      EXECUTE 'UPDATE public.settings SET id = gen_random_uuid() WHERE id IS NULL';
    ELSIF v_id_type IN ('text', 'character varying', 'character') THEN
      IF v_char_len IS NOT NULL AND v_char_len < 36 THEN
        RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: A coluna id é do tipo % (%) com comprimento máximo inferior a 36 caracteres. Não é possível gerar UUIDs com segurança sem truncamento.', v_id_type, v_char_len;
      END IF;
      EXECUTE 'UPDATE public.settings SET id = gen_random_uuid()::text WHERE id IS NULL';
    ELSIF v_id_type = 'smallint' THEN
      EXECUTE 'SELECT COALESCE(max(id::bigint), 0::bigint) FROM public.settings WHERE id IS NOT NULL' INTO v_max_bigint;
      EXECUTE 'SELECT count(*)::bigint FROM public.settings WHERE id IS NULL' INTO v_null_count_bigint;
      IF v_null_count_bigint > 0 THEN
        IF (v_max_bigint + v_null_count_bigint) > 32767::bigint THEN
          RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: A coluna id é smallint e o maior valor atual (%) somado aos % registros nulos excede o limite de 32767.', v_max_bigint, v_null_count_bigint;
        END IF;
        EXECUTE '
          WITH numbered AS (
            SELECT ctid, ($1 + row_number() OVER ())::smallint AS new_val
            FROM public.settings
            WHERE id IS NULL
          )
          UPDATE public.settings s
          SET id = n.new_val
          FROM numbered n
          WHERE s.ctid = n.ctid
        ' USING v_max_bigint;
      END IF;
    ELSIF v_id_type = 'integer' THEN
      EXECUTE 'SELECT COALESCE(max(id::numeric), 0::numeric) FROM public.settings WHERE id IS NOT NULL' INTO v_max_numeric;
      EXECUTE 'SELECT count(*)::numeric FROM public.settings WHERE id IS NULL' INTO v_null_count_numeric;
      IF v_null_count_numeric > 0 THEN
        IF (v_max_numeric + v_null_count_numeric) > 2147483647::numeric THEN
          RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: A coluna id é integer e o maior valor atual (%) somado aos % registros nulos excede o limite de 2147483647.', v_max_numeric, v_null_count_numeric;
        END IF;
        EXECUTE '
          WITH numbered AS (
            SELECT ctid, ($1 + row_number() OVER ())::integer AS new_val
            FROM public.settings
            WHERE id IS NULL
          )
          UPDATE public.settings s
          SET id = n.new_val
          FROM numbered n
          WHERE s.ctid = n.ctid
        ' USING v_max_numeric;
      END IF;
    ELSIF v_id_type = 'bigint' THEN
      EXECUTE 'SELECT COALESCE(max(id::numeric), 0::numeric) FROM public.settings WHERE id IS NOT NULL' INTO v_max_numeric;
      EXECUTE 'SELECT count(*)::numeric FROM public.settings WHERE id IS NULL' INTO v_null_count_numeric;
      IF v_null_count_numeric > 0 THEN
        IF (v_max_numeric + v_null_count_numeric) > 9223372036854775807::numeric THEN
          RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: A coluna id é bigint e o maior valor atual (%) somado aos % registros nulos excede o limite de 9223372036854775807.', v_max_numeric, v_null_count_numeric;
        END IF;
        EXECUTE '
          WITH numbered AS (
            SELECT ctid, ($1 + row_number() OVER ())::bigint AS new_val
            FROM public.settings
            WHERE id IS NULL
          )
          UPDATE public.settings s
          SET id = n.new_val
          FROM numbered n
          WHERE s.ctid = n.ctid
        ' USING v_max_numeric;
      END IF;
    ELSE
      -- Tipo não suportado para geração automática segura (ex: bytea, json, point, numeric fracionário)
      IF EXISTS (SELECT 1 FROM public.settings WHERE id IS NULL) THEN
        RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: A coluna id é do tipo desconhecido/não suportado ("%") e contém valores NULOS. Inspecione com: SELECT * FROM public.settings WHERE id IS NULL;', v_id_type;
      END IF;
    END IF;

    -- C. Sincronização de sequence caso exista (evita colisões em inserts futuros via DEFAULT sequence)
    IF v_id_type IN ('smallint', 'integer', 'bigint') THEN
      IF pg_get_serial_sequence('public.settings', 'id') IS NOT NULL THEN
        EXECUTE 'SELECT setval(pg_get_serial_sequence(''public.settings'', ''id''), COALESCE(max(id), 1)) FROM public.settings';
      END IF;
    END IF;

    -- D. Diagnóstico e barreira contra duplicatas na coluna id antes de qualquer restrição
    EXECUTE '
      SELECT count(*), string_agg(id::text, '', '')
      FROM (
        SELECT id
        FROM public.settings
        WHERE id IS NOT NULL
        GROUP BY id
        HAVING count(*) > 1
        LIMIT 5
      ) dups
    ' INTO v_dup_id_count, v_dup_ids;

    IF v_dup_id_count > 0 THEN
      RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: Existem valores duplicados na coluna "id" (IDs: %). Inspecione com: SELECT id, count(*), array_agg(user_id) FROM public.settings WHERE id IS NOT NULL GROUP BY id HAVING count(*) > 1;', v_dup_ids;
    END IF;

    IF EXISTS (SELECT 1 FROM public.settings WHERE id IS NULL) THEN
      RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: Falha na integridade: ainda constam valores nulos na coluna "id".';
    END IF;
  END IF;
END $$;

-- 1.4 Adiciona todas as colunas de configurações e controle de versão se ausentes na tabela existente
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_energy_cost numeric DEFAULT 0.85;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_filament_cost numeric DEFAULT 120.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_profit_margin numeric DEFAULT 100.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_labor_rate numeric DEFAULT 25.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_maintenance_cost numeric DEFAULT 1.50;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS currency text DEFAULT 'R$';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS filament_brands text[] DEFAULT ARRAY['3D Prime', 'Creality', 'Voolt3D', 'GTMax']::text[];
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS categories text[] DEFAULT ARRAY['Chaveiro', 'Organizador', 'Decoração', 'Suporte', 'Action Figure', 'Outros']::text[];
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS business_info jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_packaging_cost numeric DEFAULT 2.50;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_other_costs numeric DEFAULT 0.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_payment_fee_percent numeric DEFAULT 3.99;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_marketplace_fee_percent numeric DEFAULT 0.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_tax_percent numeric DEFAULT 6.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_refresh_orders boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- 1.5 Verificação e diagnóstico de registros órfãos com user_id NULO (interrompe sem apagar registros)
DO $$
DECLARE
  v_null_count integer;
BEGIN
  SELECT count(*) INTO v_null_count
  FROM public.settings
  WHERE user_id IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: Existem % registro(s) com user_id NULO na tabela public.settings. Inspecione os registros órfãos com: SELECT * FROM public.settings WHERE user_id IS NULL;', v_null_count;
  END IF;
END $$;

-- 1.6 Verificação de duplicatas de user_id com consulta explícita para diagnóstico (interrompe sem apagar nem mesclar)
DO $$
DECLARE
  v_dup_count integer;
  v_dup_users text;
BEGIN
  SELECT count(*), string_agg(user_id::text, ', ')
  INTO v_dup_count, v_dup_users
  FROM (
    SELECT user_id
    FROM public.settings
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING count(*) > 1
    LIMIT 5
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'MIGRAÇÃO INTERROMPIDA: Existem registros duplicados para o(s) user_id(s): %. Execute manualmente a consulta para inspecionar e tratar as duplicatas sem exclusão automática: SELECT user_id, count(*), array_agg(id) FROM public.settings WHERE user_id IS NOT NULL GROUP BY user_id HAVING count(*) > 1;', v_dup_users;
  END IF;
END $$;

-- 1.7 Criação segura da restrição UNIQUE compatível com ON CONFLICT (user_id)
-- Validação simplificada e direta no catálogo pg_index:
-- Exige índice único sobre a coluna user_id, não-parcial, sem expressões, pronto, vivo, válido e com exatamente 1 coluna-chave
DO $$
DECLARE
  v_has_valid_unique boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_index idx
    JOIN pg_attribute att ON att.attrelid = idx.indrelid AND att.attnum = idx.indkey[0]
    WHERE idx.indrelid = 'public.settings'::regclass
      AND att.attname = 'user_id'
      AND idx.indisunique = true
      AND idx.indisvalid = true
      AND idx.indisready = true
      AND idx.indislive = true
      AND idx.indpred IS NULL
      AND idx.indexprs IS NULL
      AND idx.indnkeyatts = 1
  ) INTO v_has_valid_unique;

  IF NOT v_has_valid_unique THEN
    ALTER TABLE public.settings ADD CONSTRAINT settings_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- 1.8 Preenchimento seguro de versões legadas onde o campo ainda constava como nulo
UPDATE public.settings 
SET version = 1 
WHERE version IS NULL;

-- 1.9 Torna version obrigatória (NOT NULL) e garante DEFAULT 1 após validar e corrigir linhas existentes
ALTER TABLE public.settings ALTER COLUMN version SET DEFAULT 1;
ALTER TABLE public.settings ALTER COLUMN version SET NOT NULL;

-- 1.10 Trigger para atualização transparente de updated_at
CREATE OR REPLACE FUNCTION public.update_settings_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settings_updated_at ON public.settings;
CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_settings_updated_at();

-- -----------------------------------------------------------------------------
-- ETAPA 2: Função RPC Atômica com Validação Prévia, Lock e Sobrescrita Segura
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_settings_atomic(
  p_expected_version integer DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_force boolean DEFAULT false,
  p_settings jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_current_version integer;
  v_current_updated_at timestamptz;
  v_new_version integer;
  v_exists boolean := false;
  v_row public.settings%ROWTYPE;
BEGIN
  -- 2.1 Validação de autenticação obrigatória
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'error', 'Operação não autorizada: usuário não autenticado.'
    );
  END IF;

  -- 2.2 Validação da estrutura básica do payload
  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' OR p_settings = '{}'::jsonb THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'error', 'Payload inválido: esperado objeto JSON com configurações.'
    );
  END IF;

  -- 2.3 Lock transacional exclusivo por usuário (serializa gravações do mesmo usuário)
  PERFORM pg_advisory_xact_lock(('x' || substr(md5('printflow_settings_' || v_user_id::text), 1, 16))::bit(64)::bigint);

  -- 2.4 Leitura do estado remoto atual com bloqueio de linha
  SELECT version, updated_at INTO v_current_version, v_current_updated_at
  FROM public.settings
  WHERE user_id = v_user_id
  FOR UPDATE;

  v_exists := FOUND;

  -- 2.5 VALIDAÇÃO COMPLETA DO PAYLOAD ANTES DE QUALQUER ESCRITA
  -- A. Na Criação Inicial (v_exists = false): Exige payload COMPLETO com todas as configurações locais
  -- Isso impede que uma configuração personalizada pelo usuário seja substituída silenciosamente por default
  IF NOT v_exists THEN
    IF NOT (p_settings ? 'default_energy_cost') OR
       NOT (p_settings ? 'default_filament_cost') OR
       NOT (p_settings ? 'default_profit_margin') OR
       NOT (p_settings ? 'hourly_labor_rate') OR
       NOT (p_settings ? 'hourly_maintenance_cost') OR
       NOT (p_settings ? 'currency') OR
       NOT (p_settings ? 'filament_brands') OR
       NOT (p_settings ? 'categories') OR
       NOT (p_settings ? 'business_info') OR
       NOT (p_settings ? 'default_packaging_cost') OR
       NOT (p_settings ? 'default_other_costs') OR
       NOT (p_settings ? 'default_payment_fee_percent') OR
       NOT (p_settings ? 'default_marketplace_fee_percent') OR
       NOT (p_settings ? 'default_tax_percent') OR
       NOT (p_settings ? 'auto_refresh_orders') THEN
      RETURN jsonb_build_object(
        'success', false,
        'conflict', false,
        'error', 'Payload inicial incompleto para a primeira sincronização. Todos os campos de configurações locais devem ser informados para evitar substituição silenciosa por valores padrão.'
      );
    END IF;
  END IF;

  -- Validação dos campos de custos principais quando presentes
  IF (p_settings ? 'default_energy_cost') THEN
    IF (p_settings->>'default_energy_cost') IS NULL OR NOT (p_settings->>'default_energy_cost' ~ '^-?[0-9]+(\.[0-9]+)?$') OR (p_settings->>'default_energy_cost')::numeric < 0 OR (p_settings->>'default_energy_cost')::numeric > 1000 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo default_energy_cost inválido (esperado número entre 0 e 1000).');
    END IF;
  END IF;

  IF (p_settings ? 'default_filament_cost') THEN
    IF (p_settings->>'default_filament_cost') IS NULL OR NOT (p_settings->>'default_filament_cost' ~ '^-?[0-9]+(\.[0-9]+)?$') OR (p_settings->>'default_filament_cost')::numeric < 0 OR (p_settings->>'default_filament_cost')::numeric > 100000 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo default_filament_cost inválido (esperado número entre 0 e 100000).');
    END IF;
  END IF;

  IF (p_settings ? 'default_profit_margin') THEN
    IF (p_settings->>'default_profit_margin') IS NULL OR NOT (p_settings->>'default_profit_margin' ~ '^-?[0-9]+(\.[0-9]+)?$') OR (p_settings->>'default_profit_margin')::numeric < 0 OR (p_settings->>'default_profit_margin')::numeric > 10000 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo default_profit_margin inválido (esperado número entre 0 e 10000).');
    END IF;
  END IF;

  -- Validação de custos e taxas adicionais
  IF (p_settings ? 'hourly_labor_rate') THEN
    IF (p_settings->>'hourly_labor_rate') IS NULL OR NOT (p_settings->>'hourly_labor_rate' ~ '^-?[0-9]+(\.[0-9]+)?$') OR (p_settings->>'hourly_labor_rate')::numeric < 0 OR (p_settings->>'hourly_labor_rate')::numeric > 100000 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo hourly_labor_rate inválido (esperado número entre 0 e 100000).');
    END IF;
  END IF;

  IF (p_settings ? 'hourly_maintenance_cost') THEN
    IF (p_settings->>'hourly_maintenance_cost') IS NULL OR NOT (p_settings->>'hourly_maintenance_cost' ~ '^-?[0-9]+(\.[0-9]+)?$') OR (p_settings->>'hourly_maintenance_cost')::numeric < 0 OR (p_settings->>'hourly_maintenance_cost')::numeric > 100000 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo hourly_maintenance_cost inválido (esperado número entre 0 e 100000).');
    END IF;
  END IF;

  IF (p_settings ? 'default_packaging_cost') THEN
    IF (p_settings->>'default_packaging_cost') IS NULL OR NOT (p_settings->>'default_packaging_cost' ~ '^-?[0-9]+(\.[0-9]+)?$') OR (p_settings->>'default_packaging_cost')::numeric < 0 OR (p_settings->>'default_packaging_cost')::numeric > 10000 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo default_packaging_cost inválido (esperado número entre 0 e 10000).');
    END IF;
  END IF;

  IF (p_settings ? 'default_other_costs') THEN
    IF (p_settings->>'default_other_costs') IS NULL OR NOT (p_settings->>'default_other_costs' ~ '^-?[0-9]+(\.[0-9]+)?$') OR (p_settings->>'default_other_costs')::numeric < 0 OR (p_settings->>'default_other_costs')::numeric > 100000 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo default_other_costs inválido (esperado número entre 0 e 100000).');
    END IF;
  END IF;

  IF (p_settings ? 'default_payment_fee_percent') THEN
    IF (p_settings->>'default_payment_fee_percent') IS NULL OR NOT (p_settings->>'default_payment_fee_percent' ~ '^-?[0-9]+(\.[0-9]+)?$') OR (p_settings->>'default_payment_fee_percent')::numeric < 0 OR (p_settings->>'default_payment_fee_percent')::numeric > 100 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo default_payment_fee_percent inválido (esperado percentual entre 0 e 100).');
    END IF;
  END IF;

  IF (p_settings ? 'default_marketplace_fee_percent') THEN
    IF (p_settings->>'default_marketplace_fee_percent') IS NULL OR NOT (p_settings->>'default_marketplace_fee_percent' ~ '^-?[0-9]+(\.[0-9]+)?$') OR (p_settings->>'default_marketplace_fee_percent')::numeric < 0 OR (p_settings->>'default_marketplace_fee_percent')::numeric > 100 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo default_marketplace_fee_percent inválido (esperado percentual entre 0 e 100).');
    END IF;
  END IF;

  IF (p_settings ? 'default_tax_percent') THEN
    IF (p_settings->>'default_tax_percent') IS NULL OR NOT (p_settings->>'default_tax_percent' ~ '^-?[0-9]+(\.[0-9]+)?$') OR (p_settings->>'default_tax_percent')::numeric < 0 OR (p_settings->>'default_tax_percent')::numeric > 100 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo default_tax_percent inválido (esperado percentual entre 0 e 100).');
    END IF;
  END IF;

  IF (p_settings ? 'currency') THEN
    IF jsonb_typeof(p_settings->'currency') <> 'string' OR length(trim(p_settings->>'currency')) = 0 OR length(p_settings->>'currency') > 10 THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo currency deve ser um texto válido de 1 a 10 caracteres.');
    END IF;
  END IF;

  IF (p_settings ? 'filament_brands') THEN
    IF jsonb_typeof(p_settings->'filament_brands') <> 'array' THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo filament_brands deve ser um array JSON.');
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_settings->'filament_brands') elem
      WHERE jsonb_typeof(elem) <> 'string' OR length(trim(elem #>> '{}')) = 0 OR length(elem #>> '{}') > 100
    ) THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Cada elemento de filament_brands deve ser uma string de até 100 caracteres.');
    END IF;
  END IF;

  IF (p_settings ? 'categories') THEN
    IF jsonb_typeof(p_settings->'categories') <> 'array' THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo categories deve ser um array JSON.');
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_settings->'categories') elem
      WHERE jsonb_typeof(elem) <> 'string' OR length(trim(elem #>> '{}')) = 0 OR length(elem #>> '{}') > 100
    ) THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Cada elemento de categories deve ser uma string de até 100 caracteres.');
    END IF;
  END IF;

  -- Validação estrita do contrato de 9 propriedades de business_info
  IF (p_settings ? 'business_info') THEN
    IF jsonb_typeof(p_settings->'business_info') <> 'object' THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info deve ser um objeto JSON.');
    END IF;

    IF (p_settings->'business_info' ? 'companyName') THEN
      IF jsonb_typeof(p_settings->'business_info'->'companyName') NOT IN ('string', 'null') THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.companyName deve ser texto ou nulo.');
      END IF;
      IF jsonb_typeof(p_settings->'business_info'->'companyName') = 'string' AND length(p_settings->'business_info'->>'companyName') > 200 THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.companyName excede o limite de 200 caracteres.');
      END IF;
    END IF;

    IF (p_settings->'business_info' ? 'phone') THEN
      IF jsonb_typeof(p_settings->'business_info'->'phone') NOT IN ('string', 'null') THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.phone deve ser texto ou nulo.');
      END IF;
      IF jsonb_typeof(p_settings->'business_info'->'phone') = 'string' AND length(p_settings->'business_info'->>'phone') > 50 THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.phone excede o limite de 50 caracteres.');
      END IF;
    END IF;

    IF (p_settings->'business_info' ? 'whatsapp') THEN
      IF jsonb_typeof(p_settings->'business_info'->'whatsapp') NOT IN ('string', 'null') THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.whatsapp deve ser texto ou nulo.');
      END IF;
      IF jsonb_typeof(p_settings->'business_info'->'whatsapp') = 'string' AND length(p_settings->'business_info'->>'whatsapp') > 50 THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.whatsapp excede o limite de 50 caracteres.');
      END IF;
    END IF;

    IF (p_settings->'business_info' ? 'instagram') THEN
      IF jsonb_typeof(p_settings->'business_info'->'instagram') NOT IN ('string', 'null') THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.instagram deve ser texto ou nulo.');
      END IF;
      IF jsonb_typeof(p_settings->'business_info'->'instagram') = 'string' AND length(p_settings->'business_info'->>'instagram') > 100 THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.instagram excede o limite de 100 caracteres.');
      END IF;
    END IF;

    IF (p_settings->'business_info' ? 'email') THEN
      IF jsonb_typeof(p_settings->'business_info'->'email') NOT IN ('string', 'null') THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.email deve ser texto ou nulo.');
      END IF;
      IF jsonb_typeof(p_settings->'business_info'->'email') = 'string' AND length(p_settings->'business_info'->>'email') > 200 THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.email excede o limite de 200 caracteres.');
      END IF;
    END IF;

    IF (p_settings->'business_info' ? 'website') THEN
      IF jsonb_typeof(p_settings->'business_info'->'website') NOT IN ('string', 'null') THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.website deve ser texto ou nulo.');
      END IF;
      IF jsonb_typeof(p_settings->'business_info'->'website') = 'string' AND length(p_settings->'business_info'->>'website') > 300 THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.website excede o limite de 300 caracteres.');
      END IF;
    END IF;

    IF (p_settings->'business_info' ? 'cityState') THEN
      IF jsonb_typeof(p_settings->'business_info'->'cityState') NOT IN ('string', 'null') THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.cityState deve ser texto ou nulo.');
      END IF;
      IF jsonb_typeof(p_settings->'business_info'->'cityState') = 'string' AND length(p_settings->'business_info'->>'cityState') > 150 THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.cityState excede o limite de 150 caracteres.');
      END IF;
    END IF;

    IF (p_settings->'business_info' ? 'address') THEN
      IF jsonb_typeof(p_settings->'business_info'->'address') NOT IN ('string', 'null') THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.address deve ser texto ou nulo.');
      END IF;
      IF jsonb_typeof(p_settings->'business_info'->'address') = 'string' AND length(p_settings->'business_info'->>'address') > 500 THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.address excede o limite de 500 caracteres.');
      END IF;
    END IF;

    IF (p_settings->'business_info' ? 'logoUrl') THEN
      IF jsonb_typeof(p_settings->'business_info'->'logoUrl') NOT IN ('string', 'null') THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.logoUrl deve ser texto ou nulo.');
      END IF;
      IF jsonb_typeof(p_settings->'business_info'->'logoUrl') = 'string' AND length(p_settings->'business_info'->>'logoUrl') > 500000 THEN
        RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo business_info.logoUrl excede o limite aceitável de tamanho.');
      END IF;
    END IF;
  END IF;

  IF (p_settings ? 'auto_refresh_orders') THEN
    IF jsonb_typeof(p_settings->'auto_refresh_orders') <> 'boolean' THEN
      RETURN jsonb_build_object('success', false, 'conflict', false, 'error', 'Campo auto_refresh_orders deve ser um booleano.');
    END IF;
  END IF;

  -- 2.6 CONTROLE DE CONCORRÊNCIA E SOBRESCRITA FECHADA
  IF NOT COALESCE(p_force, false) THEN
    -- Fluxo normal: requer igualdade exata entre versão esperada e atual
    IF NOT v_exists THEN
      IF p_expected_version IS NOT NULL OR p_expected_updated_at IS NOT NULL THEN
        RETURN jsonb_build_object(
          'success', false,
          'conflict', true,
          'remote_version', NULL,
          'remote_updated_at', NULL,
          'error', 'Configurações remotas não encontradas para a versão informada.'
        );
      END IF;
    ELSE
      IF v_current_version IS NULL THEN
        RETURN jsonb_build_object(
          'success', false,
          'conflict', true,
          'remote_version', NULL,
          'remote_updated_at', v_current_updated_at,
          'error', 'Registro legado com versão indefinida. Confirme a sobrescrita autorizada ou execute a migração SQL.'
        );
      END IF;

      IF p_expected_version IS NULL THEN
        RETURN jsonb_build_object(
          'success', false,
          'conflict', true,
          'remote_version', v_current_version,
          'remote_updated_at', v_current_updated_at,
          'error', 'Conflito de concorrência: o registro já existe na nuvem com versão ' || v_current_version || '.'
        );
      END IF;

      IF p_expected_version <> v_current_version THEN
        RETURN jsonb_build_object(
          'success', false,
          'conflict', true,
          'remote_version', v_current_version,
          'remote_updated_at', v_current_updated_at,
          'error', 'Conflito de concorrência: configurações foram alteradas em outro dispositivo (versão na nuvem: ' || v_current_version || ', versão esperada: ' || p_expected_version || ').'
        );
      END IF;
    END IF;
  ELSE
    -- Fluxo de sobrescrita autorizada (p_force = true):
    -- Exigência 1: p_expected_version NÃO pode ser nulo
    IF p_expected_version IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'conflict', true,
        'remote_version', v_current_version,
        'remote_updated_at', v_current_updated_at,
        'error', 'Sobrescrita rejeitada: a versão esperada deve ser especificada (p_expected_version obrigatório).'
      );
    END IF;

    -- Exigência 2: o registro remoto deve existir
    IF NOT v_exists THEN
      RETURN jsonb_build_object(
        'success', false,
        'conflict', true,
        'remote_version', NULL,
        'remote_updated_at', NULL,
        'error', 'Sobrescrita rejeitada: o registro remoto não existe no banco de dados.'
      );
    END IF;

    -- Exigência 3: a versão remota atual no banco deve ser exatamente igual a p_expected_version
    IF v_current_version IS NULL OR v_current_version <> p_expected_version THEN
      RETURN jsonb_build_object(
        'success', false,
        'conflict', true,
        'remote_version', v_current_version,
        'remote_updated_at', v_current_updated_at,
        'error', 'A versão remota mudou na nuvem (esperada: v' || p_expected_version || ', atual no banco: ' || COALESCE('v' || v_current_version::text, 'indefinida') || '). Avalie o novo conflito para não sobrescrever dados imprevistos.'
      );
    END IF;
  END IF;

  -- 2.7 Cálculo da nova versão sequencial (incrementa exatamente uma vez no sucesso)
  IF NOT v_exists THEN
    v_new_version := 1;
  ELSE
    v_new_version := COALESCE(v_current_version, 0) + 1;
  END IF;

  -- 2.8 PERSISTÊNCIA ATÔMICA ESTRITAMENTE SEPARADA
  IF NOT v_exists THEN
    -- A. Criação Inicial: todos os 15 campos obrigatórios foram validados em 2.5A
    INSERT INTO public.settings (
      user_id,
      default_energy_cost,
      default_filament_cost,
      default_profit_margin,
      hourly_labor_rate,
      hourly_maintenance_cost,
      currency,
      filament_brands,
      categories,
      business_info,
      default_packaging_cost,
      default_other_costs,
      default_payment_fee_percent,
      default_marketplace_fee_percent,
      default_tax_percent,
      auto_refresh_orders,
      version,
      updated_at
    )
    VALUES (
      v_user_id,
      (p_settings->>'default_energy_cost')::numeric,
      (p_settings->>'default_filament_cost')::numeric,
      (p_settings->>'default_profit_margin')::numeric,
      (p_settings->>'hourly_labor_rate')::numeric,
      (p_settings->>'hourly_maintenance_cost')::numeric,
      trim(p_settings->>'currency'),
      ARRAY(SELECT jsonb_array_elements_text(p_settings->'filament_brands')),
      ARRAY(SELECT jsonb_array_elements_text(p_settings->'categories')),
      p_settings->'business_info',
      (p_settings->>'default_packaging_cost')::numeric,
      (p_settings->>'default_other_costs')::numeric,
      (p_settings->>'default_payment_fee_percent')::numeric,
      (p_settings->>'default_marketplace_fee_percent')::numeric,
      (p_settings->>'default_tax_percent')::numeric,
      (p_settings->>'auto_refresh_orders')::boolean,
      v_new_version,
      clock_timestamp()
    )
    RETURNING * INTO v_row;
  ELSE
    -- B. Atualização Parcial: altera exclusivamente as chaves enviadas em p_settings,
    -- preservando os valores remotos atuais sem jamais avaliar campos omitidos em cláusula VALUES
    UPDATE public.settings SET
      default_energy_cost = CASE WHEN p_settings ? 'default_energy_cost' THEN (p_settings->>'default_energy_cost')::numeric ELSE settings.default_energy_cost END,
      default_filament_cost = CASE WHEN p_settings ? 'default_filament_cost' THEN (p_settings->>'default_filament_cost')::numeric ELSE settings.default_filament_cost END,
      default_profit_margin = CASE WHEN p_settings ? 'default_profit_margin' THEN (p_settings->>'default_profit_margin')::numeric ELSE settings.default_profit_margin END,
      hourly_labor_rate = CASE WHEN p_settings ? 'hourly_labor_rate' THEN (p_settings->>'hourly_labor_rate')::numeric ELSE settings.hourly_labor_rate END,
      hourly_maintenance_cost = CASE WHEN p_settings ? 'hourly_maintenance_cost' THEN (p_settings->>'hourly_maintenance_cost')::numeric ELSE settings.hourly_maintenance_cost END,
      currency = CASE WHEN p_settings ? 'currency' THEN trim(p_settings->>'currency') ELSE settings.currency END,
      filament_brands = CASE WHEN p_settings ? 'filament_brands' THEN ARRAY(SELECT jsonb_array_elements_text(p_settings->'filament_brands')) ELSE settings.filament_brands END,
      categories = CASE WHEN p_settings ? 'categories' THEN ARRAY(SELECT jsonb_array_elements_text(p_settings->'categories')) ELSE settings.categories END,
      business_info = CASE WHEN p_settings ? 'business_info' THEN p_settings->'business_info' ELSE settings.business_info END,
      default_packaging_cost = CASE WHEN p_settings ? 'default_packaging_cost' THEN (p_settings->>'default_packaging_cost')::numeric ELSE settings.default_packaging_cost END,
      default_other_costs = CASE WHEN p_settings ? 'default_other_costs' THEN (p_settings->>'default_other_costs')::numeric ELSE settings.default_other_costs END,
      default_payment_fee_percent = CASE WHEN p_settings ? 'default_payment_fee_percent' THEN (p_settings->>'default_payment_fee_percent')::numeric ELSE settings.default_payment_fee_percent END,
      default_marketplace_fee_percent = CASE WHEN p_settings ? 'default_marketplace_fee_percent' THEN (p_settings->>'default_marketplace_fee_percent')::numeric ELSE settings.default_marketplace_fee_percent END,
      default_tax_percent = CASE WHEN p_settings ? 'default_tax_percent' THEN (p_settings->>'default_tax_percent')::numeric ELSE settings.default_tax_percent END,
      auto_refresh_orders = CASE WHEN p_settings ? 'auto_refresh_orders' THEN (p_settings->>'auto_refresh_orders')::boolean ELSE settings.auto_refresh_orders END,
      version = v_new_version,
      updated_at = clock_timestamp()
    WHERE user_id = v_user_id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'conflict', false,
    'version', v_row.version,
    'updated_at', v_row.updated_at
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- ETAPA 3: Concessão e Revogação Rigorosa de Privilégios da RPC
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.save_settings_atomic(integer, timestamptz, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_settings_atomic(integer, timestamptz, boolean, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_settings_atomic(integer, timestamptz, boolean, jsonb) TO authenticated;

COMMIT;

-- =============================================================================
-- BLOCO 2: SUPABASE STORAGE - POLÍTICAS DE ACESSO DO BUCKET PARTS-IMAGES
-- Transação separada: O bucket PARTS-IMAGES permanece PRIVADO.
-- Cada usuário autenticado acessa exclusivamente seu próprio subdiretório: logos/{auth.uid()}/*
-- Se o bucket não existir, interrompe a transação com erro explícito sem afetar o Bloco 1.
-- =============================================================================
BEGIN;

-- Verificação diagnóstica e barreira obrigatória da presença e privacidade do bucket
DO $$
DECLARE
  v_bucket_exists boolean;
  v_is_public boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'PARTS-IMAGES') INTO v_bucket_exists;
  IF NOT v_bucket_exists THEN
    RAISE EXCEPTION 'MIGRAÇÃO DE STORAGE INTERROMPIDA: O bucket "PARTS-IMAGES" não foi localizado em storage.buckets. Crie-o como bucket PRIVADO no painel do Supabase Storage antes de aplicar as políticas de segurança.';
  END IF;

  SELECT COALESCE(public, false) INTO v_is_public FROM storage.buckets WHERE id = 'PARTS-IMAGES';
  IF v_is_public THEN
    RAISE EXCEPTION 'MIGRAÇÃO DE STORAGE INTERROMPIDA: O bucket "PARTS-IMAGES" está configurado como PÚBLICO (public = true). Para assegurar a privacidade dos logotipos comerciais e cumprir as regras de segurança, altere o bucket para PRIVADO no painel do Supabase Storage antes de executar este bloco. A visibilidade não foi alterada automaticamente para não impactar URLs públicas existentes.';
  END IF;
END $$;

-- 4.1 Permissão de Leitura (SELECT): restrita aos proprietários autenticados em logos/{auth.uid()}/*
DROP POLICY IF EXISTS "Permitir leitura de logos pelos proprietarios" ON storage.objects;
CREATE POLICY "Permitir leitura de logos pelos proprietarios"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'PARTS-IMAGES' AND 
  (storage.foldername(name))[1] = 'logos' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

-- 4.2 Permissão de Inserção (INSERT): restrita aos proprietários autenticados em logos/{auth.uid()}/*
DROP POLICY IF EXISTS "Permitir upload de logos na propria pasta" ON storage.objects;
CREATE POLICY "Permitir upload de logos na propria pasta"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'PARTS-IMAGES' AND 
  (storage.foldername(name))[1] = 'logos' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

-- 4.3 Permissão de Atualização/Substituição (UPDATE): restrita aos proprietários autenticados em logos/{auth.uid()}/*
DROP POLICY IF EXISTS "Permitir atualizacao de logos na propria pasta" ON storage.objects;
CREATE POLICY "Permitir atualizacao de logos na propria pasta"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'PARTS-IMAGES' AND 
  (storage.foldername(name))[1] = 'logos' AND
  (storage.foldername(name))[2] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'PARTS-IMAGES' AND 
  (storage.foldername(name))[1] = 'logos' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

-- 4.4 Permissão de Exclusão (DELETE): restrita aos proprietários autenticados em logos/{auth.uid()}/*
DROP POLICY IF EXISTS "Permitir exclusao de logos na propria pasta" ON storage.objects;
CREATE POLICY "Permitir exclusao de logos na propria pasta"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'PARTS-IMAGES' AND 
  (storage.foldername(name))[1] = 'logos' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

COMMIT;`;

  const copySyncSql = () => {
    navigator.clipboard.writeText(businessSyncSql);
    setCopiedSyncSql(true);
    setTimeout(() => setCopiedSyncSql(false), 2000);
  };

  const sqlScript = `
-- SCRIPT DE ATUALIZAÇÃO E SINCRONIZAÇÃO PRINTFLOW 3D
-- Rodar no SQL EDITOR do Supabase

-- 1. TABELA FILAMENTOS
CREATE TABLE IF NOT EXISTS public.filaments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    brand text,
    material text,
    color_name text,
    color_hex text DEFAULT '#10b981',
    weight numeric DEFAULT 1000,
    remaining_weight numeric DEFAULT 1000,
    price_paid numeric DEFAULT 120,
    created_at timestamptz DEFAULT now()
);

-- 2. TABELA IMPRESSORAS
CREATE TABLE IF NOT EXISTS public.printers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    brand text,
    model text,
    power numeric DEFAULT 350,
    status text DEFAULT 'Ativa',
    created_at timestamptz DEFAULT now()
);

-- 3. TABELA PEÇAS
CREATE TABLE IF NOT EXISTS public.parts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    category text,
    material text DEFAULT 'PLA',
    weight numeric DEFAULT 0,
    print_time numeric DEFAULT 0,
    post_processing_time numeric DEFAULT 0,
    filament_cost numeric,
    energy_cost numeric,
    waste_percent numeric DEFAULT 5,
    profit_margin numeric DEFAULT 100,
    recipe jsonb DEFAULT '[]'::jsonb,
    image_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. TABELA PEDIDOS
CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    customer_id uuid,
    items jsonb DEFAULT '[]'::jsonb,
    total_value numeric NOT NULL DEFAULT 0,
    status text DEFAULT 'Em produção',
    discount numeric DEFAULT 0,
    payments jsonb DEFAULT '[]'::jsonb,
    payment_method text DEFAULT 'Pix',
    created_at timestamptz DEFAULT now()
);

-- 5. TABELA CONFIGURAÇÕES
CREATE TABLE IF NOT EXISTS public.settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    default_energy_cost numeric DEFAULT 0.85,
    default_filament_cost numeric DEFAULT 120,
    default_profit_margin numeric DEFAULT 100,
    hourly_labor_rate numeric DEFAULT 25.00,
    hourly_maintenance_cost numeric DEFAULT 1.50,
    currency text DEFAULT 'R$',
    filament_brands text[] DEFAULT ARRAY['3D Prime', 'Creality'],
    categories text[] DEFAULT ARRAY['Chaveiro', 'Organizador', 'Decoração'],
    business_info jsonb DEFAULT '{}'::jsonb,
    default_packaging_cost numeric DEFAULT 2.50,
    default_other_costs numeric DEFAULT 0.00,
    default_payment_fee_percent numeric DEFAULT 3.99,
    default_marketplace_fee_percent numeric DEFAULT 0.00,
    default_tax_percent numeric DEFAULT 6.00,
    updated_at timestamptz DEFAULT now()
);

-- 6. TABELA CLIENTES
CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 7. TABELA INSUMOS & COMPONENTES (Argolas, Ímãs, Botões, Parafusos, Embalagens)
CREATE TABLE IF NOT EXISTS public.supplies (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    category text DEFAULT 'Outros',
    quantity numeric DEFAULT 0,
    min_quantity numeric DEFAULT 10,
    unit_cost numeric DEFAULT 0,
    package_price numeric DEFAULT 0,
    package_units numeric DEFAULT 1,
    supplier text,
    link text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- GARANTIA DE COLUNAS ADICIONAIS NA TABELA SETTINGS E PARTS
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS supplies jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_labor_rate numeric DEFAULT 25.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hourly_maintenance_cost numeric DEFAULT 1.50;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS business_info jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_packaging_cost numeric DEFAULT 2.50;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_other_costs numeric DEFAULT 0.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_payment_fee_percent numeric DEFAULT 3.99;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_marketplace_fee_percent numeric DEFAULT 0.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_tax_percent numeric DEFAULT 6.00;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
`.trim();

  const handleUpdate = (key: keyof typeof settings, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  const handleFieldChange = (field: keyof BusinessInfo, value: string) => {
    setIsDirty(true);
    setBusinessForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveBusinessData = async (dataToSave?: BusinessInfo) => {
    const data = dataToSave || businessForm;
    setSaveStatus('saving');
    const ok = await setSettings({
      ...settings,
      businessInfo: data
    });
    if (ok) {
      setIsDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } else {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 5000);
    }
  };

  const handleSaveBusinessCloud = async () => {
    await saveBusinessData(businessForm);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      setLogoNotice('A imagem do logotipo deve ter no máximo 5MB.');
      return;
    }
    try {
      setSaveStatus('saving');
      const { url, isCloudStorage, notice } = await processAndUploadLogo(user.id, file);
      const updated = { ...businessForm, logoUrl: url };
      setBusinessForm(updated);
      setIsDirty(true);
      if (notice) {
        setLogoNotice(notice);
      } else {
        setLogoNotice(isCloudStorage ? 'Logotipo enviado ao Supabase Storage!' : null);
      }
      await saveBusinessData(updated);
    } catch (err: any) {
      console.error('Erro ao processar logotipo:', err);
      setLogoNotice('Erro ao carregar logotipo: ' + (err.message || 'Falha de processamento'));
      setSaveStatus('error');
    }
  };

  const handleRemoveLogo = () => {
    const updated = { ...businessForm, logoUrl: '' };
    setBusinessForm(updated);
    setLogoNotice(null);
    setIsDirty(true);
    saveBusinessData(updated);
  };

  const addItem = (key: 'filamentBrands' | 'categories', value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    const current = settings[key] || [];
    if (current.includes(value)) return;
    handleUpdate(key, [...current, value]);
    setter('');
  };

  const removeItem = (key: 'filamentBrands' | 'categories', index: number) => {
    const current = [...(settings[key] || [])];
    current.splice(index, 1);
    handleUpdate(key, current);
  };

  const copySql = () => {
    navigator.clipboard.writeText(sqlScript);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-24">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Configurações</h2>
        <p className="text-zinc-500">Sincronização Cloud v2.6</p>
      </div>

      {/* Alerta de Conflito de Sincronização entre Dispositivos */}
      {settingsConflict && (
        <div className="bg-amber-500/15 border-2 border-amber-500/50 rounded-3xl p-6 shadow-xl shadow-amber-500/10 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-zinc-950 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-black uppercase text-sm text-amber-400">Conflito de Concorrência Detectado</h3>
              <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                Outro dispositivo gravou configurações mais recentes na nuvem em{' '}
                <span className="font-semibold text-white">
                  {new Date(settingsConflict.remoteUpdatedAt).toLocaleString('pt-BR')}
                </span>
                {settingsConflict.remoteVersion ? ` (Versão na nuvem: v${settingsConflict.remoteVersion})` : ''}.
                Para evitar sobrescrita de dados sem aviso, escolha como prosseguir:
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={async () => {
                setIsDirty(false);
                await resolveConflict('keep_remote');
              }}
              className="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-zinc-700 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-emerald-400" /> Manter da Nuvem (Descartar local)
            </button>
            <button
              type="button"
              onClick={async () => {
                setIsDirty(false);
                await resolveConflict('overwrite_remote');
              }}
              className="py-3 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" /> Sobrescrever Nuvem com Dados Locais
            </button>
          </div>
        </div>
      )}

      {/* SQL Repair Card */}
      <div className={`rounded-3xl p-6 border transition-all ${dbError ? 'bg-amber-500/10 border-amber-500/30 shadow-xl shadow-amber-500/10' : 'bg-zinc-900 border-zinc-800'}`}>
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${dbError ? 'bg-amber-500 text-zinc-950' : 'bg-emerald-500/10 text-emerald-500'}`}>
            <Database className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-black uppercase text-sm leading-none">Reparar Banco Cloud</h3>
            <p className="text-xs font-bold opacity-70 mt-1">Sincronize colunas para o APK</p>
          </div>
        </div>
        <button 
          onClick={copySql}
          className="w-full bg-zinc-950 text-emerald-500 py-5 rounded-2xl font-black flex items-center justify-center gap-3 active:scale-95 transition-all border border-emerald-500/20"
        >
          {copiedSql ? <><Check className="w-6 h-6" /> COPIADO!</> : <><Copy className="w-6 h-6" /> COPIAR SCRIPT SQL</>}
        </button>
      </div>

      {/* Alerta de Storage */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-3xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center text-zinc-950">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black uppercase text-sm leading-none">Fotos no APK / Web</h3>
            <p className="text-xs font-bold opacity-70 mt-1">Crie o bucket "PARTS-IMAGES" como PUBLIC no Supabase Storage.</p>
          </div>
        </div>
      </div>

      {/* PWA Mobile Installation Card */}
      <PWAInstallButton variant="settings" />


      {/* User Info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-emerald-500">
            <UserIcon className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg truncate">{user?.email || 'Usuário'}</h3>
            <p className="text-sm text-zinc-500 italic">Cloud Ativo</p>
          </div>
          <button onClick={logout} className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Dados Comerciais do Orçamento */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            <h3 className="font-black uppercase text-xs tracking-widest text-zinc-300">
              Dados comerciais do orçamento
            </h3>
          </div>
          {settingsSyncState === 'synced' && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" /> Sincronizado na Nuvem (PC & Celular)
            </span>
          )}
          {settingsSyncState === 'pending_local' && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" /> Salvo no Dispositivo (Pendente na Nuvem)
            </span>
          )}
          {settingsSyncState === 'saving' && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5">
              <Cloud className="w-3 h-3 animate-pulse" /> Sincronizando com Supabase...
            </span>
          )}
          {settingsSyncState === 'error' && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" /> Erro de Conexão Cloud
            </span>
          )}
        </div>

        {/* Banner Informativo de Sincronização */}
        {settingsSyncState === 'synced' ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-emerald-300 text-xs sm:text-sm">
                  Sincronização Cloud Ativa (PC & Celular)
                </p>
                <p className="text-zinc-400 leading-relaxed text-[11px]">
                  Todas as configurações comerciais, custos e taxas estão gravadas no Supabase. Qualquer alteração feita aqui no computador será carregada automaticamente no celular ou tablet com a mesma conta.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300 text-xs sm:text-sm">
                  Sincronização Parcial (Salvo Localmente neste Dispositivo)
                </p>
                <p className="text-zinc-400 leading-relaxed text-[11px]">
                  Os custos base estão salvos no Supabase, mas para sincronizar Dados Comerciais, Mão de Obra e Manutenção na nuvem entre múltiplos aparelhos, execute o comando SQL de atualização no Supabase SQL Editor.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-400 font-medium">
                Adiciona colunas padronizadas em <code className="text-amber-300 bg-zinc-950 px-1 py-0.5 rounded">snake_case</code> no Supabase.
              </span>
              <button
                type="button"
                onClick={copySyncSql}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-zinc-950/80 hover:bg-zinc-950 px-3 py-1.5 rounded-xl border border-amber-500/30 flex items-center justify-center gap-1.5 transition-all self-start sm:self-auto"
              >
                {copiedSyncSql ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Comando SQL Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar SQL de Sincronização</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Logotipo */}
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase text-zinc-500">
            Logotipo da Empresa
          </label>
          <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-zinc-800/60 border border-zinc-700/60 rounded-2xl">
            <div className="w-20 h-20 rounded-2xl bg-zinc-800 border-2 border-dashed border-zinc-700 flex items-center justify-center overflow-hidden flex-shrink-0">
              {businessForm.logoUrl ? (
                <img 
                  src={businessForm.logoUrl} 
                  alt="Logo" 
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-zinc-600" />
              )}
            </div>
            <div className="flex-1 space-y-2 text-center sm:text-left w-full">
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <label className="cursor-pointer bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all">
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Enviar Imagem</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleLogoUpload}
                  />
                </label>
                {businessForm.logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Ou cole a URL da imagem (https://...)"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-medium text-zinc-200 focus:border-cyan-500 outline-none transition-colors"
                value={businessForm.logoUrl || ''}
                onChange={e => handleFieldChange('logoUrl', e.target.value)}
              />
            </div>
          </div>
          {logoNotice && (
            <p className="text-[11px] text-cyan-400 bg-cyan-950/50 border border-cyan-800/50 p-2.5 rounded-xl">
              {logoNotice}
            </p>
          )}
        </div>

        {/* Campos de Dados Comerciais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Nome da Empresa ou Marca
            </label>
            <input
              type="text"
              placeholder="Ex: PrintFlow 3D Studio"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.companyName || ''}
              onChange={e => handleFieldChange('companyName', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Telefone Comercial
            </label>
            <input
              type="tel"
              placeholder="(11) 3456-7890"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.phone || ''}
              onChange={e => handleFieldChange('phone', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              WhatsApp
            </label>
            <input
              type="tel"
              placeholder="(11) 98765-4321"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.whatsapp || ''}
              onChange={e => handleFieldChange('whatsapp', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Instagram
            </label>
            <input
              type="text"
              placeholder="@suamarca.3d"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.instagram || ''}
              onChange={e => handleFieldChange('instagram', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              E-mail Comercial
            </label>
            <input
              type="email"
              placeholder="contato@suamarca.com.br"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.email || ''}
              onChange={e => handleFieldChange('email', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Site
            </label>
            <input
              type="text"
              placeholder="www.suamarca.com.br"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.website || ''}
              onChange={e => handleFieldChange('website', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Cidade e Estado
            </label>
            <input
              type="text"
              placeholder="São Paulo - SP"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.cityState || ''}
              onChange={e => handleFieldChange('cityState', e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Endereço Comercial (Opcional)
            </label>
            <input
              type="text"
              placeholder="Av. Paulista, 1000 - Bela Vista"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-zinc-100 focus:border-cyan-500 outline-none transition-colors"
              value={businessForm.address || ''}
              onChange={e => handleFieldChange('address', e.target.value)}
            />
          </div>
        </div>

        {/* Botão de Salvar e Sincronizar */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSaveBusinessCloud}
            disabled={saveStatus === 'saving'}
            className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2.5 transition-all active:scale-98 shadow-lg ${
              saveStatus === 'saved'
                ? settingsSyncState === 'synced'
                  ? 'bg-emerald-500 text-zinc-950 shadow-emerald-500/20'
                  : 'bg-amber-500 text-zinc-950 shadow-amber-500/20'
                : saveStatus === 'error'
                  ? 'bg-red-500 text-white shadow-red-500/20'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-cyan-500/20'
            }`}
          >
            {saveStatus === 'saving' ? (
              <>
                <Cloud className="w-5 h-5 animate-pulse" />
                <span>SALVANDO CONFIGURAÇÕES...</span>
              </>
            ) : saveStatus === 'saved' ? (
              settingsSyncState === 'synced' ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>CONFIGURAÇÕES SINCRONIZADAS NA NUVEM!</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>SALVO NO DISPOSITIVO (RODE O SQL PARA A NUVEM)</span>
                </>
              )
            ) : saveStatus === 'error' ? (
              <>
                <AlertCircle className="w-5 h-5" />
                <span>ERRO AO SALVAR NO SUPABASE</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>SALVAR DADOS DO ORÇAMENTO</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Default Costs */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-emerald-500" />
          <h3 className="font-black uppercase text-xs tracking-widest text-zinc-400">Custos Padrão de Fabricação</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Energia (R$/kWh)</label>
            <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.defaultEnergyCost} onChange={e => handleUpdate('defaultEnergyCost', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Filamento Padrão (R$/kg)</label>
            <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.defaultFilamentCost} onChange={e => handleUpdate('defaultFilamentCost', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Margem de Lucro Padrão (%)</label>
            <input type="number" step="1" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.defaultProfitMargin} onChange={e => handleUpdate('defaultProfitMargin', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Mão de Obra (R$/h)</label>
            <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.hourlyLaborRate} onChange={e => handleUpdate('hourlyLaborRate', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase text-zinc-500">Manutenção de Máquina (R$/h)</label>
            <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-bold focus:border-emerald-500 outline-none transition-colors"
              value={settings.hourlyMaintenanceCost} onChange={e => handleUpdate('hourlyMaintenanceCost', Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Taxas Comerciais & Custos de Venda Padrão (pricingCalculator) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Calculator className="w-4 h-4 text-emerald-500" />
          <h3 className="font-black uppercase text-xs tracking-widest text-zinc-400">Taxas e Custos Comerciais Padrão</h3>
        </div>
        <p className="text-xs text-zinc-500">
          Valores base aplicados automaticamente na calculadora avançada de cada nova venda.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-400">Embalagem Padrão (R$)</label>
            <input 
              type="number" 
              step="0.01" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 font-bold focus:border-emerald-500 outline-none transition-colors text-white text-sm"
              value={settings.defaultPackagingCost ?? 2.50} 
              onChange={e => handleUpdate('defaultPackagingCost', Number(e.target.value))} 
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-400">Outros Custos Fixos (R$)</label>
            <input 
              type="number" 
              step="0.01" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 font-bold focus:border-emerald-500 outline-none transition-colors text-white text-sm"
              value={settings.defaultOtherCosts ?? 0.00} 
              onChange={e => handleUpdate('defaultOtherCosts', Number(e.target.value))} 
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-400">Taxa de Pagamento Padrão (%)</label>
            <input 
              type="number" 
              step="0.01" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 font-bold focus:border-emerald-500 outline-none transition-colors text-white text-sm"
              value={settings.defaultPaymentFeePercent ?? 3.99} 
              onChange={e => handleUpdate('defaultPaymentFeePercent', Number(e.target.value))} 
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-zinc-400">Comissão de Marketplace Padrão (%)</label>
            <input 
              type="number" 
              step="0.01" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 font-bold focus:border-emerald-500 outline-none transition-colors text-white text-sm"
              value={settings.defaultMarketplaceFeePercent ?? 0.00} 
              onChange={e => handleUpdate('defaultMarketplaceFeePercent', Number(e.target.value))} 
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-[10px] font-black uppercase text-zinc-400">Impostos / Simples / MEI Padrão (%)</label>
            <input 
              type="number" 
              step="0.01" 
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 font-bold focus:border-emerald-500 outline-none transition-colors text-white text-sm"
              value={settings.defaultTaxPercent ?? 6.00} 
              onChange={e => handleUpdate('defaultTaxPercent', Number(e.target.value))} 
            />
          </div>
        </div>
      </div>

      {/* Filament Brands */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-emerald-500" />
          <h3 className="font-black uppercase text-xs tracking-widest text-zinc-400">Marcas de Filamento</h3>
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Nova marca..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
            value={newBrand} onChange={e => setNewBrand(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem('filamentBrands', newBrand, setNewBrand)}
          />
          <button onClick={() => addItem('filamentBrands', newBrand, setNewBrand)} className="p-3 bg-emerald-500 text-zinc-950 rounded-xl transition-transform active:scale-90"><Plus /></button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {(settings.filamentBrands || []).map((brand, idx) => (
            <div key={idx} className="bg-zinc-800 pl-4 pr-2 py-2 rounded-xl flex items-center gap-3 border border-zinc-700 group">
              <span className="text-xs font-bold text-zinc-300">{brand}</span>
              <button onClick={() => removeItem('filamentBrands', idx)} className="p-1 text-zinc-600 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Tag className="w-4 h-4 text-emerald-500" />
          <h3 className="font-black uppercase text-xs tracking-widest text-zinc-400">Categorias de Peças</h3>
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Nova categoria..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
            value={newCategory} onChange={e => setNewCategory(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem('categories', newCategory, setNewCategory)}
          />
          <button onClick={() => addItem('categories', newCategory, setNewCategory)} className="p-3 bg-emerald-500 text-zinc-950 rounded-xl transition-transform active:scale-90"><Plus /></button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {(settings.categories || []).map((cat, idx) => (
            <div key={idx} className="bg-zinc-800 pl-4 pr-2 py-2 rounded-xl flex items-center gap-3 border border-zinc-700 group">
              <span className="text-xs font-bold text-zinc-300">{cat}</span>
              <button onClick={() => removeItem('categories', idx)} className="p-1 text-zinc-600 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Settings;
