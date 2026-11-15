-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V18 · VÍNCULOS ENTRE CADASTRADOS
-- Data: 2026-11-15
--
-- Liga uma pessoa cadastrada a outra (pai, mãe, irmão, cônjuge, amigo,
-- comparsa, comunica-se com...). Cada vínculo é gravado uma vez e aparece
-- na ficha das duas pessoas.
--   • Ver: qualquer perfil que lê o SICAD
--   • Criar: quem cadastra (inclui RP, ao cadastrar pessoa nova)
--   • Remover: quem edita (fica guardado como removido — nada é apagado)
-- Se uma das pessoas já estiver no módulo INTELIGÊNCIA, o vínculo entra lá
-- também (situação "informado"), e a outra pessoa passa a constar no banco
-- central como relacionada.
-- Não altera nenhum dado existente. Idempotente.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V18") → Run.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sicad_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_a text NOT NULL REFERENCES sicad_pessoas(id) ON DELETE CASCADE,
  pessoa_b text NOT NULL REFERENCES sicad_pessoas(id) ON DELETE CASCADE,
  tipo text NOT NULL,                 -- o que B é de A (ex.: "Mãe" = B é mãe de A)
  observacao text,
  criado_por uuid DEFAULT auth.uid(),
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  removido_em timestamptz, removido_por uuid,
  CHECK (pessoa_a <> pessoa_b)
);
CREATE UNIQUE INDEX IF NOT EXISTS sicad_vinculos_uk ON sicad_vinculos (least(pessoa_a, pessoa_b), greatest(pessoa_a, pessoa_b), tipo) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS sicad_vinculos_a_idx ON sicad_vinculos(pessoa_a) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS sicad_vinculos_b_idx ON sicad_vinculos(pessoa_b) WHERE removido_em IS NULL;

ALTER TABLE sicad_vinculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sv_sel ON sicad_vinculos;
DROP POLICY IF EXISTS sv_ins ON sicad_vinculos;
DROP POLICY IF EXISTS sv_upd ON sicad_vinculos;
CREATE POLICY sv_sel ON sicad_vinculos FOR SELECT TO authenticated USING (sicad_pode_ler());
CREATE POLICY sv_ins ON sicad_vinculos FOR INSERT TO authenticated
  WITH CHECK (sicad_pode_cadastrar() OR coalesce(current_user_role() = 'rp', false));
CREATE POLICY sv_upd ON sicad_vinculos FOR UPDATE TO authenticated USING (sicad_pode_editar()) WITH CHECK (sicad_pode_editar());
-- sem DELETE: remover = marcar removido_em

-- Autoria e proteção
CREATE OR REPLACE FUNCTION sv_antes_gravar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.criado_por := coalesce(auth.uid(), NEW.criado_por);
    NEW.criado_por_nome := coalesce((SELECT nome FROM sicad_perfis WHERE id = auth.uid()), NEW.criado_por_nome);
    NEW.criado_em := now(); NEW.removido_em := NULL; NEW.removido_por := NULL;
  ELSE
    NEW.pessoa_a := OLD.pessoa_a; NEW.pessoa_b := OLD.pessoa_b; NEW.tipo := OLD.tipo;
    NEW.criado_por := OLD.criado_por; NEW.criado_por_nome := OLD.criado_por_nome; NEW.criado_em := OLD.criado_em;
    IF NEW.removido_em IS NOT NULL AND OLD.removido_em IS NULL THEN NEW.removido_por := auth.uid(); END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sv_antes ON sicad_vinculos;
CREATE TRIGGER sv_antes BEFORE INSERT OR UPDATE ON sicad_vinculos FOR EACH ROW EXECUTE FUNCTION sv_antes_gravar();

