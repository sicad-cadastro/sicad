-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V14 · MÓDULO INTELIGÊNCIA
-- Data: 2026-11-11
--
-- Cria o banco central de inteligência (tabelas int_*), dossiês, vínculos,
-- documentos (bucket privado int-docs), relatórios, permissões finas e
-- histórico automático de alterações.
--
-- Acesso: SÓ perfis INTELIGÊNCIA e ADMIN (regra no banco, não só na tela).
-- Nada é apagado de verdade: exclusão = arquivamento com motivo (auditado).
-- Não altera nenhuma tabela existente do SICAD. Idempotente.
--
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V14") → Run.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. PERMISSÕES ───────────────────────────────────────────────────────
-- Base de todo INTELIGÊNCIA: visualizar, consultar, ver_dossies.
-- Extras concedidos pelo admin: criar_dossie, cadastrar, editar, anexar,
-- gerar_relatorio, revisar_relatorio, aprovar_relatorio, ver_sigilosos, administrar.
CREATE TABLE IF NOT EXISTS int_acessos (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  perms text[] NOT NULL DEFAULT '{}',
  concedido_por uuid,
  concedido_por_nome text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION int_tem_acesso() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(current_user_role() IN ('admin','inteligencia'), false);
$$;

CREATE OR REPLACE FUNCTION int_pode(p text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN current_user_role() = 'admin' THEN true
    WHEN current_user_role() = 'inteligencia' THEN
      p IN ('visualizar','consultar','ver_dossies')
      OR EXISTS (SELECT 1 FROM int_acessos a WHERE a.user_id = auth.uid() AND p = ANY(a.perms))
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION int_meu_nome() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT nome FROM sicad_perfis WHERE id = auth.uid()), (SELECT email FROM auth.users WHERE id = auth.uid()));
$$;

-- ── 2. BANCO CENTRAL (um registro único por pessoa/veículo/telefone/...) ─
CREATE SEQUENCE IF NOT EXISTS int_codigo_seq;

CREATE TABLE IF NOT EXISTS int_entidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('pessoa','veiculo','telefone','ocorrencia','localidade','organizacao')),
  titulo text NOT NULL,
  chave text,                       -- CPF / placa / número normalizado (evita duplicidade)
  dados jsonb NOT NULL DEFAULT '{}',
  sicad_pessoa_id text,             -- vínculo com o cadastro de pessoas do SICAD
  lat double precision, lng double precision,
  data_fato date,
  natureza text NOT NULL DEFAULT 'documentado' CHECK (natureza IN ('documentado','informado','hipotese')),
  fonte text NOT NULL,
  documento_ref text,
  conf_fonte char(1) CHECK (conf_fonte IN ('A','B','C','D','E','F')),
  conf_info char(1) CHECK (conf_info IN ('1','2','3','4','5','6')),
  observacoes text,
  criado_por uuid DEFAULT auth.uid(), criado_por_nome text, criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid, atualizado_em timestamptz,
  excluido_em timestamptz, excluido_por uuid, excluido_motivo text
);
CREATE UNIQUE INDEX IF NOT EXISTS int_entidades_chave_uk ON int_entidades(tipo, chave) WHERE chave IS NOT NULL AND excluido_em IS NULL;
CREATE INDEX IF NOT EXISTS int_entidades_tipo_idx ON int_entidades(tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS int_entidades_sicad_idx ON int_entidades(sicad_pessoa_id);

-- ── 3. DOSSIÊS ──────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS int_dossie_seq;
CREATE TABLE IF NOT EXISTS int_dossies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text UNIQUE,
  titulo text NOT NULL,
  descricao text,
  objetivo text NOT NULL,
  finalidade text NOT NULL,          -- finalidade do tratamento (LGPD / Lei 13.709 art. 4º III)
  fundamento_legal text NOT NULL,
  classificacao text NOT NULL DEFAULT 'reservado' CHECK (classificacao IN ('reservado','confidencial','secreto')),
  situacao text NOT NULL DEFAULT 'aberto' CHECK (situacao IN ('aberto','em_analise','suspenso','concluido','arquivado')),
  responsavel_id uuid, responsavel_nome text,
  aberto_em date NOT NULL DEFAULT current_date,
  reter_ate date,                    -- controle de retenção
  criado_por uuid DEFAULT auth.uid(), criado_por_nome text, criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid, atualizado_em timestamptz,
  excluido_em timestamptz, excluido_por uuid, excluido_motivo text
);

