-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V16 · ORGANOGRAMA das organizações (requer V14)
-- Data: 2026-11-11
--
-- Acrescenta ao vínculo de integrante a FUNÇÃO e o NÍVEL na estrutura
-- (1 = liderança ... 5 = base). Hierarquia ("Subordinado a") e comunicação
-- ("Comunica-se com") usam os vínculos que já existem.
-- Não altera nem apaga nada do que já foi lançado. Idempotente.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V16") → Run.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE int_vinculos ADD COLUMN IF NOT EXISTS funcao text;
ALTER TABLE int_vinculos ADD COLUMN IF NOT EXISTS nivel smallint;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'int_vinculos_nivel_ck') THEN
    ALTER TABLE int_vinculos ADD CONSTRAINT int_vinculos_nivel_ck CHECK (nivel IS NULL OR nivel BETWEEN 1 AND 9);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS int_vinculos_tipo_idx ON int_vinculos(tipo);

NOTIFY pgrst, 'reload schema';

SELECT column_name FROM information_schema.columns WHERE table_name = 'int_vinculos' AND column_name IN ('funcao','nivel');

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V16
-- ═══════════════════════════════════════════════════════
