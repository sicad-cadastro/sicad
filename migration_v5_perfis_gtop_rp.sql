-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V5 · Perfis GTOP e RP
-- Data: 2026-11-06
--
-- COMO APLICAR:
-- 1. Supabase → SQL Editor → New query
-- 2. Cole ESTE ARQUIVO INTEIRO (confira se termina em "FIM DA MIGRATION V5")
-- 3. Run → deve aparecer "Success. No rows returned"
-- Pode rodar mais de uma vez (idempotente). Nenhum dado é apagado.
--
-- MATRIZ (aplicada no banco — vale mesmo se alguém chamar a API direto):
--                     GTOP                         RP
--   Pessoas         ler/cadastrar/editar         só ler
--   Alertas         ler/cadastrar/editar         BLOQUEADO (módulo Foragidos)
--   Capãozinho 3    ler/cadastrar/editar         só ler
--   Excluir         só se o admin liberar        nunca
--   Usuários        não (só admin)               não (vê só o próprio perfil)
--   Cache de mapa   ler/gravar                   só ler
--
-- Perfis antigos (operator, supervisor, auditor) continuam funcionando igual.
-- ═══════════════════════════════════════════════════════════════════════


-- ── 1. Novos perfis na tabela de usuários ───────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.sicad_perfis'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE sicad_perfis DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE sicad_perfis ADD CONSTRAINT sicad_perfis_role_check
  CHECK (role IN ('admin','gtop','rp','supervisor','operator','auditor'));

-- GTOP só exclui registros se o administrador liberar (política administrativa)
ALTER TABLE sicad_perfis ADD COLUMN IF NOT EXISTS pode_excluir boolean NOT NULL DEFAULT false;


-- ── 2. Funções de permissão (fonte única da verdade) ────────────────────
CREATE OR REPLACE FUNCTION current_user_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM sicad_perfis WHERE id = auth.uid() AND ativo = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION sicad_pode_ler() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_user_role() IN ('admin','gtop','rp','supervisor','operator','auditor'), false);
$$;

CREATE OR REPLACE FUNCTION sicad_pode_cadastrar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_user_role() IN ('admin','gtop','supervisor','operator'), false);
$$;

CREATE OR REPLACE FUNCTION sicad_pode_editar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_user_role() IN ('admin','gtop','supervisor'), false);
$$;

CREATE OR REPLACE FUNCTION sicad_pode_excluir() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM sicad_perfis WHERE id = auth.uid() AND ativo = true
                 AND (role = 'admin' OR (role = 'gtop' AND pode_excluir = true)));
$$;


-- ── 3. sicad_pessoas (Cadastrar / Consultar / Face / Tatuagens / Mapa) ──
ALTER TABLE sicad_pessoas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pessoas_select" ON sicad_pessoas;
DROP POLICY IF EXISTS "pessoas_insert" ON sicad_pessoas;
DROP POLICY IF EXISTS "pessoas_update" ON sicad_pessoas;
DROP POLICY IF EXISTS "pessoas_delete" ON sicad_pessoas;

CREATE POLICY "pessoas_select" ON sicad_pessoas FOR SELECT TO authenticated USING (sicad_pode_ler());
CREATE POLICY "pessoas_insert" ON sicad_pessoas FOR INSERT TO authenticated WITH CHECK (sicad_pode_cadastrar());
CREATE POLICY "pessoas_update" ON sicad_pessoas FOR UPDATE TO authenticated USING (sicad_pode_editar()) WITH CHECK (sicad_pode_editar());
CREATE POLICY "pessoas_delete" ON sicad_pessoas FOR DELETE TO authenticated USING (sicad_pode_excluir());


-- ── 4. sicad_alertas (Foragidos — RP não acessa) ────────────────────────
ALTER TABLE sicad_alertas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alertas_select" ON sicad_alertas;
DROP POLICY IF EXISTS "alertas_insert" ON sicad_alertas;
DROP POLICY IF EXISTS "alertas_update" ON sicad_alertas;
DROP POLICY IF EXISTS "alertas_delete" ON sicad_alertas;

CREATE POLICY "alertas_select" ON sicad_alertas FOR SELECT TO authenticated
  USING (coalesce(current_user_role() IN ('admin','gtop','supervisor','operator','auditor'), false));
CREATE POLICY "alertas_insert" ON sicad_alertas FOR INSERT TO authenticated WITH CHECK (sicad_pode_cadastrar());
CREATE POLICY "alertas_update" ON sicad_alertas FOR UPDATE TO authenticated USING (sicad_pode_editar()) WITH CHECK (sicad_pode_editar());
CREATE POLICY "alertas_delete" ON sicad_alertas FOR DELETE TO authenticated USING (sicad_pode_excluir());


-- ── 5. sicad_perfis (gestão de usuários — só admin) ─────────────────────
DROP POLICY IF EXISTS "perfis_select" ON sicad_perfis;
DROP POLICY IF EXISTS perfis_select ON sicad_perfis;
CREATE POLICY "perfis_select" ON sicad_perfis FOR SELECT TO authenticated
  USING (id = auth.uid() OR coalesce(current_user_role() <> 'rp', false));

DROP POLICY IF EXISTS "perfis_update" ON sicad_perfis;
DROP POLICY IF EXISTS perfis_update ON sicad_perfis;
CREATE POLICY "perfis_update" ON sicad_perfis FOR UPDATE TO authenticated
  USING (is_admin() OR id = auth.uid())
  WITH CHECK (
    is_admin()
    OR (
      -- usuário comum só altera nome/matrícula do próprio perfil
      id = auth.uid()
      AND role         = (SELECT p.role         FROM sicad_perfis p WHERE p.id = auth.uid())
      AND ativo        = (SELECT p.ativo        FROM sicad_perfis p WHERE p.id = auth.uid())
      AND pode_excluir = (SELECT p.pode_excluir FROM sicad_perfis p WHERE p.id = auth.uid())
    )
  );


-- ── 6. Cache de geocodificação (RP só lê) ───────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.sicad_geo_cache') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS geo_cache_insert ON sicad_geo_cache';
    EXECUTE 'DROP POLICY IF EXISTS geo_cache_update ON sicad_geo_cache';
    EXECUTE 'CREATE POLICY geo_cache_insert ON sicad_geo_cache FOR INSERT TO authenticated WITH CHECK (sicad_pode_cadastrar())';
    EXECUTE 'CREATE POLICY geo_cache_update ON sicad_geo_cache FOR UPDATE TO authenticated USING (sicad_pode_cadastrar()) WITH CHECK (sicad_pode_cadastrar())';
  END IF;
END $$;


-- ── 7. Capãozinho 3 (as políticas c3_* usam estas funções) ──────────────
CREATE OR REPLACE FUNCTION c3_pode_ler() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sicad_pode_ler();
$$;

CREATE OR REPLACE FUNCTION c3_pode_editar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_user_role() IN ('admin','gtop','supervisor','operator'), false);
$$;

CREATE OR REPLACE FUNCTION c3_pode_excluir() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sicad_pode_excluir() OR coalesce(current_user_role() = 'supervisor', false);
$$;

-- Força o Supabase a reconhecer as mudanças na hora
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V5
-- ═══════════════════════════════════════════════════════