CREATE TABLE IF NOT EXISTS int_dossie_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossie_id uuid NOT NULL REFERENCES int_dossies(id),
  entidade_id uuid NOT NULL REFERENCES int_entidades(id),
  papel text,
  observacao text,
  criado_por uuid DEFAULT auth.uid(), criado_por_nome text, criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid, atualizado_em timestamptz,
  excluido_em timestamptz, excluido_por uuid, excluido_motivo text
);
CREATE UNIQUE INDEX IF NOT EXISTS int_dossie_itens_uk ON int_dossie_itens(dossie_id, entidade_id) WHERE excluido_em IS NULL;
CREATE INDEX IF NOT EXISTS int_dossie_itens_ent_idx ON int_dossie_itens(entidade_id);

CREATE TABLE IF NOT EXISTS int_andamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossie_id uuid NOT NULL REFERENCES int_dossies(id),
  texto text NOT NULL,
  criado_por uuid DEFAULT auth.uid(), criado_por_nome text, criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid, atualizado_em timestamptz,
  excluido_em timestamptz, excluido_por uuid, excluido_motivo text
);
CREATE INDEX IF NOT EXISTS int_andamentos_dos_idx ON int_andamentos(dossie_id, criado_em DESC);

-- ── 4. VÍNCULOS (análise de relacionamentos) ────────────────────────────
CREATE TABLE IF NOT EXISTS int_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_id uuid NOT NULL REFERENCES int_entidades(id),
  destino_id uuid NOT NULL REFERENCES int_entidades(id),
  tipo text NOT NULL,
  situacao text NOT NULL DEFAULT 'informado' CHECK (situacao IN ('documentado','informado','hipotese')),
  fonte text NOT NULL,
  data_fato date,
  dossie_id uuid REFERENCES int_dossies(id),
  conf_fonte char(1) CHECK (conf_fonte IN ('A','B','C','D','E','F')),
  conf_info char(1) CHECK (conf_info IN ('1','2','3','4','5','6')),
  observacoes text,
  criado_por uuid DEFAULT auth.uid(), criado_por_nome text, criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid, atualizado_em timestamptz,
  excluido_em timestamptz, excluido_por uuid, excluido_motivo text,
  CHECK (origem_id <> destino_id)
);
CREATE INDEX IF NOT EXISTS int_vinculos_o_idx ON int_vinculos(origem_id);
CREATE INDEX IF NOT EXISTS int_vinculos_d_idx ON int_vinculos(destino_id);

-- ── 5. DOCUMENTOS (arquivo no bucket privado int-docs) ──────────────────
CREATE TABLE IF NOT EXISTS int_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE,
  titulo text NOT NULL,
  origem text NOT NULL,
  data_doc date,
  classificacao text NOT NULL DEFAULT 'reservado' CHECK (classificacao IN ('ostensivo','reservado','sigiloso')),
  descricao text,
  storage_path text NOT NULL,
  nome_arquivo text, mime text, tamanho bigint,
  sha256 text NOT NULL,              -- integridade: conferido a cada abertura
  versao int NOT NULL DEFAULT 1,
  doc_raiz_id uuid,
  entidade_id uuid REFERENCES int_entidades(id),
  dossie_id uuid REFERENCES int_dossies(id),
  criado_por uuid DEFAULT auth.uid(), criado_por_nome text, criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid, atualizado_em timestamptz,
  excluido_em timestamptz, excluido_por uuid, excluido_motivo text
);
CREATE INDEX IF NOT EXISTS int_documentos_ent_idx ON int_documentos(entidade_id);
CREATE INDEX IF NOT EXISTS int_documentos_dos_idx ON int_documentos(dossie_id);