-- ── Leva o vínculo para o módulo INTELIGÊNCIA (se o módulo existir) ──────
CREATE OR REPLACE FUNCTION int_entidade_de_pessoa(p_id text, cria boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; p sicad_pessoas; v_cpf text;
BEGIN
  SELECT * INTO p FROM sicad_pessoas WHERE id = p_id; IF NOT FOUND THEN RETURN NULL; END IF;
  v_cpf := nullif(regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g'), '');
  IF v_cpf IS NOT NULL AND length(v_cpf) <> 11 THEN v_cpf := NULL; END IF;
  SELECT id INTO v FROM int_entidades WHERE tipo = 'pessoa' AND excluido_em IS NULL
     AND (sicad_pessoa_id = p_id OR (v_cpf IS NOT NULL AND chave = v_cpf))
   ORDER BY (sicad_pessoa_id = p_id) DESC NULLS LAST LIMIT 1;
  IF v IS NOT NULL OR NOT cria THEN RETURN v; END IF;
  INSERT INTO int_entidades (tipo, titulo, chave, dados, sicad_pessoa_id, lat, lng, natureza, fonte, observacoes, criado_por_nome)
  VALUES ('pessoa', coalesce(nullif(trim(p.nome), ''), 'SEM NOME'), v_cpf,
          jsonb_strip_nulls(jsonb_build_object('nome', nullif(trim(p.nome), ''), 'alcunha', nullif(trim(p.apelido), ''), 'cpf', nullif(trim(p.cpf), ''), 'mae', nullif(trim(p.mae), ''))),
          p_id, p.lat, p.lng, 'informado', 'Cadastro SICAD (vínculo entre cadastrados)',
          'Entrou no banco central por estar vinculada a pessoa acompanhada pela Inteligência.', 'Sincronização SICAD')
  RETURNING id INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION int_entidade_de_pessoa(text, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION sv_sync_inteligencia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ea uuid; eb uuid; v_tipo text; marca text := '[sv:' || NEW.id || ']';
        c_fonte constant text := 'Cadastro SICAD (vínculo entre cadastrados)';
BEGIN
  IF to_regclass('public.int_entidades') IS NULL THEN RETURN NEW; END IF;
  BEGIN
    IF NEW.removido_em IS NOT NULL THEN
      UPDATE int_vinculos SET excluido_em = now(), excluido_motivo = 'Vínculo removido no cadastro do SICAD'
       WHERE fonte = c_fonte AND observacoes LIKE '%' || marca || '%' AND excluido_em IS NULL;
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
    ea := int_entidade_de_pessoa(NEW.pessoa_a, false);
    eb := int_entidade_de_pessoa(NEW.pessoa_b, false);
    IF ea IS NULL AND eb IS NULL THEN RETURN NEW; END IF;   -- ninguém acompanhado pela Inteligência
    IF ea IS NULL THEN ea := int_entidade_de_pessoa(NEW.pessoa_a, true); END IF;
    IF eb IS NULL THEN eb := int_entidade_de_pessoa(NEW.pessoa_b, true); END IF;
    v_tipo := CASE
      WHEN NEW.tipo IN ('Pai','Mãe','Filho(a)','Irmão(ã)','Avô / avó','Neto(a)','Tio(a)','Sobrinho(a)','Primo(a)','Cunhado(a)','Padrasto / madrasta','Enteado(a)') THEN 'Parentesco'
      WHEN NEW.tipo = 'Cônjuge / companheiro(a)' THEN 'Cônjuge / companheiro(a)'
      WHEN NEW.tipo = 'Comunica-se com' THEN 'Comunica-se com'
      WHEN NEW.tipo = 'Comparsa / associado' THEN 'Associado a'
      WHEN NEW.tipo = 'Visto junto' THEN 'Visto com'
      ELSE 'Outro' END;
    INSERT INTO int_vinculos (origem_id, destino_id, tipo, situacao, fonte, observacoes, criado_por_nome)
    VALUES (eb, ea, v_tipo, 'informado', c_fonte,
            NEW.tipo || coalesce(' — ' || nullif(trim(NEW.observacao), ''), '') || ' ' || marca, NEW.criado_por_nome);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Vínculo % não enviado à Inteligência: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sv_sync ON sicad_vinculos;
CREATE TRIGGER sv_sync AFTER INSERT OR UPDATE ON sicad_vinculos FOR EACH ROW EXECUTE FUNCTION sv_sync_inteligencia();

NOTIFY pgrst, 'reload schema';

SELECT 'sicad_vinculos pronta' AS resultado, count(*) AS vinculos FROM sicad_vinculos;

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V18
-- ═══════════════════════════════════════════════════════
