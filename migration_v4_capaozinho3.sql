-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V4 · Módulo CAPÃOZINHO 3
-- Mapeamento territorial: chácaras, moradores, passagens e ocorrências
-- Data: 2026-11-06
--
-- COMO APLICAR:
-- 1. Supabase Console → SQL Editor → New query
-- 2. Cole este arquivo inteiro → Run
-- 3. Deve terminar sem erro. Pode rodar de novo sem problema (idempotente).
--
-- PERMISSÕES (RLS):
--   Ler ............ qualquer perfil ATIVO (admin, supervisor, operator, auditor)
--   Criar/editar ... admin, supervisor, operator (ativos)
--   Excluir ........ admin, supervisor (ativos)
--   Auditor ........ só leitura
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Funções auxiliares de permissão ─────────────────────────────────────
CREATE OR REPLACE FUNCTION c3_pode_ler() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM sicad_perfis WHERE id = auth.uid() AND ativo = true);
$$;

CREATE OR REPLACE FUNCTION c3_pode_editar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM sicad_perfis WHERE id = auth.uid() AND ativo = true
                 AND role IN ('admin','supervisor','operator'));
$$;

CREATE OR REPLACE FUNCTION c3_pode_excluir() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM sicad_perfis WHERE id = auth.uid() AND ativo = true
                 AND role IN ('admin','supervisor'));
$$;

CREATE OR REPLACE FUNCTION c3_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  NEW.atualizado_por := auth.uid();
  RETURN NEW;
END $$;


-- ═══════════════════════════════════════════════════════
-- 1. CHÁCARAS / PROPRIEDADES
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS c3_chacaras (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL,
  identificacao    text,                       -- nº / identificação da propriedade
  categoria        text NOT NULL DEFAULT 'residencial'
                   CHECK (categoria IN ('residencial','producao','comercial','desocupada','construcao','outros')),
  endereco         text,
  gmaps_link       text,
  lat              double precision CHECK (lat BETWEEN -90 AND 90),
  lng              double precision CHECK (lng BETWEEN -180 AND 180),
  proprietario     text,
  telefone         text,
  qtd_moradores    integer CHECK (qtd_moradores >= 0),  -- quantidade declarada
  observacoes      text,
  data_cadastro    date NOT NULL DEFAULT current_date,
  responsavel_id   uuid DEFAULT auth.uid(),
  responsavel_nome text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_por   uuid
);

-- ═══════════════════════════════════════════════════════
-- 2. MORADORES / INDIVÍDUOS
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS c3_moradores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chacara_id       uuid REFERENCES c3_chacaras(id) ON DELETE SET NULL,
  nome             text NOT NULL,
  vinculo          text DEFAULT 'morador'
                   CHECK (vinculo IN ('proprietario','morador','caseiro','familiar','funcionario','outro')),
  nascimento       date,
  cpf              text,                       -- só quando houver finalidade legítima
  telefones        text,
  endereco         text,
  lat              double precision CHECK (lat BETWEEN -90 AND 90),
  lng              double precision CHECK (lng BETWEEN -180 AND 180),
  observacoes      text,
  criado_por       uuid DEFAULT auth.uid(),
  criado_por_nome  text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_por   uuid
);

-- ═══════════════════════════════════════════════════════
-- 3. PASSAGENS (histórico de registros vinculados à pessoa)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS c3_passagens (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  morador_id          uuid NOT NULL REFERENCES c3_moradores(id) ON DELETE CASCADE,
  data                date,
  numero              text,                    -- nº do registro / procedimento
  natureza            text NOT NULL,
  unidade             text,
  fonte               text NOT NULL CHECK (length(trim(fonte)) > 0),  -- origem identificável
  observacoes         text,
  registrado_por      uuid DEFAULT auth.uid(),
  registrado_por_nome text,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_por      uuid
);

-- ═══════════════════════════════════════════════════════
-- 4. OCORRÊNCIAS
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS c3_ocorrencias (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  morador_id            uuid REFERENCES c3_moradores(id) ON DELETE CASCADE,
  chacara_id            uuid REFERENCES c3_chacaras(id) ON DELETE SET NULL,
  numero                text,
  data_hora             timestamptz,
  natureza              text NOT NULL,
  local                 text,
  pessoas_relacionadas  text,
  descricao             text,
  situacao              text NOT NULL DEFAULT 'registrada'
                        CHECK (situacao IN ('registrada','em_apuracao','concluida','arquivada')),
  fonte                 text NOT NULL CHECK (length(trim(fonte)) > 0),
  anexos                jsonb NOT NULL DEFAULT '[]'::jsonb,
  registrado_por        uuid DEFAULT auth.uid(),
  registrado_por_nome   text,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_por        uuid
);


-- ── Triggers de atualização ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['c3_chacaras','c3_moradores','c3_passagens','c3_ocorrencias'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION c3_touch()', t, t);
  END LOOP;
END $$;

-- ── Índices ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_c3_ch_nome_trgm  ON c3_chacaras  USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_c3_ch_categoria  ON c3_chacaras  (categoria);
CREATE INDEX IF NOT EXISTS idx_c3_mo_nome_trgm  ON c3_moradores USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_c3_mo_chacara    ON c3_moradores (chacara_id);
CREATE INDEX IF NOT EXISTS idx_c3_pa_morador    ON c3_passagens (morador_id);
CREATE INDEX IF NOT EXISTS idx_c3_oc_morador    ON c3_ocorrencias (morador_id);
CREATE INDEX IF NOT EXISTS idx_c3_oc_chacara    ON c3_ocorrencias (chacara_id);
CREATE INDEX IF NOT EXISTS idx_c3_oc_data       ON c3_ocorrencias (data_hora DESC);


-- ── RLS ─────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['c3_chacaras','c3_moradores','c3_passagens','c3_ocorrencias'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON %I FOR SELECT TO authenticated USING (c3_pode_ler())', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON %I FOR INSERT TO authenticated WITH CHECK (c3_pode_editar())', t, t);
    EXECUTE format('CREATE POLICY %I_update ON %I FOR UPDATE TO authenticated USING (c3_pode_editar()) WITH CHECK (c3_pode_editar())', t, t);
    EXECUTE format('CREATE POLICY %I_delete ON %I FOR DELETE TO authenticated USING (c3_pode_excluir())', t, t);
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════
-- 5. STORAGE — anexos das ocorrências (bucket PRIVADO)
-- Acesso só por link assinado temporário (5 min), gerado no app.
-- ═══════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('c3-anexos', 'c3-anexos', false, 10485760)   -- 10 MB por arquivo
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS c3_anexos_select ON storage.objects;
CREATE POLICY c3_anexos_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'c3-anexos' AND c3_pode_ler());

DROP POLICY IF EXISTS c3_anexos_insert ON storage.objects;
CREATE POLICY c3_anexos_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'c3-anexos' AND c3_pode_editar());

DROP POLICY IF EXISTS c3_anexos_delete ON storage.objects;
CREATE POLICY c3_anexos_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'c3-anexos' AND c3_pode_excluir());

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V4
-- ═══════════════════════════════════════════════════════