-- ── 6. RELATÓRIOS ───────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS int_relatorio_seq;
CREATE TABLE IF NOT EXISTS int_relatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text,
  tipo text NOT NULL CHECK (tipo IN ('individual','consolidado')),
  titulo text NOT NULL,
  dossies uuid[] NOT NULL,
  classificacao text NOT NULL DEFAULT 'reservado' CHECK (classificacao IN ('reservado','confidencial','secreto')),
  secoes jsonb NOT NULL DEFAULT '{}',   -- seções escolhidas + textos (metodologia, análise, lacunas, conclusão)
  versao int NOT NULL DEFAULT 1,
  relatorio_raiz_id uuid,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_revisao','revisado','devolvido','aprovado')),
  parecer text,
  elaborado_por uuid DEFAULT auth.uid(), elaborado_por_nome text,
  revisado_por uuid, revisado_por_nome text, revisado_em timestamptz,
  aprovado_por uuid, aprovado_por_nome text, aprovado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid, atualizado_em timestamptz,
  excluido_em timestamptz, excluido_por uuid, excluido_motivo text
);

-- ── 7. HISTÓRICO DE ALTERAÇÕES (automático, ninguém edita) ──────────────
CREATE TABLE IF NOT EXISTS int_historico (
  id bigserial PRIMARY KEY,
  tabela text NOT NULL,
  registro_id uuid,
  operacao text NOT NULL,
  antes jsonb, depois jsonb,
  usuario uuid, usuario_nome text,
  em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS int_historico_reg_idx ON int_historico(registro_id, em DESC);
CREATE INDEX IF NOT EXISTS int_historico_em_idx ON int_historico(em DESC);

-- ── 8. TRIGGERS: código/número, autoria imutável, histórico ─────────────
CREATE OR REPLACE FUNCTION int_antes_gravar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pref text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'int_relatorios' THEN
      NEW.elaborado_por := coalesce(auth.uid(), NEW.elaborado_por);
      NEW.elaborado_por_nome := coalesce(int_meu_nome(), NEW.elaborado_por_nome);
      NEW.status := 'rascunho';
      IF NEW.numero IS NULL THEN
        NEW.numero := 'RI-' || to_char(now(),'YYYY') || '-' || lpad(nextval('int_relatorio_seq')::text, 4, '0');
      END IF;
      NEW.revisado_por := NULL; NEW.aprovado_por := NULL;
    ELSE
      NEW.criado_por := coalesce(auth.uid(), NEW.criado_por);
      NEW.criado_por_nome := coalesce(int_meu_nome(), NEW.criado_por_nome);
      NEW.criado_em := now();
    END IF;
    NEW.excluido_em := NULL; NEW.excluido_por := NULL; NEW.excluido_motivo := NULL;
    IF TG_TABLE_NAME = 'int_entidades' THEN
      pref := CASE NEW.tipo WHEN 'pessoa' THEN 'P' WHEN 'veiculo' THEN 'V' WHEN 'telefone' THEN 'T'
                            WHEN 'ocorrencia' THEN 'O' WHEN 'localidade' THEN 'L' ELSE 'G' END;
      NEW.codigo := pref || '-' || lpad(nextval('int_codigo_seq')::text, 6, '0');
    ELSIF TG_TABLE_NAME = 'int_documentos' THEN
      NEW.codigo := 'D-' || lpad(nextval('int_codigo_seq')::text, 6, '0');
    ELSIF TG_TABLE_NAME = 'int_dossies' THEN
      NEW.numero := 'DI-' || to_char(now(),'YYYY') || '-' || lpad(nextval('int_dossie_seq')::text, 4, '0');
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: autoria, código e criação não mudam
  IF TG_TABLE_NAME = 'int_relatorios' THEN
    NEW.elaborado_por := OLD.elaborado_por; NEW.elaborado_por_nome := OLD.elaborado_por_nome;
    NEW.numero := OLD.numero; NEW.criado_em := OLD.criado_em;
    IF OLD.status = 'aprovado' AND NEW.excluido_em IS NOT DISTINCT FROM OLD.excluido_em THEN
      RAISE EXCEPTION 'Relatório aprovado não pode ser alterado. Gere uma nova versão.' USING ERRCODE = '42501';
    END IF;
    IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.revisado_por IS DISTINCT FROM OLD.revisado_por OR NEW.aprovado_por IS DISTINCT FROM OLD.aprovado_por)
       AND coalesce(current_setting('int.rpc', true), '') <> '1' THEN
      RAISE EXCEPTION 'Mudança de situação do relatório só pelo fluxo de revisão/aprovação.' USING ERRCODE = '42501';
    END IF;
  ELSE
    NEW.criado_por := OLD.criado_por; NEW.criado_por_nome := OLD.criado_por_nome; NEW.criado_em := OLD.criado_em;
  END IF;
  IF TG_TABLE_NAME IN ('int_entidades','int_documentos') THEN NEW.codigo := OLD.codigo; END IF;
  IF TG_TABLE_NAME = 'int_dossies' THEN NEW.numero := OLD.numero; END IF;
  IF TG_TABLE_NAME = 'int_documentos' THEN
    NEW.storage_path := OLD.storage_path; NEW.sha256 := OLD.sha256; NEW.tamanho := OLD.tamanho; NEW.versao := OLD.versao;
  END IF;
  -- Arquivamento só com motivo (procedimento formal)
  IF NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL AND length(coalesce(trim(NEW.excluido_motivo),'')) < 10 THEN
    RAISE EXCEPTION 'Arquivamento exige motivo (mínimo 10 caracteres).' USING ERRCODE = '42501';
  END IF;
  IF NEW.excluido_em IS NULL AND OLD.excluido_em IS NOT NULL AND current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Só o administrador restaura registro arquivado.' USING ERRCODE = '42501';
  END IF;
  NEW.atualizado_por := auth.uid(); NEW.atualizado_em := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION int_registrar_historico() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO int_historico (tabela, registro_id, operacao, antes, depois, usuario, usuario_nome)
  VALUES (TG_TABLE_NAME,
          CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
          CASE WHEN TG_OP = 'UPDATE' AND NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL THEN 'ARQUIVAMENTO'
               WHEN TG_OP = 'UPDATE' AND NEW.excluido_em IS NULL AND OLD.excluido_em IS NOT NULL THEN 'RESTAURACAO'
               ELSE TG_OP END,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
          auth.uid(), int_meu_nome());
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- Exclusão física é proibida (inclusive pela API)
CREATE OR REPLACE FUNCTION int_bloquear_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Exclusão definitiva não é permitida. Use ARQUIVAR com motivo.' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['int_entidades','int_dossies','int_dossie_itens','int_andamentos','int_vinculos','int_documentos','int_relatorios'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_antes', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION int_antes_gravar()', t||'_antes', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_hist', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION int_registrar_historico()', t||'_hist', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_nodel', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION int_bloquear_delete()', t||'_nodel', t);
  END LOOP;
