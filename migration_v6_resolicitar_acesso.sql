-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V6 · Usuário excluído pode solicitar acesso de novo
-- Data: 2026-11-06
--
-- PROBLEMA: excluir um usuário apaga só o perfil (sicad_perfis). A conta de
-- login continua existindo (precisa, por causa do histórico de auditoria),
-- então ao pedir cadastro de novo o Supabase diz "e-mail já existe" e o
-- pedido nunca aparece para aprovação.
--
-- SOLUÇÃO: função que recria o pedido de acesso (perfil PENDENTE, perfil RP,
-- inativo) para quem já tem conta mas não tem perfil. Só funciona para o
-- próprio usuário logado e NUNCA reativa ninguém sozinho — o admin continua
-- tendo que aprovar.
--
-- COMO APLICAR: SQL Editor → cole o ARQUIVO INTEIRO (termina em
-- "FIM DA MIGRATION V6") → Run. Idempotente. Nenhum dado é apagado.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sicad_resolicitar_acesso(p_nome text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_meta  jsonb;
  v_nome  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  -- Já tem perfil (ativo, pendente ou desativado)? Não mexe em nada.
  IF EXISTS (SELECT 1 FROM sicad_perfis WHERE id = v_uid) THEN
    RETURN 'existe';
  END IF;

  SELECT email, raw_user_meta_data INTO v_email, v_meta FROM auth.users WHERE id = v_uid;
  v_nome := coalesce(nullif(trim(p_nome), ''), nullif(trim(v_meta->>'nome'), ''), split_part(v_email, '@', 1));

  INSERT INTO sicad_perfis (id, nome, role, ativo, pode_excluir)
  VALUES (v_uid, left(v_nome, 120), 'rp', false, false);

  INSERT INTO sicad_audit (user_id, user_email, acao, recurso, recurso_id)
  VALUES (v_uid, v_email, 'resolicitar_acesso', 'sicad_perfis', v_uid::text);

  RETURN 'criado';
END $$;

REVOKE ALL ON FUNCTION sicad_resolicitar_acesso(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sicad_resolicitar_acesso(text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- PARTE 2 · DESEMPENHO — lista leve de pessoas
-- O app baixava os cadastros COM todas as fotos e tatuagens a cada abertura
-- do Painel/Consultar. Esta view entrega tudo MENOS as imagens (+ um
-- indicador "tem_foto"); as fotos passam a ser baixadas só quando aparecem.
-- security_invoker = as mesmas regras de acesso (RLS) da tabela valem aqui.
-- Se algum dia criar coluna nova em sicad_pessoas, rode esta parte de novo.
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
       SELECT %s, (p.foto IS NOT NULL AND length(p.foto) > 100) AS tem_foto
       FROM public.sicad_pessoas p', cols);
END $$;

REVOKE ALL ON public.sicad_pessoas_lista FROM anon, PUBLIC;
GRANT SELECT ON public.sicad_pessoas_lista TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V6
-- ═══════════════════════════════════════════════════════
