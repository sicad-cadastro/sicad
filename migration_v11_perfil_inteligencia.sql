-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V11 · Novo perfil INTELIGÊNCIA
-- Data: 2026-11-09
--
-- INTELIGÊNCIA = acesso a tudo, MENOS:
--   • excluir membros (usuários) do sistema
--   • mexer em administradores (não edita admin e não promove ninguém a admin)
-- Pode: consultar, cadastrar, editar, excluir REGISTROS (pessoas, foragidos,
-- Capãozinho 3), ver auditoria, aprovar/editar/desativar usuários.
-- Código-fonte não fica no sistema: só quem tem acesso ao GitHub/Supabase.
--
-- Não altera nenhum usuário existente. Idempotente.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V11") → Run.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Aceita o novo perfil
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.sicad_perfis'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE sicad_perfis DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE sicad_perfis ADD CONSTRAINT sicad_perfis_role_check
  CHECK (role IN ('admin','inteligencia','gtop','rp','supervisor','operator','auditor'));

-- 2) Permissões de dados
CREATE OR REPLACE FUNCTION sicad_pode_ler() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_user_role() IN ('admin','inteligencia','gtop','rp','supervisor','operator','auditor'), false);
$$;

CREATE OR REPLACE FUNCTION sicad_pode_cadastrar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_user_role() IN ('admin','inteligencia','gtop','supervisor','operator'), false);
$$;

CREATE OR REPLACE FUNCTION sicad_pode_editar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_user_role() IN ('admin','inteligencia','gtop','supervisor'), false);
$$;

CREATE OR REPLACE FUNCTION sicad_pode_excluir() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM sicad_perfis WHERE id = auth.uid() AND ativo = true
                 AND (role IN ('admin','inteligencia') OR (role = 'gtop' AND pode_excluir = true)));
$$;

CREATE OR REPLACE FUNCTION c3_pode_editar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_user_role() IN ('admin','inteligencia','gtop','supervisor','operator'), false);
$$;

-- 3) Gestão de usuários: admin ou inteligência (inteligência nunca toca em admin)
CREATE OR REPLACE FUNCTION sicad_e_inteligencia() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_user_role() = 'inteligencia', false);
$$;

DROP POLICY IF EXISTS "perfis_update" ON sicad_perfis;
DROP POLICY IF EXISTS perfis_update ON sicad_perfis;
CREATE POLICY "perfis_update" ON sicad_perfis FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR id = auth.uid()
    OR (sicad_e_inteligencia() AND role <> 'admin')
  )
  WITH CHECK (
    is_admin()
    OR (
      -- inteligência: edita outros usuários, mas não cria/edita administrador
      sicad_e_inteligencia() AND id <> auth.uid() AND role <> 'admin'
    )
    OR (
      -- qualquer um: só nome/matrícula do próprio perfil
      id = auth.uid()
      AND role         = (SELECT p.role         FROM sicad_perfis p WHERE p.id = auth.uid())
      AND ativo        = (SELECT p.ativo        FROM sicad_perfis p WHERE p.id = auth.uid())
      AND pode_excluir = (SELECT p.pode_excluir FROM sicad_perfis p WHERE p.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "perfis_insert" ON sicad_perfis;
DROP POLICY IF EXISTS perfis_insert ON sicad_perfis;
CREATE POLICY "perfis_insert" ON sicad_perfis FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (sicad_e_inteligencia() AND role <> 'admin'));

-- Excluir membro continua SÓ admin
DROP POLICY IF EXISTS "perfis_delete" ON sicad_perfis;
DROP POLICY IF EXISTS perfis_delete ON sicad_perfis;
CREATE POLICY "perfis_delete" ON sicad_perfis FOR DELETE TO authenticated USING (is_admin());

-- 4) Auditoria: inteligência lê tudo
DROP POLICY IF EXISTS audit_select ON sicad_audit;
DROP POLICY IF EXISTS "audit_select" ON sicad_audit;
CREATE POLICY audit_select ON sicad_audit FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM sicad_perfis
                WHERE id = auth.uid() AND ativo = true
                  AND role IN ('admin','inteligencia','supervisor','auditor'))
  );

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V11
-- ═══════════════════════════════════════════════════════
