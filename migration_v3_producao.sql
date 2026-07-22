-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V3 (Produção)
-- Aplica as correções de segurança, performance e LGPD
-- Data: 2026-07-15
--
-- COMO APLICAR:
-- 1. Supabase Console → SQL Editor
-- 2. Cole este arquivo inteiro
-- 3. Run
-- 4. Verifica que não deu erro
-- ═══════════════════════════════════════════════════════════════════════

-- ── EXTENSIONS ───────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- busca fuzzy em nome/mae
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid, hash


-- ═══════════════════════════════════════════════════════
-- 1. FIX: UUID default em sicad_pessoas e sicad_alertas
-- ═══════════════════════════════════════════════════════
-- Bug: cliente enviava id='p'+Date.now() que colidia em cadastros simultâneos
-- Agora Postgres gera UUID default se cliente não mandar
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='sicad_pessoas' AND column_name='id' AND data_type='uuid') THEN
    ALTER TABLE sicad_pessoas ALTER COLUMN id SET DEFAULT gen_random_uuid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='sicad_alertas' AND column_name='id' AND data_type='uuid') THEN
    ALTER TABLE sicad_alertas ALTER COLUMN id SET DEFAULT gen_random_uuid();
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════
-- 2. FIX: Audit log falsificável (RLS estava with check true)
-- ═══════════════════════════════════════════════════════
DROP POLICY IF EXISTS audit_insert ON sicad_audit;
CREATE POLICY audit_insert ON sicad_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND user_email = auth.jwt() ->> 'email'
  );

-- Só admin/supervisor lê logs; operator lê os próprios
DROP POLICY IF EXISTS audit_select ON sicad_audit;
CREATE POLICY audit_select ON sicad_audit
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM sicad_perfis
      WHERE id = auth.uid()
        AND role IN ('admin','supervisor','auditor')
        AND ativo = true
    )
  );


-- ═══════════════════════════════════════════════════════
-- 3. FIX: Policy de update em sicad_perfis permitia auto-desativar
-- ═══════════════════════════════════════════════════════
DROP POLICY IF EXISTS perfis_update ON sicad_perfis;
CREATE POLICY perfis_update ON sicad_perfis
  FOR UPDATE
  TO authenticated
  USING (
    -- Admin edita qualquer; usuário edita o próprio
    EXISTS (SELECT 1 FROM sicad_perfis WHERE id = auth.uid() AND role = 'admin' AND ativo = true)
    OR id = auth.uid()
  )
  WITH CHECK (
    -- Se é admin, pode tudo
    EXISTS (SELECT 1 FROM sicad_perfis WHERE id = auth.uid() AND role = 'admin' AND ativo = true)
    OR (
      -- Usuário comum só edita nome/matricula do próprio perfil, NÃO role/ativo
      id = auth.uid()
      AND role = (SELECT role FROM sicad_perfis WHERE id = auth.uid())
      AND ativo = (SELECT ativo FROM sicad_perfis WHERE id = auth.uid())
    )
  );


-- ═══════════════════════════════════════════════════════
-- 4. ÍNDICES: busca fuzzy e filtros comuns em sicad_pessoas
-- Ganho esperado: 10-100x em bancos com >1000 registros
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_pessoas_nome_trgm    ON sicad_pessoas USING gin (nome    gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pessoas_apelido_trgm ON sicad_pessoas USING gin (apelido gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pessoas_mae_trgm     ON sicad_pessoas USING gin (mae     gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pessoas_bairro       ON sicad_pessoas (bairro);
CREATE INDEX IF NOT EXISTS idx_pessoas_quadra       ON sicad_pessoas (quadra);
CREATE INDEX IF NOT EXISTS idx_pessoas_cpf          ON sicad_pessoas (cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pessoas_faccionado   ON sicad_pessoas (faccionado) WHERE faccionado = true;
CREATE INDEX IF NOT EXISTS idx_pessoas_criado_em    ON sicad_pessoas (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pessoas_created_by   ON sicad_pessoas (created_by);

CREATE INDEX IF NOT EXISTS idx_alertas_pessoa_id    ON sicad_alertas (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_alertas_criado_em    ON sicad_alertas (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_periculosidade ON sicad_alertas (periculosidade);


-- ═══════════════════════════════════════════════════════
-- 5. FK: sicad_alertas.pessoa_id → sicad_pessoas.id
-- Se pessoa é deletada, alerta perde a referência (não deleta cascata)
-- ═══════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sicad_alertas_pessoa_id_fkey'
  ) THEN
    ALTER TABLE sicad_alertas
      ADD CONSTRAINT sicad_alertas_pessoa_id_fkey
      FOREIGN KEY (pessoa_id) REFERENCES sicad_pessoas(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════
-- 6. LGPD: retenção mínima + coluna de senha hasheada
-- ═══════════════════════════════════════════════════════
-- Adiciona coluna com hash irreversível da senha do investigado
-- A coluna antiga (senha_celular em texto) DEVE ser migrada e depois deletada
ALTER TABLE sicad_pessoas ADD COLUMN IF NOT EXISTS senha_hash text;

-- Ao terminar a migração de código, execute manualmente:
-- UPDATE sicad_pessoas SET senha_hash = encode(digest(senha_celular, 'sha256'), 'hex')
--   WHERE senha_celular IS NOT NULL AND senha_hash IS NULL;
-- ALTER TABLE sicad_pessoas DROP COLUMN senha_celular;


-- ═══════════════════════════════════════════════════════
-- 7. STORAGE: bucket para fotos biométricas (privado)
-- ═══════════════════════════════════════════════════════
-- Executa via API do Supabase Storage — não é SQL puro
-- Vai criar bucket 'faces' privado
-- Manualmente: Supabase Console → Storage → New bucket "faces" → Private


-- ═══════════════════════════════════════════════════════
-- 8. TABELA: cache de geocoding (evita saturar Nominatim)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sicad_geo_cache (
  chave       text PRIMARY KEY,        -- 'bairro:Quadra' normalizado
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  provedor    text,                    -- 'brasilapi'|'nominatim'|'manual'
  precisao    text,                    -- 'endereco'|'quadra'|'bairro'|'aproximada'
  criado_em   timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

ALTER TABLE sicad_geo_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS geo_cache_select ON sicad_geo_cache;
CREATE POLICY geo_cache_select ON sicad_geo_cache
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS geo_cache_insert ON sicad_geo_cache;
CREATE POLICY geo_cache_insert ON sicad_geo_cache
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS geo_cache_update ON sicad_geo_cache;
CREATE POLICY geo_cache_update ON sicad_geo_cache
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════════════════
-- 9. SIGNUP: desabilita signup público (só admin cria conta)
-- ═══════════════════════════════════════════════════════
-- Isso é feito no Supabase Console → Authentication → Settings
-- Desmarcar "Enable Sign Ups"
-- ⚠ Faça isso MANUALMENTE após rodar esse SQL


-- ═══════════════════════════════════════════════════════
-- 10. AUDIT: adiciona coluna IP se não existe (era referenciada mas não estava)
-- ═══════════════════════════════════════════════════════
ALTER TABLE sicad_audit ADD COLUMN IF NOT EXISTS ip text;


-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V3
-- Data: 2026-07-15
-- ═══════════════════════════════════════════════════════
