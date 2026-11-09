-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V7 · Lista de pessoas mais rápida
-- Data: 2026-11-09
-- A view da v6 media o tamanho da foto com length(), que obriga o banco a
-- ler a foto inteira de cada cadastro. octet_length() lê só o cabeçalho.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V7") → Run.
-- Idempotente. Nenhum dado é alterado.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(format('p.%I', column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'sicad_pessoas'
    AND column_name NOT IN ('foto', 'tatuagens', 'face_photos');

  EXECUTE 'DROP VIEW IF EXISTS public.sicad_pessoas_lista';
  EXECUTE format(
    'CREATE VIEW public.sicad_pessoas_lista WITH (security_invoker = true) AS
       SELECT %s, (p.foto IS NOT NULL AND octet_length(p.foto) > 100) AS tem_foto
       FROM public.sicad_pessoas p', cols);
END $$;

REVOKE ALL ON public.sicad_pessoas_lista FROM anon, PUBLIC;
GRANT SELECT ON public.sicad_pessoas_lista TO authenticated;

-- Índice pra ordenação da lista (mais recentes primeiro)
CREATE INDEX IF NOT EXISTS idx_pessoas_criado_em ON sicad_pessoas (criado_em DESC);

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V7
-- ═══════════════════════════════════════════════════════