END $$;

-- ── 9. RLS (regras de acesso no banco) ──────────────────────────────────
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['int_acessos','int_entidades','int_dossies','int_dossie_itens','int_andamentos','int_vinculos','int_documentos','int_relatorios','int_historico'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Permissões
CREATE POLICY int_acessos_sel ON int_acessos FOR SELECT TO authenticated USING (int_tem_acesso());
CREATE POLICY int_acessos_ins ON int_acessos FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (int_pode('administrar') AND user_id <> auth.uid()));
CREATE POLICY int_acessos_upd ON int_acessos FOR UPDATE TO authenticated
  USING (is_admin() OR (int_pode('administrar') AND user_id <> auth.uid()))
  WITH CHECK (is_admin() OR (int_pode('administrar') AND user_id <> auth.uid()));

-- Banco central
CREATE POLICY int_ent_sel ON int_entidades FOR SELECT TO authenticated USING (int_pode('consultar'));
CREATE POLICY int_ent_ins ON int_entidades FOR INSERT TO authenticated WITH CHECK (int_pode('cadastrar'));
CREATE POLICY int_ent_upd ON int_entidades FOR UPDATE TO authenticated USING (int_pode('editar')) WITH CHECK (int_pode('editar'));

-- Dossiês
CREATE POLICY int_dos_sel ON int_dossies FOR SELECT TO authenticated USING (int_pode('ver_dossies'));
CREATE POLICY int_dos_ins ON int_dossies FOR INSERT TO authenticated WITH CHECK (int_pode('criar_dossie'));
CREATE POLICY int_dos_upd ON int_dossies FOR UPDATE TO authenticated
  USING (int_pode('editar') OR (responsavel_id = auth.uid() AND int_pode('criar_dossie')))
  WITH CHECK (int_pode('editar') OR (responsavel_id = auth.uid() AND int_pode('criar_dossie')));

