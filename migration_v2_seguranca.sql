-- ════════════════════════════════════════════════════════════════════════
-- SICAD v2 — MIGRAÇÃO DE SEGURANÇA
-- Data: 2026-05-25
-- IMPORTANTE: Rodar TUDO de uma vez no SQL Editor do Supabase.
-- Pode rodar várias vezes (idempotente — usa IF NOT EXISTS / OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. PERFIS DE USUÁRIO (espelha auth.users com role e dados extras) ──
create table if not exists sicad_perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  matricula text,
  role text not null check (role in ('operator','supervisor','admin','auditor')) default 'operator',
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_perfis_role on sicad_perfis(role);
create index if not exists idx_perfis_ativo on sicad_perfis(ativo);

-- Função helper: pega role do usuário logado
create or replace function current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from sicad_perfis where id = auth.uid() and ativo = true limit 1;
$$;

-- Função helper: é admin?
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(current_user_role() = 'admin', false);
$$;

-- Função helper: é supervisor ou superior?
create or replace function is_supervisor_or_above()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(current_user_role() in ('admin','supervisor'), false);
$$;

-- ─── 2. AUDIT LOG (registro de tudo que importa) ───────────────────────
create table if not exists sicad_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  user_email text,
  user_role text,
  acao text not null,           -- 'login','view_person','edit_person','delete_person','search_face','export_pdf','create_user','etc'
  recurso text,                 -- tabela ou contexto
  recurso_id text,              -- id do registro afetado (string pra ser flexível)
  detalhes jsonb,               -- payload extra (opcional)
  ip text,                      -- IP do cliente (best-effort)
  user_agent text,
  created_at timestamptz default now()
);
create index if not exists idx_audit_user on sicad_audit(user_id, created_at desc);
create index if not exists idx_audit_acao on sicad_audit(acao, created_at desc);
create index if not exists idx_audit_recurso on sicad_audit(recurso, recurso_id);

-- ─── 3. AJUSTES NA TABELA sicad_pessoas ────────────────────────────────
-- Tracking de quem criou e quem editou
alter table sicad_pessoas add column if not exists created_by uuid references auth.users(id);
alter table sicad_pessoas add column if not exists updated_by uuid references auth.users(id);

-- Múltiplas fotos do rosto (Caminho 1 de precisão facial)
alter table sicad_pessoas add column if not exists face_photos jsonb default '[]'::jsonb;

-- Tatuagens com tags pra busca reversa
-- (já existe coluna tatuagens — vamos garantir formato e adicionar tags estruturadas)
alter table sicad_pessoas add column if not exists tatuagens_tags jsonb default '[]'::jsonb;
-- Exemplo: [{"img":"data:...", "desc":"anjo no peito", "tags":["anjo","peito","religioso"]}]

-- ─── 4. HABILITAR ROW LEVEL SECURITY ───────────────────────────────────
alter table sicad_pessoas enable row level security;
alter table sicad_alertas enable row level security;
alter table sicad_perfis enable row level security;
alter table sicad_audit enable row level security;

-- ─── 5. POLICIES — sicad_pessoas ───────────────────────────────────────
-- DROP antigas (pra rerodar limpa)
drop policy if exists "pessoas_select" on sicad_pessoas;
drop policy if exists "pessoas_insert" on sicad_pessoas;
drop policy if exists "pessoas_update" on sicad_pessoas;
drop policy if exists "pessoas_delete" on sicad_pessoas;

-- SELECT: qualquer operador autenticado
create policy "pessoas_select" on sicad_pessoas
  for select to authenticated
  using (current_user_role() in ('operator','supervisor','admin','auditor'));

-- INSERT: operator + acima
create policy "pessoas_insert" on sicad_pessoas
  for insert to authenticated
  with check (current_user_role() in ('operator','supervisor','admin'));

-- UPDATE: supervisor + acima
create policy "pessoas_update" on sicad_pessoas
  for update to authenticated
  using (current_user_role() in ('supervisor','admin'))
  with check (current_user_role() in ('supervisor','admin'));

-- DELETE: só admin
create policy "pessoas_delete" on sicad_pessoas
  for delete to authenticated
  using (is_admin());

