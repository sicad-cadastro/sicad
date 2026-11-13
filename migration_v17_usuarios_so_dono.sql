-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V17 · Gestão de USUÁRIOS só pelo dono do sistema
-- Data: 2026-11-12  (requer a V12 — coluna protegido)
--
-- Aprovar, editar perfil, ativar/desativar, criar e excluir usuários:
-- SOMENTE o usuário protegido (kleciofdes@gmail.com).
-- Qualquer usuário continua podendo alterar só o próprio nome/matrícula.
-- Não altera nenhum usuário. Idempotente.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V17") → Run.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sicad_e_dono() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM sicad_perfis WHERE id = auth.uid() AND protegido AND ativo);
$$;

DROP POLICY IF EXISTS "perfis_update" ON sicad_perfis;
DROP POLICY IF EXISTS perfis_update ON sicad_perfis;
CREATE POLICY "perfis_update" ON sicad_perfis FOR UPDATE TO authenticated
  USING (sicad_e_dono() OR id = auth.uid())
  WITH CHECK (
    sicad_e_dono()
    OR (
      id = auth.uid()
      AND role         = (SELECT p.role         FROM sicad_perfis p WHERE p.id = auth.uid())
      AND ativo        = (SELECT p.ativo        FROM sicad_perfis p WHERE p.id = auth.uid())
      AND pode_excluir = (SELECT p.pode_excluir FROM sicad_perfis p WHERE p.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "perfis_insert" ON sicad_perfis;
DROP POLICY IF EXISTS perfis_insert ON sicad_perfis;
CREATE POLICY "perfis_insert" ON sicad_perfis FOR INSERT TO authenticated WITH CHECK (sicad_e_dono());

DROP POLICY IF EXISTS "perfis_delete" ON sicad_perfis;
DROP POLICY IF EXISTS perfis_delete ON sicad_perfis;
CREATE POLICY "perfis_delete" ON sicad_perfis FOR DELETE TO authenticated USING (sicad_e_dono());

NOTIFY pgrst, 'reload schema';

-- Conferência: deve listar 1 linha (você)
SELECT p.nome, u.email FROM sicad_perfis p JOIN auth.users u ON u.id = p.id WHERE p.protegido AND p.ativo;

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V17
-- ═══════════════════════════════════════════════════════
