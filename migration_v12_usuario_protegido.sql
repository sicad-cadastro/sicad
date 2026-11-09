-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V12 · Usuário PROTEGIDO (dono do sistema)
-- Data: 2026-11-09
--
-- kleciofdes@gmail.com fica intocável pelo sistema:
--   • ninguém (nem outro admin, nem Inteligência) edita, desativa ou exclui
--   • o próprio Klecio pode mudar nome/matrícula, mas não perde o ADMIN
--     nem se desativa por engano
-- Só o SQL Editor do Supabase (fora do app) consegue alterar.
--
-- Não altera nenhum outro usuário. Idempotente.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V12") → Run.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE sicad_perfis ADD COLUMN IF NOT EXISTS protegido boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION sicad_proteger_perfil() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- SQL Editor / manutenção (sem usuário logado): liberado
  IF auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.protegido THEN RAISE EXCEPTION 'Não é permitido criar usuário protegido pelo sistema' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.protegido THEN RAISE EXCEPTION 'Este usuário é protegido e não pode ser excluído' USING ERRCODE = '42501'; END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.protegido THEN
    IF auth.uid() <> OLD.id THEN
      RAISE EXCEPTION 'Este usuário é protegido e não pode ser alterado' USING ERRCODE = '42501';
    END IF;
    IF NEW.role <> OLD.role OR NEW.ativo <> OLD.ativo OR NOT NEW.protegido THEN
      RAISE EXCEPTION 'O perfil protegido não pode mudar de perfil nem ser desativado' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.protegido THEN
    RAISE EXCEPTION 'Não é permitido marcar usuário como protegido pelo sistema' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sicad_proteger_perfil ON sicad_perfis;
CREATE TRIGGER trg_sicad_proteger_perfil
  BEFORE INSERT OR UPDATE OR DELETE ON sicad_perfis
  FOR EACH ROW EXECUTE FUNCTION sicad_proteger_perfil();

-- Marca o Klecio como protegido (e garante ADMIN ativo)
UPDATE sicad_perfis
   SET protegido = true, role = 'admin', ativo = true
 WHERE id = (SELECT id FROM auth.users WHERE lower(email) = 'kleciofdes@gmail.com');

-- Conferência: deve mostrar 1 linha com protegido = true
SELECT p.nome, u.email, p.role, p.ativo, p.protegido
  FROM sicad_perfis p JOIN auth.users u ON u.id = p.id
 WHERE p.protegido;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V12
-- ═══════════════════════════════════════════════════════
