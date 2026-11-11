-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V15 · Faccionados do SICAD → Módulo INTELIGÊNCIA
-- Data: 2026-11-11  (requer a V14)
--
-- Toda pessoa marcada como FACCIONADO no cadastro do SICAD entra
-- automaticamente no banco central de inteligência:
--   • pessoa (registro único: reaproveita se já existir pelo CPF)
--   • se a facção for definida (PCC, Comando Vermelho...): cria a organização
--     e o vínculo "Integrante declarado de" com situação INFORMADO
--   • "POSSÍVEL FACCIONADO / POSSÍVEL ORCRIM" ou facção em branco: entra só a
--     pessoa, SEM vínculo (não se classifica ninguém por suposição)
--   • desmarcou no SICAD: o vínculo é ARQUIVADO com motivo (nada é apagado)
--
-- Já processa os faccionados existentes. Nunca bloqueia o salvamento do
-- SICAD (erro na sincronização vira aviso no log). Idempotente.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V15") → Run.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION int_sync_pessoa_faccionada(p sicad_pessoas, desmarcou boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ent uuid; v_org uuid; v_cpf text; v_fac text; v_org_nome text; v_def boolean;
  v_dados jsonb;
  c_fonte constant text := 'Cadastro SICAD (marcado como faccionado)';
