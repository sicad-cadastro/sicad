-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V9 · RP passa a acessar FORAGIDOS
-- Data: 2026-11-09
--
-- RP: Consultar, Capãozinho 3, Face e Foragidos (tudo somente leitura).
-- Em Foragidos o RP vê a lista e pode marcar 🚔 PRESO (fica registrado quem
-- e quando). Continua SEM cadastrar, editar ou excluir foragidos.
--
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V9") → Run. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════

-- RP passa a LER a lista de foragidos
DROP POLICY IF EXISTS "alertas_select" ON sicad_alertas;
CREATE POLICY "alertas_select" ON sicad_alertas FOR SELECT TO authenticated
  USING (sicad_pode_ler());

-- RP pode marcar PRESO (só isso — inserir/editar/excluir continuam bloqueados)
CREATE OR REPLACE FUNCTION sicad_marcar_preso(p_id uuid, p_obs text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text; v_email text;
BEGIN
  IF NOT (sicad_pode_cadastrar() OR coalesce(current_user_role() = 'rp', false)) THEN
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

REVOKE ALL ON FUNCTION sicad_marcar_preso(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sicad_marcar_preso(uuid, text) TO authenticated;

-- ── Foragidos já cadastrados que ainda não estão no banco de pessoas ────
-- a) mesmo CPF de alguém já cadastrado → só vincula (não duplica)
UPDATE sicad_alertas a
   SET pessoa_id = p.id
  FROM sicad_pessoas p
 WHERE a.pessoa_id IS NULL
   AND a.cpf IS NOT NULL
   AND regexp_replace(coalesce(p.cpf,''), '\D', '', 'g') = regexp_replace(a.cpf, '\D', '', 'g')
   AND length(regexp_replace(a.cpf, '\D', '', 'g')) = 11;

-- b) o resto vira cadastro novo de pessoa, já vinculado ao foragido
DO $$
DECLARE r record; v_id uuid;
BEGIN
  FOR r IN SELECT * FROM sicad_alertas WHERE pessoa_id IS NULL LOOP
    v_id := gen_random_uuid();
    INSERT INTO sicad_pessoas (id, nome, cpf, endereco, lat, lng, foto, observacoes, criado_por, criado_em)
    VALUES (v_id, r.nome, r.cpf, r.endereco, r.lat, r.lng, r.foto,
            concat_ws(' · ', '🚨 FORAGIDO (cadastrado pelo módulo Foragidos)',
                      CASE WHEN r.processo IS NOT NULL THEN 'Processo nº ' || r.processo END, r.obs),
            coalesce(r.criado_por::text, 'foragidos'), coalesce(r.criado_em::timestamptz, now()));
    UPDATE sicad_alertas SET pessoa_id = v_id WHERE id = r.id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V9
-- ═══════════════════════════════════════════════════════
