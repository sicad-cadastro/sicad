-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V8 · Foragidos de Brazlândia (+ lista rápida da V7)
-- Data: 2026-11-09
--
-- 1. Lista de pessoas mais rápida (mesmo conteúdo da V7 — se já rodou, tudo bem)
-- 2. Foragidos: CPF, endereço, localização, nº do processo e situação PRESO
-- 3. Botão "PRESO": quem pode cadastrar (admin, GTOP, supervisor, operador)
--    marca o foragido como preso; fica registrado quem e quando.
--
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V8") → Run.
-- Idempotente. Nenhum dado existente é apagado.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Lista rápida de pessoas ──────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_pessoas_criado_em ON sicad_pessoas (criado_em DESC);


-- ── 2. Novos campos dos foragidos ───────────────────────────────────────
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS cpf            text;
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS endereco       text;
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS lat            double precision;
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS lng            double precision;
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS gmaps_link     text;
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS processo       text;
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'foragido';
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS preso_em       timestamptz;
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS preso_por      uuid;
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS preso_por_nome text;
ALTER TABLE sicad_alertas ADD COLUMN IF NOT EXISTS preso_obs      text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sicad_alertas_status_check') THEN
    ALTER TABLE sicad_alertas ADD CONSTRAINT sicad_alertas_status_check CHECK (status IN ('foragido','preso'));
  END IF;
END $$;


-- ── 3. Marcar como PRESO (e desfazer, se marcado por engano) ────────────
CREATE OR REPLACE FUNCTION sicad_marcar_preso(p_id uuid, p_obs text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text; v_email text;
BEGIN
  IF NOT sicad_pode_cadastrar() THEN
    RAISE EXCEPTION 'Seu perfil não pode marcar prisão' USING ERRCODE = '42501';
  END IF;
  SELECT nome INTO v_nome FROM sicad_perfis WHERE id = auth.uid();
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  UPDATE sicad_alertas
     SET status = 'preso', preso_em = now(), preso_por = auth.uid(),
         preso_por_nome = v_nome, preso_obs = nullif(trim(p_obs), '')
   WHERE id = p_id AND status <> 'preso';
  IF NOT FOUND THEN RAISE EXCEPTION 'Foragido não encontrado ou já marcado como preso'; END IF;

  INSERT INTO sicad_audit (user_id, user_email, acao, recurso, recurso_id, detalhes)
  VALUES (auth.uid(), v_email, 'foragido_preso', 'sicad_alertas', p_id::text, jsonb_build_object('obs', p_obs));
END $$;

CREATE OR REPLACE FUNCTION sicad_desfazer_preso(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF NOT sicad_pode_editar() THEN
    RAISE EXCEPTION 'Só administrador, GTOP ou supervisor podem desfazer' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  UPDATE sicad_alertas
     SET status = 'foragido', preso_em = NULL, preso_por = NULL, preso_por_nome = NULL, preso_obs = NULL
   WHERE id = p_id;
  INSERT INTO sicad_audit (user_id, user_email, acao, recurso, recurso_id)
  VALUES (auth.uid(), v_email, 'foragido_preso_desfeito', 'sicad_alertas', p_id::text);
END $$;

REVOKE ALL ON FUNCTION sicad_marcar_preso(uuid, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sicad_desfazer_preso(uuid)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sicad_marcar_preso(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION sicad_desfazer_preso(uuid)     TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V8
-- ═══════════════════════════════════════════════════════