CREATE POLICY int_itens_sel ON int_dossie_itens FOR SELECT TO authenticated USING (int_pode('ver_dossies'));
CREATE POLICY int_itens_ins ON int_dossie_itens FOR INSERT TO authenticated WITH CHECK (int_pode('cadastrar'));
CREATE POLICY int_itens_upd ON int_dossie_itens FOR UPDATE TO authenticated USING (int_pode('editar')) WITH CHECK (int_pode('editar'));

CREATE POLICY int_and_sel ON int_andamentos FOR SELECT TO authenticated USING (int_pode('ver_dossies'));
CREATE POLICY int_and_ins ON int_andamentos FOR INSERT TO authenticated WITH CHECK (int_pode('cadastrar'));
CREATE POLICY int_and_upd ON int_andamentos FOR UPDATE TO authenticated USING (int_pode('editar')) WITH CHECK (int_pode('editar'));

-- Vínculos
CREATE POLICY int_vin_sel ON int_vinculos FOR SELECT TO authenticated USING (int_pode('consultar'));
CREATE POLICY int_vin_ins ON int_vinculos FOR INSERT TO authenticated WITH CHECK (int_pode('cadastrar'));
CREATE POLICY int_vin_upd ON int_vinculos FOR UPDATE TO authenticated USING (int_pode('editar')) WITH CHECK (int_pode('editar'));

-- Documentos: sigiloso só com permissão (ou quem anexou)
CREATE POLICY int_doc_sel ON int_documentos FOR SELECT TO authenticated
  USING (int_pode('consultar') AND (classificacao <> 'sigiloso' OR int_pode('ver_sigilosos') OR criado_por = auth.uid()));
CREATE POLICY int_doc_ins ON int_documentos FOR INSERT TO authenticated WITH CHECK (int_pode('anexar'));
CREATE POLICY int_doc_upd ON int_documentos FOR UPDATE TO authenticated
  USING (int_pode('editar') AND (classificacao <> 'sigiloso' OR int_pode('ver_sigilosos') OR criado_por = auth.uid()))
  WITH CHECK (int_pode('editar'));

-- Relatórios
CREATE POLICY int_rel_sel ON int_relatorios FOR SELECT TO authenticated USING (int_pode('ver_dossies'));
CREATE POLICY int_rel_ins ON int_relatorios FOR INSERT TO authenticated WITH CHECK (int_pode('gerar_relatorio'));
CREATE POLICY int_rel_upd ON int_relatorios FOR UPDATE TO authenticated
  USING ((elaborado_por = auth.uid() AND int_pode('gerar_relatorio')) OR is_admin())
  WITH CHECK ((elaborado_por = auth.uid() AND int_pode('gerar_relatorio')) OR is_admin());

-- Histórico: só leitura
CREATE POLICY int_hist_sel ON int_historico FOR SELECT TO authenticated USING (int_tem_acesso());

