-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V13 · RP passa a CADASTRAR pessoas
-- Data: 2026-11-10
--
-- RP: Consultar, Cadastrar, Capãozinho 3, Face e Foragidos.
-- Pode criar cadastro NOVO de pessoa. Continua SEM editar, SEM excluir,
-- e sem cadastrar foragido ou dados do Capãozinho 3.
--
-- Não altera nenhum usuário nem cadastro existente. Idempotente.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V13") → Run.
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "pessoas_insert" ON sicad_pessoas;
CREATE POLICY "pessoas_insert" ON sicad_pessoas FOR INSERT TO authenticated
  WITH CHECK (sicad_pode_cadastrar() OR coalesce(current_user_role() = 'rp', false));

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V13
-- ═══════════════════════════════════════════════════════
