-- =====================================================================
-- Esquema principal
-- =====================================================================
create type public.user_role as enum ('admin', 'operador');
create type public.stage as enum
  ('autorizacao', 'documentos', 'site', 'meta', 'verificacao', 'concluido', 'cancelado');
create type public.review_status as enum ('pendente', 'aprovado', 'recusado', 'revogado');
create type public.doc_kind as enum
  ('contrato_social', 'comprovante_endereco', 'documento_signatario', 'procuracao', 'aprovacao_site', 'outro');
create type public.site_status as enum ('rascunho', 'em_aprovacao', 'aprovado', 'ajustes');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text not null unique check (email = lower(email)),
  role public.user_role not null default 'operador',
  active boolean not null default true,
  monthly_goal int not null default 0 check (monthly_goal between 0 and 1000),
  created_at timestamptz not null default now()
);

create table public.stage_settings (
  stage public.stage primary key,
  position int not null unique,
  sla_hours int not null check (sla_hours between 1 and 2000),
  counts_for_operator boolean not null default true
);
insert into public.stage_settings values
  ('autorizacao', 1, 72, false),  -- depende do cliente: não pesa no prazo do operador
  ('documentos',  2, 48, true),
  ('site',        3, 24, true),
  ('meta',        4, 24, true),
  ('verificacao', 5, 96, true);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  legal_name text not null,
  trade_name text,
  registry jsonb not null default '{}',      -- retrato do cadastro público (Receita)
  partners text[] not null default '{}',     -- quadro societário no cadastro público
  contact_name text not null,
  contact_email text not null check (contact_email = lower(contact_email) and contact_email like '%_@_%'),
  contact_phone text,
  domain text,                               -- declarados pelo cliente ao assinar
  public_phone text,
  priority int not null default 2 check (priority between 1 and 3),
  stage public.stage not null default 'autorizacao',
  stage_entered_at timestamptz not null default now(),
  assigned_to uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  -- domínio próprio do cliente: subdomínios gratuitos de hospedagem não valem
  constraint domain_is_own check (
    domain is null or (
      domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$'
      and domain !~ '(^|\.)(pages\.dev|workers\.dev|netlify\.app|vercel\.app|github\.io|web\.app|firebaseapp\.com|herokuapp\.com|onrender\.com|wixsite\.com|blogspot\.com|wordpress\.com|myshopify\.com)$'
    )
  )
);
create index on public.clients (assigned_to, stage);

create table public.stage_history (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients (id),
  stage public.stage not null,
  operator_id uuid references public.profiles (id),  -- responsável durante a passagem
  entered_at timestamptz not null,
  left_at timestamptz not null default now(),
  to_stage public.stage not null,
  outcome text not null check (outcome in ('avanco', 'retorno', 'cancelamento', 'reabertura')),
  rework_of uuid references public.profiles (id),     -- quem havia avançado a etapa devolvida
  sla_hours int,
  counts_for_operator boolean not null default false,
  moved_by uuid references public.profiles (id),
  reason text
);
create index on public.stage_history (operator_id, left_at);
create index on public.stage_history (client_id);

create table public.portal_invites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  token_hash text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 days',
  revoked_at timestamptz,
  last_used_at timestamptz
);

create table public.authorizations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  signer_name text not null,
  signer_role text not null check (signer_role in ('socio', 'procurador')),
  signer_email text not null,
  cnpj text not null,
  domain text not null,
  public_phone text not null,
  terms_version text not null,
  terms_sha256 text not null,
  ip text,
  user_agent text,
  signer_in_registry boolean not null,
  signed_at timestamptz not null default now(),
  status public.review_status not null default 'pendente',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  revoked_at timestamptz
);
create unique index one_live_authorization on public.authorizations (client_id)
  where status in ('pendente', 'aprovado');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  kind public.doc_kind not null,
  storage_path text not null unique,
  file_name text not null,
  mime text not null,
  size_bytes bigint not null,
  sha256 text not null,
  uploaded_by uuid not null references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  status public.review_status not null default 'pendente',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text
);
create index on public.documents (client_id);

create table public.sites (
  client_id uuid primary key references public.clients (id),
  content jsonb not null default '{}',
  status public.site_status not null default 'rascunho',
  client_note text,
  approved_at timestamptz,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.checklist_items (
  client_id uuid not null references public.clients (id),
  key text not null,
  stage public.stage not null,
  position int not null,
  label text not null,
  done_at timestamptz,
  done_by uuid references public.profiles (id),
  primary key (client_id, key)
);

create table public.notes (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients (id),
  author_id uuid not null references public.profiles (id),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id),  -- null = cliente ou sistema
  client_id uuid references public.clients (id),
  action text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.activity_log (actor_id, created_at);
create index on public.activity_log (client_id, created_at);

-- ---------- Integridade ----------------------------------------------
create function public.forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'Registro imutável: %', tg_table_name using errcode = '42501';
end $$;
create trigger audit_immutable before update or delete on public.activity_log
  for each row execute function public.forbid_change();
create trigger history_immutable before update or delete on public.stage_history
  for each row execute function public.forbid_change();
create trigger documents_no_delete before delete on public.documents
  for each row execute function public.forbid_change();
create trigger authorizations_no_delete before delete on public.authorizations
  for each row execute function public.forbid_change();

create function public.documents_guard() returns trigger language plpgsql as $$
begin
  if (new.client_id, new.kind, new.storage_path, new.file_name, new.mime, new.size_bytes, new.sha256, new.uploaded_by, new.uploaded_at)
     is distinct from
     (old.client_id, old.kind, old.storage_path, old.file_name, old.mime, old.size_bytes, old.sha256, old.uploaded_by, old.uploaded_at) then
    raise exception 'O arquivo original não pode ser alterado' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger documents_original before update on public.documents
  for each row execute function public.documents_guard();

create function public.clients_guard() returns trigger language plpgsql as $$
begin
  if new.cnpj <> old.cnpj or new.registry is distinct from old.registry
     or new.partners is distinct from old.partners or new.contact_email <> old.contact_email then
    raise exception 'CNPJ, cadastro público e e-mail do titular não podem ser alterados' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger clients_identity before update on public.clients
  for each row execute function public.clients_guard();

-- Quem opera não pode se passar pelo titular, nem o contrário.
create function public.separate_people() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'clients' then
    if exists (select 1 from profiles p where p.email = new.contact_email) then
      raise exception 'O e-mail do titular pertence a alguém da equipe';
    end if;
  else
    if exists (select 1 from clients c where c.contact_email = new.email) then
      raise exception 'Este e-mail já pertence ao titular de um cliente';
    end if;
  end if;
  return new;
end $$;
create trigger clients_separate before insert on public.clients
  for each row execute function public.separate_people();
create trigger profiles_separate before insert or update of email on public.profiles
  for each row execute function public.separate_people();