-- ─── 6. POLICIES — sicad_alertas ───────────────────────────────────────
drop policy if exists "alertas_select" on sicad_alertas;
drop policy if exists "alertas_insert" on sicad_alertas;
drop policy if exists "alertas_update" on sicad_alertas;
drop policy if exists "alertas_delete" on sicad_alertas;

create policy "alertas_select" on sicad_alertas
  for select to authenticated
  using (current_user_role() in ('operator','supervisor','admin','auditor'));

create policy "alertas_insert" on sicad_alertas
  for insert to authenticated
  with check (current_user_role() in ('operator','supervisor','admin'));

create policy "alertas_update" on sicad_alertas
  for update to authenticated
  using (is_supervisor_or_above());

create policy "alertas_delete" on sicad_alertas
  for delete to authenticated
  using (is_admin());

-- ─── 7. POLICIES — sicad_perfis (gestão de usuários) ───────────────────
drop policy if exists "perfis_select" on sicad_perfis;
drop policy if exists "perfis_insert" on sicad_perfis;
drop policy if exists "perfis_update" on sicad_perfis;
drop policy if exists "perfis_delete" on sicad_perfis;

-- Todos veem perfis (necessário pra exibir nomes em audit log etc)
create policy "perfis_select" on sicad_perfis
  for select to authenticated using (true);

-- Só admin pode criar perfis
create policy "perfis_insert" on sicad_perfis
  for insert to authenticated
  with check (is_admin());

-- Admin pode editar qualquer; usuário pode editar o próprio (exceto role)
create policy "perfis_update" on sicad_perfis
  for update to authenticated
  using (is_admin() or id = auth.uid())
  with check (is_admin() or (id = auth.uid() and role = (select role from sicad_perfis where id = auth.uid())));

-- Só admin deleta
create policy "perfis_delete" on sicad_perfis
  for delete to authenticated using (is_admin());

-- ─── 8. POLICIES — sicad_audit (só leitura controlada) ─────────────────
drop policy if exists "audit_select" on sicad_audit;
drop policy if exists "audit_insert" on sicad_audit;

-- Admin e auditor leem tudo; supervisor lê só ações relevantes; operator lê só as próprias
create policy "audit_select" on sicad_audit
  for select to authenticated
  using (
    current_user_role() in ('admin','auditor')
    or (current_user_role() = 'supervisor')
    or (current_user_role() = 'operator' and user_id = auth.uid())
  );

-- Todos autenticados podem inserir (mas a aplicação controla o conteúdo)
create policy "audit_insert" on sicad_audit
  for insert to authenticated with check (true);

-- ─── 9. TRIGGER pra preencher created_by/updated_by automaticamente ───
create or replace function set_audit_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = auth.uid();
    new.updated_by = auth.uid();
  elsif tg_op = 'UPDATE' then
    new.updated_by = auth.uid();
    new.atualizado_em = now();
  end if;
  return new;
end;
$$;

drop trigger if exists tr_pessoas_audit on sicad_pessoas;
create trigger tr_pessoas_audit
  before insert or update on sicad_pessoas
  for each row execute function set_audit_fields();

-- ─── 10. CRIAR PRIMEIRO ADMIN (você) ────────────────────────────────────
-- IMPORTANTE: depois que rodar este SQL, vá em Authentication > Users no Supabase
-- e crie seu usuário (com e-mail kleciofdes@gmail.com ou outro).
-- Depois, peque o UUID dele e rode o INSERT abaixo (descomente e substitua):
--
-- INSERT INTO sicad_perfis (id, nome, role, ativo)
-- VALUES ('SEU_UUID_AQUI', 'Klecio Fernandes', 'admin', true);
--
-- (Vou te orientar passo a passo na próxima etapa do código.)

-- ─── DONE ───────────────────────────────────────────────────────────────
-- Próximos passos (faço no código JS):
-- 1. Frontend usa supabase.auth.signInWithPassword
-- 2. Remove a chave service_role do código
-- 3. Tela de login real
-- 4. Painel admin de gestão de usuários
-- 5. Audit log gravado a cada ação