BEGIN
  v_cpf := nullif(regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g'), '');
  IF v_cpf IS NOT NULL AND length(v_cpf) <> 11 THEN v_cpf := NULL; END IF;

  SELECT id INTO v_ent FROM int_entidades
   WHERE tipo = 'pessoa' AND excluido_em IS NULL
     AND (sicad_pessoa_id = p.id::text OR (v_cpf IS NOT NULL AND chave = v_cpf))
   ORDER BY (sicad_pessoa_id = p.id::text) DESC NULLS LAST LIMIT 1;

  -- Desmarcado no SICAD: arquiva vínculos gerados por ele
  IF desmarcou THEN
    IF v_ent IS NOT NULL THEN
      UPDATE int_entidades SET dados = dados || '{"faccionado_sicad": false}'::jsonb WHERE id = v_ent;
      UPDATE int_vinculos SET excluido_em = now(), excluido_motivo = 'Desmarcado como faccionado no cadastro do SICAD'
       WHERE origem_id = v_ent AND fonte = c_fonte AND excluido_em IS NULL;
    END IF;
    RETURN;
  END IF;

  v_dados := jsonb_strip_nulls(jsonb_build_object(
    'nome', nullif(trim(p.nome), ''), 'alcunha', nullif(trim(p.apelido), ''), 'cpf', nullif(trim(p.cpf), ''),
    'mae', nullif(trim(p.mae), ''), 'nascimento', nullif(trim(p.nascimento::text), ''),
    'endereco', nullif(concat_ws(', ', nullif(trim(p.endereco), ''), 'Qd ' || nullif(trim(p.quadra), ''), nullif(trim(p.bairro), '')), ''),
    'faccionado_sicad', true, 'faccao_sicad', nullif(trim(p.faccao), '')));

  IF v_ent IS NULL THEN
    INSERT INTO int_entidades (tipo, titulo, chave, dados, sicad_pessoa_id, lat, lng, natureza, fonte, observacoes, criado_por_nome)
    VALUES ('pessoa', coalesce(nullif(trim(p.nome), ''), 'SEM NOME'), v_cpf, v_dados, p.id::text,
            p.lat::double precision, p.lng::double precision, 'informado', c_fonte,
            'Entrou automaticamente: marcado como faccionado no cadastro do SICAD' || coalesce(' (' || nullif(trim(p.faccao), '') || ')', '') || '.',
            'Sincronização SICAD')
    RETURNING id INTO v_ent;
  ELSE
    UPDATE int_entidades SET dados = dados || v_dados, sicad_pessoa_id = coalesce(sicad_pessoa_id, p.id::text),
           lat = coalesce(lat, p.lat::double precision), lng = coalesce(lng, p.lng::double precision)
     WHERE id = v_ent;
  END IF;

  -- Facção definida? (POSSÍVEL..., SIM, em branco = não definida)
  v_fac := upper(trim(coalesce(p.faccao, '')));
  v_fac := translate(v_fac, 'ÁÀÂÃÉÊÍÓÔÕÚÇ', 'AAAAEEIOOOUC');
  v_def := v_fac <> '' AND v_fac !~ 'POSS' AND v_fac !~ '^(SIM|NAO|-|\?|X|OUTROS?)$';
  IF v_def THEN
    v_org_nome := CASE
      WHEN v_fac IN ('CV', 'C.V.', 'C V') OR v_fac LIKE 'COMANDO VERMELHO%' THEN 'COMANDO VERMELHO (CV)'
      WHEN v_fac IN ('PCC', 'P.C.C.', 'P C C') OR v_fac LIKE 'PRIMEIRO COMANDO%' THEN 'PRIMEIRO COMANDO DA CAPITAL (PCC)'
      ELSE v_fac END;
    SELECT id INTO v_org FROM int_entidades WHERE tipo = 'organizacao' AND chave = 'faccao:' || v_org_nome AND excluido_em IS NULL LIMIT 1;
    IF v_org IS NULL THEN
      INSERT INTO int_entidades (tipo, titulo, chave, dados, natureza, fonte, observacoes, criado_por_nome)
      VALUES ('organizacao', v_org_nome, 'faccao:' || v_org_nome,
              jsonb_build_object('nome', v_org_nome, 'area_atuacao', 'Facção informada no cadastro do SICAD'),
              'informado', c_fonte, 'Criada automaticamente a partir do campo FACÇÃO do SICAD.', 'Sincronização SICAD')
      RETURNING id INTO v_org;
    END IF;
  END IF;

  -- Facção mudou: arquiva vínculo antigo gerado pelo SICAD
  UPDATE int_vinculos SET excluido_em = now(), excluido_motivo = 'Facção alterada no cadastro do SICAD'
   WHERE origem_id = v_ent AND fonte = c_fonte AND excluido_em IS NULL
     AND destino_id IS DISTINCT FROM v_org;

  IF v_def AND NOT EXISTS (SELECT 1 FROM int_vinculos WHERE origem_id = v_ent AND destino_id = v_org AND excluido_em IS NULL) THEN
    INSERT INTO int_vinculos (origem_id, destino_id, tipo, situacao, fonte, observacoes, criado_por_nome)
    VALUES (v_ent, v_org, 'Integrante declarado de', 'informado', c_fonte,
            'Gerado a partir do campo FACCIONADO/FACÇÃO do cadastro SICAD. Confirmar com documentação antes de usar como fato em relatório.',
            'Sincronização SICAD');
  END IF;
END $$;
REVOKE ALL ON FUNCTION int_sync_pessoa_faccionada(sicad_pessoas, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION trg_sicad_faccionado_inteligencia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Só trabalha quando importa (salvar foto/endereço de não-faccionado não custa nada)
  IF TG_OP = 'UPDATE'
     AND NEW.faccionado IS NOT DISTINCT FROM OLD.faccionado
     AND NEW.faccao IS NOT DISTINCT FROM OLD.faccao
     AND NEW.nome IS NOT DISTINCT FROM OLD.nome
     AND NEW.cpf IS NOT DISTINCT FROM OLD.cpf THEN
    RETURN NEW;
  END IF;
  BEGIN
    IF coalesce(NEW.faccionado, false) THEN
      PERFORM int_sync_pessoa_faccionada(NEW, false);
    ELSIF TG_OP = 'UPDATE' AND coalesce(OLD.faccionado, false) THEN
      PERFORM int_sync_pessoa_faccionada(NEW, true);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Sincronização faccionado → inteligência falhou para %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sicad_faccionado_inteligencia ON sicad_pessoas;
CREATE TRIGGER trg_sicad_faccionado_inteligencia
  AFTER INSERT OR UPDATE ON sicad_pessoas
  FOR EACH ROW EXECUTE FUNCTION trg_sicad_faccionado_inteligencia();

-- Faccionados que já existem
DO $$
DECLARE r sicad_pessoas;
BEGIN
  FOR r IN SELECT * FROM sicad_pessoas WHERE faccionado LOOP
    BEGIN
      PERFORM int_sync_pessoa_faccionada(r, false);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Faccionado % não sincronizado: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência: pessoas faccionadas no banco central e vínculos com facção
SELECT
  (SELECT count(*) FROM sicad_pessoas WHERE faccionado) AS faccionados_sicad,
  (SELECT count(*) FROM int_entidades WHERE tipo = 'pessoa' AND (dados->>'faccionado_sicad')::boolean AND excluido_em IS NULL) AS no_banco_central,
  (SELECT count(*) FROM int_vinculos WHERE fonte = 'Cadastro SICAD (marcado como faccionado)' AND excluido_em IS NULL) AS vinculos_com_faccao;

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V15
-- ═══════════════════════════════════════════════════════
