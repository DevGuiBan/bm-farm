-- =====================================================================
-- Remove os prazos. A produtividade passa a ser medida por metas.
-- counts_for_operator fica: separa do tempo médio a etapa que depende do cliente.
-- =====================================================================
drop function public.update_stage_setting(public.stage, int, boolean);
drop function public.operator_metrics(date, date);
drop function public.stage_durations(date, date, uuid);
drop view public.client_overview;

create or replace function public.apply_stage(p_client clients, p_to stage, p_outcome text, p_actor uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_counts boolean; v_rework uuid;
begin
  select counts_for_operator into v_counts from stage_settings where stage = p_client.stage;
  if p_outcome = 'retorno' then
    select operator_id into v_rework from stage_history
     where client_id = p_client.id and stage = p_to and outcome = 'avanco' order by id desc limit 1;
  end if;
  insert into stage_history (client_id, stage, operator_id, entered_at, to_stage, outcome, rework_of,
                             counts_for_operator, moved_by, reason)
  values (p_client.id, p_client.stage, p_client.assigned_to, p_client.stage_entered_at, p_to, p_outcome, v_rework,
          coalesce(v_counts, false), p_actor, nullif(trim(p_reason), ''));
  update clients set stage = p_to, stage_entered_at = now(),
    completed_at = case when p_to = 'concluido' then now() end where id = p_client.id;
  perform log_event(p_actor, p_client.id, 'etapa_' || p_outcome,
    jsonb_build_object('de', p_client.stage, 'para', p_to, 'motivo', p_reason));
end $$;

alter table public.stage_settings drop column sla_hours;
alter table public.stage_history drop column sla_hours;

create view public.client_overview with (security_invoker = true) as
  select c.id, c.cnpj, c.legal_name, c.trade_name, c.stage, c.stage_entered_at, c.priority, c.created_at, c.completed_at,
    c.assigned_to, p.full_name as assigned_name,
    round((extract(epoch from now() - c.stage_entered_at) / 3600)::numeric, 1) as hours_in_stage
  from public.clients c
  left join public.profiles p on p.id = c.assigned_to;

create function public.operator_metrics(p_from date, p_to date) returns table (
  operator_id uuid, full_name text, role user_role, active boolean, monthly_goal int,
  completed bigint, completed_month bigint, advances bigint, rework bigint,
  avg_hours numeric, open_now bigint, actions bigint, active_days bigint, last_action timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with b as (select (p_from::timestamp at time zone 'America/Sao_Paulo') f,
                    ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') t,
                    (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') m)
  select p.id, p.full_name, p.role, p.active, p.monthly_goal,
    h.completed, hm.n, h.advances, rw.n, h.avg_hours, o.n, a.n, a.days, a.last
  from profiles p cross join b
  cross join lateral (select
      count(*) filter (where s.to_stage = 'concluido') completed,
      count(*) filter (where s.outcome = 'avanco') advances,
      round((avg(extract(epoch from s.left_at - s.entered_at) / 3600)
        filter (where s.outcome = 'avanco' and s.counts_for_operator))::numeric, 1) avg_hours
    from stage_history s where s.operator_id = p.id and s.left_at >= b.f and s.left_at < b.t) h
  cross join lateral (select count(*) n from stage_history s
    where s.operator_id = p.id and s.to_stage = 'concluido' and s.left_at >= b.m) hm
  cross join lateral (select count(*) n from stage_history s
    where s.rework_of = p.id and s.left_at >= b.f and s.left_at < b.t) rw
  cross join lateral (select count(*) n from clients c
    where c.assigned_to = p.id and c.stage not in ('concluido', 'cancelado')) o
  cross join lateral (select count(*) n, count(distinct (l.created_at at time zone 'America/Sao_Paulo')::date) days,
      max(l.created_at) last
    from activity_log l where l.actor_id = p.id and l.created_at >= b.f and l.created_at < b.t) a
  where (is_admin() or (is_staff() and p.id = auth.uid()))
  order by h.completed desc, h.advances desc, p.full_name
$$;

create function public.stage_durations(p_from date, p_to date, p_operator uuid default null)
returns table (stage stage, avg_hours numeric, samples bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select ss.stage, round(avg(extract(epoch from h.left_at - h.entered_at) / 3600)::numeric, 1), count(h.id)
  from stage_settings ss
  left join stage_history h on h.stage = ss.stage and h.outcome = 'avanco'
    and (h.left_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
    and (p_operator is null or h.operator_id = p_operator)
    and (is_admin() or h.operator_id = auth.uid())
  where is_staff()
  group by ss.stage, ss.position order by ss.position
$$;

-- O que é recriado volta a nascer com permissões padrão: repetir as travas.
revoke all on public.client_overview from anon, authenticated, public;
revoke all on function public.operator_metrics(date, date), public.stage_durations(date, date, uuid) from anon, authenticated, public;
grant select on public.client_overview to authenticated;
grant execute on function public.operator_metrics(date, date), public.stage_durations(date, date, uuid) to authenticated;
grant all on public.client_overview to service_role;
grant execute on function public.operator_metrics(date, date), public.stage_durations(date, date, uuid) to service_role;
