-- ═══════════════════════════════════════════════════════════════════════
-- SICAD — Migration V20 · URGENTE: fecha o bucket de fotos
-- Data: 2026-11-16
--
-- O bucket "sicad-fotos" já existia (março/2026) com regras antigas que
-- deixavam QUALQUER PESSOA SEM LOGIN listar, baixar e enviar arquivos.
-- Esta migration remove TODAS as regras que citam esse bucket e recria só:
--   • ver:    usuário logado com perfil ativo que lê o SICAD
--   • enviar: quem cadastra (inclui RP)
--   • sem alterar / sem apagar
-- Também garante que os buckets dos módulos continuem fechados.
-- Não apaga nenhuma foto. Idempotente.
-- Cole o ARQUIVO INTEIRO (termina em "FIM DA MIGRATION V20") → Run.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Remove toda regra (policy) antiga que mencione o bucket sicad-fotos
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (coalesce(qual, '') ILIKE '%sicad-fotos%' OR coalesce(with_check, '') ILIKE '%sicad-fotos%'
            OR coalesce(qual, '') ILIKE '%sicad_fotos%' OR coalesce(with_check, '') ILIKE '%sicad_fotos%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
    RAISE NOTICE 'Removida regra antiga: %', p.policyname;
  END LOOP;
END $$;

-- 2) Remove regras genéricas abertas (valem para QUALQUER bucket) dadas a anon/public
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
       AND coalesce(qual, 'true') NOT ILIKE '%bucket_id%'
       AND coalesce(with_check, 'true') NOT ILIKE '%bucket_id%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
    RAISE NOTICE 'Removida regra aberta para qualquer bucket: %', p.policyname;
  END LOOP;
END $$;

-- 3) Bucket privado e só imagens
UPDATE storage.buckets SET public = false, file_size_limit = 10485760,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif']
 WHERE id = 'sicad-fotos';

-- 4) Regras corretas
CREATE POLICY sicad_fotos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sicad-fotos' AND sicad_pode_ler());
CREATE POLICY sicad_fotos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sicad-fotos' AND (sicad_pode_cadastrar() OR coalesce(current_user_role() = 'rp', false)));

-- Conferência: deve listar SÓ as duas regras novas para sicad-fotos
SELECT policyname, cmd, roles FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (coalesce(qual, '') ILIKE '%sicad-fotos%' OR coalesce(with_check, '') ILIKE '%sicad-fotos%')
 ORDER BY 1;

-- ═══════════════════════════════════════════════════════
-- FIM DA MIGRATION V20
-- ═══════════════════════════════════════════════════════
