-- =====================================================================
-- Privilégios e RLS. Leitura por política; escrita só por função.
-- =====================================================================
create view public.client_overview with (security_invoker = true) as
  select c.id, c.cnpj, c.legal_name, c.trade_name, c.stage, c.stage_entered_at, c.priority, c.created_at, c.completed_at,
    c.assigned_to, p.full_name as assigned_name, s.sla_hours, s.counts_for_operator,
    round((extract(epoch from now() - c.stage_entered_at) / 3600)::numeric, 1) as hours_in_stage,
    coalesce(s.counts_for_operator and now() - c.stage_entered_at > s.sla_hours * interval '1 hour', false) as late
  from public.clients c
  left join public.profiles p on p.id = c.assigned_to
  left join public.stage_settings s on s.stage = c.stage;

create view public.activity_feed with (security_invoker = true) as
  select l.id, l.client_id, l.actor_id, l.action, l.meta, l.created_at, p.full_name as actor_name, c.legal_name
  from public.activity_log l
  left join public.profiles p on p.id = l.actor_id
  left join public.clients c on c.id = l.client_id;

create view public.note_feed with (security_invoker = true) as
  select n.id, n.client_id, n.body, n.created_at, p.full_name as author_name
  from public.notes n left join public.profiles p on p.id = n.author_id;

revoke all on all tables in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;

-- portal_invites fica de fora: a equipe nunca lê convites, só o servidor.
grant select on public.profiles, public.stage_settings, public.clients, public.stage_history,
  public.authorizations, public.documents, public.sites, public.checklist_items, public.notes, public.activity_log,
  public.client_overview, public.activity_feed, public.note_feed to authenticated;

grant execute on function
  public.is_staff(), public.is_admin(), public.can_access_client(uuid),
  public.stage_blockers(uuid), public.move_stage(uuid, text, public.stage, text), public.assign_client(uuid, uuid),
  public.transfer_clients(uuid, uuid), public.open_clients_by_member(),
  public.update_client(uuid, text, text, int), public.toggle_checklist(uuid, text, boolean), public.add_note(uuid, text),
  public.create_invite(uuid, text), public.review_document(uuid, boolean, text), public.save_site(uuid, jsonb, boolean),
  public.record_site_reply(uuid, boolean, text),
  public.review_authorization(uuid, boolean, text), public.update_member(uuid, public.user_role, boolean, int),
  public.update_stage_setting(public.stage, int, boolean), public.operator_metrics(date, date),
  public.daily_advances(date, date, uuid), public.stage_durations(date, date, uuid), public.authorization_queue()
  to authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter table public.profiles enable row level security;
alter table public.stage_settings enable row level security;
alter table public.clients enable row level security;
alter table public.stage_history enable row level security;
alter table public.portal_invites enable row level security;
alter table public.authorizations enable row level security;
alter table public.documents enable row level security;
alter table public.sites enable row level security;
alter table public.checklist_items enable row level security;
alter table public.notes enable row level security;
alter table public.activity_log enable row level security;

create policy staff_read on public.profiles for select to authenticated using ((select public.is_staff()));
create policy staff_read on public.stage_settings for select to authenticated using ((select public.is_staff()));
create policy own_or_admin on public.clients for select to authenticated
  using ((select public.is_admin()) or (assigned_to = (select auth.uid()) and (select public.is_staff())));
create policy by_client on public.stage_history for select to authenticated using (public.can_access_client(client_id));
create policy by_client on public.authorizations for select to authenticated using (public.can_access_client(client_id));
create policy by_client on public.documents for select to authenticated using (public.can_access_client(client_id));
create policy by_client on public.sites for select to authenticated using (public.can_access_client(client_id));
create policy by_client on public.checklist_items for select to authenticated using (public.can_access_client(client_id));
create policy by_client on public.notes for select to authenticated using (public.can_access_client(client_id));
create policy admin_or_client on public.activity_log for select to authenticated
  using ((select public.is_admin()) or (client_id is not null and public.can_access_client(client_id)));

-- Arquivos: bucket privado, sem política. Só o servidor assina URLs, e registra cada acesso.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
