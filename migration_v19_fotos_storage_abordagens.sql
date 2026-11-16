-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V19 · FOTOS NO STORAGE + HISTÓRICO DE ABORDAGENS
-- Data: 2026-11-16
--
-- 1) Bucket PRIVADO "sicad-fotos" para fotos de pessoas, tatuagens e
--    foragidos (sai do banco; o banco guarda só a referência "sb:caminho").
--    Ver: quem lê o SICAD · Enviar: quem cadastra (inclui RP).
--    Sem alterar/apagar arquivo enviado (foto nova = arquivo novo).
-- 2) Lista rápida passa a reconhecer foto guardada no Storage.
-- 3) Tabela de ABORDAGENS (data, local, motivo, resultado, policial).
--
-- NÃO move nenhuma foto sozinha: a cópia das fotos para o Storage é feita
-- depois, por script, com backup antes. Nada é apagado. Idempotente.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V19") → Run.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Bucket de fotos ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sicad-fotos', 'sicad-fotos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS sicad_fotos_select ON storage.objects;
DROP POLICY IF EXISTS sicad_fotos_insert ON storage.objects;
CREATE POLICY sicad_fotos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sicad-fotos' AND sicad_pode_ler());
CREATE POLICY sicad_fotos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sicad-fotos' AND (sicad_pode_cadastrar() OR coalesce(current_user_role() = 'rp', false)));

-- ── 2. Lista rápida: "tem foto" também quando a foto está no Storage ─────
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
       SELECT %s, (p.foto IS NOT NULL AND (p.foto LIKE ''sb:%%'' OR octet_length(p.foto) > 100)) AS tem_foto
       FROM public.sicad_pessoas p', cols);
END $$;
REVOKE ALL ON public.sicad_pessoas_lista FROM anon, PUBLIC;
GRANT SELECT ON public.sicad_pessoas_lista TO authenticated;

-- ── 3. Abordagens ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sicad_abordagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id text NOT NULL REFERENCES sicad_pessoas(id) ON DELETE CASCADE,
  data_hora timestamptz NOT NULL DEFAULT now(),
  local text,
  lat double precision, lng double precision,
  motivo text,
  resultado text,
  acompanhantes text,
  veiculo text,
  ocorrencia text,
  observacao text,
  policial_id uuid DEFAULT auth.uid(),
  policial_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  removido_em timestamptz, removido_por uuid
);
CREATE INDEX IF NOT EXISTS sicad_abordagens_pessoa_idx ON sicad_abordagens(pessoa_id, data_hora DESC) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS sicad_abordagens_data_idx ON sicad_abordagens(data_hora DESC) WHERE removido_em IS NULL;

ALTER TABLE sicad_abordagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_sel ON sicad_abordagens;
DROP POLICY IF EXISTS ab_ins ON sicad_abordagens;
DROP POLICY IF EXISTS ab_upd ON sicad_abordagens;
CREATE POLICY ab_sel ON sicad_abordagens FOR SELECT TO authenticated USING (sicad_pode_ler());
CREATE POLICY ab_ins ON sicad_abordagens FOR INSERT TO authenticated
  WITH CHECK (sicad_pode_cadastrar() OR coalesce(current_user_role() = 'rp', false));
CREATE POLICY ab_upd ON sicad_abordagens FOR UPDATE TO authenticated USING (sicad_pode_editar()) WITH CHECK (sicad_pode_editar());

CREATE OR REPLACE FUNCTION ab_antes_gravar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.policial_id := coalesce(auth.uid(), NEW.policial_id);
    NEW.policial_nome := coalesce((SELECT nome FROM sicad_perfis WHERE id = auth.uid()), NEW.policial_nome);
    NEW.criado_em := now(); NEW.removido_em := NULL; NEW.removido_por := NULL;
    IF NEW.data_hora > now() + interval '10 minutes' THEN NEW.data_hora := now(); END IF;
  ELSE
    NEW.pessoa_id := OLD.pessoa_id; NEW.policial_id := OLD.policial_id; NEW.policial_nome := OLD.policial_nome; NEW.criado_em := OLD.criado_em;
    IF NEW.removido_em IS NOT NULL AND OLD.removido_em IS NULL THEN NEW.removido_por := auth.uid(); END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ab_antes ON sicad_abordagens;
CREATE TRIGGER ab_antes BEFORE INSERT OR UPDATE ON sicad_abordagens FOR EACH ROW EXECUTE FUNCTION ab_antes_gravar();

NOTIFY pgrst, 'reload schema';

SELECT (SELECT count(*) FROM storage.buckets WHERE id = 'sicad-fotos') AS bucket_fotos,
       (SELECT count(*) FROM sicad_pessoas_lista WHERE tem_foto) AS pessoas_com_foto,
       to_regclass('public.sicad_abordagens') IS NOT NULL AS tabela_abordagens;

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V19
-- ═══════════════════════════════════════════════════════