-- ── 10. FLUXO DO RELATÓRIO (revisão / aprovação) ────────────────────────
CREATE OR REPLACE FUNCTION int_relatorio_fluxo(p_id uuid, p_acao text, p_parecer text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r int_relatorios; v_nome text := int_meu_nome(); v_email text;
BEGIN
  SELECT * INTO r FROM int_relatorios WHERE id = p_id AND excluido_em IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relatório não encontrado'; END IF;
  PERFORM set_config('int.rpc', '1', true);

  IF p_acao = 'enviar_revisao' THEN
    IF r.elaborado_por <> auth.uid() AND NOT is_admin() THEN RAISE EXCEPTION 'Só quem elaborou envia para revisão' USING ERRCODE='42501'; END IF;
    IF r.status NOT IN ('rascunho','devolvido') THEN RAISE EXCEPTION 'Relatório não está em rascunho'; END IF;
    UPDATE int_relatorios SET status = 'em_revisao', parecer = NULL WHERE id = p_id;
  ELSIF p_acao = 'revisar' THEN
    IF NOT int_pode('revisar_relatorio') THEN RAISE EXCEPTION 'Sem permissão para revisar' USING ERRCODE='42501'; END IF;
    IF r.elaborado_por = auth.uid() THEN RAISE EXCEPTION 'Quem elaborou não pode revisar o próprio relatório' USING ERRCODE='42501'; END IF;
    IF r.status <> 'em_revisao' THEN RAISE EXCEPTION 'Relatório não está em revisão'; END IF;
    UPDATE int_relatorios SET status = 'revisado', revisado_por = auth.uid(), revisado_por_nome = v_nome, revisado_em = now(), parecer = p_parecer WHERE id = p_id;
  ELSIF p_acao = 'devolver' THEN
    IF NOT (int_pode('revisar_relatorio') OR int_pode('aprovar_relatorio')) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501'; END IF;
    IF r.status NOT IN ('em_revisao','revisado') THEN RAISE EXCEPTION 'Situação não permite devolver'; END IF;
    IF length(coalesce(trim(p_parecer),'')) < 5 THEN RAISE EXCEPTION 'Informe o motivo da devolução'; END IF;
    UPDATE int_relatorios SET status = 'devolvido', parecer = p_parecer WHERE id = p_id;
  ELSIF p_acao = 'aprovar' THEN
    IF NOT int_pode('aprovar_relatorio') THEN RAISE EXCEPTION 'Sem permissão para aprovar' USING ERRCODE='42501'; END IF;
    IF r.elaborado_por = auth.uid() THEN RAISE EXCEPTION 'Quem elaborou não pode aprovar o próprio relatório' USING ERRCODE='42501'; END IF;
    IF r.status <> 'revisado' THEN RAISE EXCEPTION 'O relatório precisa ser revisado antes da aprovação'; END IF;
    UPDATE int_relatorios SET status = 'aprovado', aprovado_por = auth.uid(), aprovado_por_nome = v_nome, aprovado_em = now(),
           parecer = coalesce(p_parecer, parecer) WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Ação inválida';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO sicad_audit (user_id, user_email, acao, recurso, recurso_id, detalhes)
  VALUES (auth.uid(), v_email, 'int_relatorio_' || p_acao, 'int_relatorios', p_id::text, jsonb_build_object('parecer', p_parecer));
  RETURN p_acao;
END $$;
REVOKE ALL ON FUNCTION int_relatorio_fluxo(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION int_relatorio_fluxo(uuid, text, text) TO authenticated;

-- ── 11. STORAGE: bucket privado de documentos ───────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('int-docs', 'int-docs', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 26214400;

DROP POLICY IF EXISTS int_docs_select ON storage.objects;
DROP POLICY IF EXISTS int_docs_insert ON storage.objects;
CREATE POLICY int_docs_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'int-docs' AND int_pode('consultar')
         AND (split_part(name, '/', 1) <> 'sigiloso' OR int_pode('ver_sigilosos') OR owner = auth.uid()));
CREATE POLICY int_docs_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'int-docs' AND int_pode('anexar'));
-- Sem UPDATE/DELETE: arquivo enviado não é sobrescrito nem apagado (nova versão = novo arquivo)

-- ── 12. Auditoria: inteligência lê os registros do módulo ───────────────
-- (já coberto pela v11: admin/inteligência leem sicad_audit)

NOTIFY pgrst, 'reload schema';

-- Conferência: deve listar 9 tabelas int_*
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'int\_%' ORDER BY 1;

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V14
-- ═══════════════════════════════════════════════════════
