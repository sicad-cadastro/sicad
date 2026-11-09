-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V10 · ZERAR USUÁRIOS (todos fazem cadastro novo)
-- Data: 2026-11-09
--
-- O QUE FAZ
--  1) Ajusta as ligações com auth.users para "ON DELETE SET NULL":
--     auditoria e cadastros de pessoas NÃO são apagados; só perdem o vínculo
--     com o login (a auditoria continua com o e-mail gravado em user_email,
--     e o cadastro continua com o nome em criado_por).
--  2) APAGA todos os logins (e-mails) e perfis, MENOS os administradores.
--     Assim o senhor continua entrando para aprovar os novos pedidos.
--
-- O QUE NÃO MEXE
--  Pessoas, foragidos, Capãozinho 3, fotos, anexos e auditoria ficam intactos.
--
-- ⚠️ IRREVERSÍVEL: senhas e perfis apagados não voltam.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V10") → Run.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Toda FK de tabela pública para auth.users (exceto sicad_perfis) vira SET NULL
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname, cl.relname AS tabela, att.attname AS coluna
      FROM pg_constraint con
      JOIN pg_class cl      ON cl.oid = con.conrelid
      JOIN pg_namespace ns  ON ns.oid = cl.relnamespace
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND con.confrelid = 'auth.users'::regclass
       AND ns.nspname = 'public'
       AND cl.relname <> 'sicad_perfis'
       AND array_length(con.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.tabela, c.conname);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
                   c.tabela, c.conname, c.coluna);
    RAISE NOTICE 'FK ajustada: %.% (%)', c.tabela, c.coluna, c.conname;
  END LOOP;
END $$;

-- 2) Apaga todos os logins que NÃO são administradores ativos
--    (o perfil em sicad_perfis cai junto, por cascata)
DELETE FROM auth.users u
 WHERE NOT EXISTS (
   SELECT 1 FROM sicad_perfis p
    WHERE p.id = u.id AND p.role = 'admin' AND p.ativo = true
 );

-- Conferência: deve listar SÓ os administradores que ficaram
SELECT u.email, p.nome, p.role FROM auth.users u LEFT JOIN sicad_perfis p ON p.id = u.id;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V10
-- ═══════════════════════════════════════════════════════
