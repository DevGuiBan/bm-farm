-- =====================================================================
-- 1. Sai a assinatura pelo sistema: contratos são feitos e guardados por fora.
-- 2. CNPJ repetido é informado e exige confirmação, mas não é impedido.
-- 3. Só conta na meta o portfólio novo, com todas as etapas concluídas.
-- =====================================================================
do $$ begin
  if exists (select 1 from public.authorizations) or exists (select 1 from public.clients) then
    raise exception 'Há BMs ou autorizações cadastradas. Planeje a conversão antes de rodar esta migration.';
  end if;
end $$;

-- ---------- 1. Assinatura ----------------------------------------------
drop function public.create_invite(uuid, text);
drop function public.review_authorization(uuid, boolean, text);
drop function public.portal_sign(uuid, text, text, text, text, text, text, text, text);
drop function public.portal_revoke(uuid);
drop function public.authorization_queue();
drop function public.normalize_name(text);
drop table public.portal_invites;
drop table public.authorizations;

-- O e-mail do titular só servia para o código de assinatura.
drop trigger clients_separate on public.clients;
drop trigger profiles_separate on public.profiles;
drop function public.separate_people();
create or replace function public.clients_guard() returns trigger language plpgsql as $$
begin
  if new.cnpj <> old.cnpj or new.registry is distinct from old.registry or new.partners is distinct from old.partners then
    raise exception 'CNPJ e cadastro público não podem ser alterados' using errcode = '42501';
  end if;
  return new;
end $$;
alter table public.clients drop column contact_email;

delete from public.stage_settings where stage = 'autorizacao';
alter table public.clients alter column stage set default 'documentos';
alter table public.clients add constraint stage_in_use check (stage <> 'autorizacao');

-- ---------- 2. CNPJ repetido -------------------------------------------
alter table public.clients drop constraint clients_cnpj_key;
create index on public.clients (cnpj);

-- ---------- 3. Portfólio -----------------------------------------------
alter table public.clients add column portfolio text not null default 'novo' check (portfolio in ('novo', 'existente'));

-- ---------- Funções ----------------------------------------------------
drop function public.create_client(uuid, text, text, text, jsonb, text[], text, text, text, uuid);
create function public.create_client(
  p_actor uuid, p_cnpj text, p_legal_name text, p_trade_name text, p_registry jsonb, p_partners text[],
  p_contact_name text, p_contact_phone text, p_assigned_to uuid, p_portfolio text, p_reuse boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_role user_role; v_uses int; v_who text;
begin
  select role into v_role from profiles where id = p_actor and active;
  if v_role is null then raise exception 'Usuário sem acesso' using errcode = '42501'; end if;
  if v_role = 'operador' then p_assigned_to := p_actor; end if;
  if p_assigned_to is not null and not exists (select 1 from profiles where id = p_assigned_to and active) then
    raise exception 'Responsável inválido';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_cnpj)); -- dois cadastros simultâneos também se enxergam
  select count(*), string_agg(distinct coalesce(p.full_name, 'sem responsável'), ', ') into v_uses, v_who
    from clients c left join profiles p on p.id = c.assigned_to where c.cnpj = p_cnpj and c.stage <> 'cancelado';
  if v_uses > 0 and not coalesce(p_reuse, false) then
    raise exception 'Este CNPJ já está em uso em % (%).',
      case when v_uses = 1 then '1 BM' else v_uses || ' BMs' end, v_who using errcode = 'BM001';
  end if;
  insert into clients (cnpj, legal_name, trade_name, registry, partners, contact_name, contact_phone, assigned_to, created_by, portfolio)
  values (p_cnpj, p_legal_name, p_trade_name, p_registry, p_partners, p_contact_name, p_contact_phone, p_assigned_to, p_actor, p_portfolio)
  returning id into v_id;
  insert into sites (client_id) values (v_id);
  insert into checklist_items (client_id, key, stage, position, label) values
    (v_id, 'bm_titular',   'meta', 1, 'Portfólio empresarial sob controle da conta do próprio cliente'),
    (v_id, 'bm_parceiro',  'meta', 2, 'Agência adicionada como parceira, com permissões limitadas'),
    (v_id, 'bm_2fa',       'meta', 3, 'Autenticação em dois fatores ativa para os administradores do cliente'),
    (v_id, 'bm_dominio',   'meta', 4, 'Domínio do site verificado na Meta'),
    (v_id, 'vf_dados',     'verificacao', 1, 'Dados enviados conferem com o cadastro público'),
    (v_id, 'vf_envio',     'verificacao', 2, 'Cliente enviou a verificação com os documentos originais'),
    (v_id, 'vf_resultado', 'verificacao', 3, 'Verificação aprovada pela Meta e comunicada ao cliente');
  perform log_event(p_actor, v_id, 'cliente_criado');
  if v_uses > 0 then perform log_event(p_actor, v_id, 'cnpj_reutilizado', jsonb_build_object('outras', v_uses)); end if;
  return v_id;
end $$;

-- Quantas outras BMs usam o mesmo CNPJ, inclusive as que a pessoa não enxerga.
create function public.cnpj_other_uses(p_client uuid) returns bigint language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  perform require_access(p_client);
  return (select count(*) from clients o join clients c on c.cnpj = o.cnpj
    where c.id = p_client and o.id <> c.id and o.stage <> 'cancelado');
end $$;

drop function public.update_client(uuid, text, text, int);
create function public.update_client(p_client uuid, p_trade_name text, p_contact_phone text, p_priority int, p_portfolio text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c clients;
begin
  perform require_access(p_client);
  select * into c from clients where id = p_client for update;
  if p_portfolio is distinct from c.portfolio then
    if c.stage in ('concluido', 'cancelado') then raise exception 'O tipo de portfólio não muda depois do processo encerrado'; end if;
    if p_portfolio = 'novo' and not is_admin() then
      raise exception 'Só um administrador pode mudar o portfólio para novo, porque isso conta na meta';
    end if;
    perform log_event(auth.uid(), p_client, 'portfolio_alterado', jsonb_build_object('portfolio', p_portfolio));
  end if;
  update clients set trade_name = nullif(trim(p_trade_name), ''), contact_phone = nullif(trim(p_contact_phone), ''),
    priority = p_priority, portfolio = p_portfolio where id = p_client;
  perform log_event(auth.uid(), p_client, 'cliente_atualizado');
end $$;

create or replace function public.stage_blockers(p_client uuid) returns text[] language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare c clients; b text[] := '{}'; k doc_kind;
begin
  perform require_access(p_client);
  select * into c from clients where id = p_client;
  if c.stage in ('concluido', 'cancelado') then return b; end if;
  if not exists (select 1 from profiles where id = c.assigned_to and active) then
    b := array_append(b, 'Defina um responsável ativo');
  end if;
  if c.stage = 'documentos' then
    foreach k in array array['contrato_social', 'comprovante_endereco', 'documento_signatario']::doc_kind[] loop
      if not exists (select 1 from documents where client_id = p_client and kind = k and status = 'aprovado') then
        b := array_append(b, 'Documento pendente: ' || case k when 'contrato_social' then 'contrato social'
          when 'comprovante_endereco' then 'comprovante de endereço' else 'documento do signatário' end);
      end if;
    end loop;
  elsif c.stage = 'site' then
    if not exists (select 1 from sites where client_id = p_client and status = 'aprovado') then
      b := array_append(b, 'Cliente ainda não aprovou o conteúdo do site');
    end if;
  elsif c.stage in ('meta', 'verificacao') then
    b := b || coalesce((select array_agg('Checklist: ' || label order by position) from checklist_items
      where client_id = p_client and stage = c.stage and done_at is null), '{}'::text[]);
  end if;
  return b;
end $$;

create or replace function public.move_stage(p_client uuid, p_direction text, p_to stage default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c clients; v_next stage; b text[];
begin
  perform require_access(p_client);
  select * into c from clients where id = p_client for update;
  if p_direction = 'avancar' then
    if c.stage in ('concluido', 'cancelado') then raise exception 'Processo já encerrado'; end if;
    b := stage_blockers(p_client);
    if cardinality(b) > 0 then raise exception '%', array_to_string(b, '; '); end if;
    v_next := (array['site', 'meta', 'verificacao', 'concluido']::stage[])
      [array_position(array['documentos', 'site', 'meta', 'verificacao']::stage[], c.stage)];
    perform apply_stage(c, v_next, 'avanco', auth.uid(), p_reason);
  elsif p_direction = 'devolver' then
    if c.stage = 'cancelado' then raise exception 'Reabra o processo primeiro'; end if;
    if c.stage = 'concluido' then perform require_admin(); end if;
    if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Informe o motivo da devolução'; end if;
    if p_to is null or p_to = 'autorizacao' or p_to >= c.stage then raise exception 'Escolha uma etapa anterior'; end if;
    perform apply_stage(c, p_to, 'retorno', auth.uid(), p_reason);
  elsif p_direction = 'cancelar' then
    if c.stage in ('concluido', 'cancelado') then raise exception 'Processo já encerrado'; end if;
    if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Informe o motivo do cancelamento'; end if;
    perform apply_stage(c, 'cancelado', 'cancelamento', auth.uid(), p_reason);
  elsif p_direction = 'reabrir' then
    perform require_admin();
    if c.stage <> 'cancelado' then raise exception 'Processo não está cancelado'; end if;
    perform apply_stage(c, 'documentos', 'reabertura', auth.uid(), p_reason);
  else
    raise exception 'Movimento inválido';
  end if;
end $$;

-- Domínio (do cliente ou da agência) e telefone vinham da assinatura; agora fazem parte do que o cliente aprova no site.
drop function public.save_site(uuid, jsonb, boolean);
create function public.save_site(p_client uuid, p_content jsonb, p_submit boolean, p_domain text, p_phone text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c clients; v_domain text := nullif(lower(trim(p_domain)), ''); v_phone text := nullif(trim(p_phone), '');
begin
  perform require_access(p_client);
  select * into c from clients where id = p_client;
  if c.stage <> 'site' then raise exception 'O conteúdo só pode ser editado na etapa Site'; end if;
  if p_submit and v_domain is null then raise exception 'Informe o domínio do site'; end if;
  if p_submit and length(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Informe o telefone da empresa com DDD';
  end if;
  update clients set domain = v_domain, public_phone = v_phone where id = p_client;
  update sites set content = p_content, status = (case when p_submit then 'em_aprovacao' else 'rascunho' end)::site_status,
    approved_at = null, updated_by = auth.uid(), updated_at = now() where client_id = p_client;
  perform log_event(auth.uid(), p_client, case when p_submit then 'site_enviado' else 'site_rascunho' end);
end $$;

-- ---------- Indicadores ------------------------------------------------
-- BM criada: portfólio novo, hoje concluído. Se for devolvida, deixa de contar;
-- ao concluir de novo, conta uma vez, na nova data.
create or replace function public.operator_metrics(p_from date, p_to date) returns table (
  operator_id uuid, full_name text, role user_role, active boolean, monthly_goal int,
  completed bigint, completed_month bigint, advances bigint, rework bigint,
  avg_hours numeric, open_now bigint, actions bigint, active_days bigint, last_action timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with b as (select (p_from::timestamp at time zone 'America/Sao_Paulo') f,
                    ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') t,
                    (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') m),
  made as (select s.operator_id, s.left_at from stage_history s join clients c on c.id = s.client_id
    where s.to_stage = 'concluido' and c.stage = 'concluido' and c.completed_at = s.left_at and c.portfolio = 'novo')
  select p.id, p.full_name, p.role, p.active, p.monthly_goal,
    dn.n, hm.n, h.advances, rw.n, h.avg_hours, o.n, a.n, a.days, a.last
  from profiles p cross join b
  cross join lateral (select
      count(*) filter (where s.outcome = 'avanco') advances,
      round((avg(extract(epoch from s.left_at - s.entered_at) / 3600)
        filter (where s.outcome = 'avanco' and s.counts_for_operator))::numeric, 1) avg_hours
    from stage_history s where s.operator_id = p.id and s.left_at >= b.f and s.left_at < b.t) h
  cross join lateral (select count(*) n from made x where x.operator_id = p.id and x.left_at >= b.f and x.left_at < b.t) dn
  cross join lateral (select count(*) n from made x where x.operator_id = p.id and x.left_at >= b.m) hm
  cross join lateral (select count(*) n from stage_history s
    where s.rework_of = p.id and s.left_at >= b.f and s.left_at < b.t) rw
  cross join lateral (select count(*) n from clients c
    where c.assigned_to = p.id and c.stage not in ('concluido', 'cancelado')) o
  cross join lateral (select count(*) n, count(distinct (l.created_at at time zone 'America/Sao_Paulo')::date) days,
      max(l.created_at) last
    from activity_log l where l.actor_id = p.id and l.created_at >= b.f and l.created_at < b.t) a
  where (is_admin() or (is_staff() and p.id = auth.uid()))
  order by dn.n desc, h.advances desc, p.full_name
$$;

create or replace function public.daily_advances(p_from date, p_to date, p_operator uuid default null)
returns table (day date, advances bigint, completed bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select d::date, count(s.id) filter (where s.outcome = 'avanco'),
    count(s.id) filter (where s.to_stage = 'concluido' and c.stage = 'concluido' and c.completed_at = s.left_at and c.portfolio = 'novo')
  from generate_series(p_from::timestamp, least(p_to, p_from + 366)::timestamp, interval '1 day') d
  left join stage_history s on (s.left_at at time zone 'America/Sao_Paulo')::date = d::date
    and (p_operator is null or s.operator_id = p_operator)
    and (is_admin() or s.operator_id = auth.uid())
  left join clients c on c.id = s.client_id
  where is_staff()
  group by d order by d
$$;

create or replace view public.client_overview with (security_invoker = true) as
  select c.id, c.cnpj, c.legal_name, c.trade_name, c.stage, c.stage_entered_at, c.priority, c.created_at, c.completed_at,
    c.assigned_to, p.full_name as assigned_name,
    round((extract(epoch from now() - c.stage_entered_at) / 3600)::numeric, 1) as hours_in_stage, c.portfolio
  from public.clients c
  left join public.profiles p on p.id = c.assigned_to;

-- ---------- Permissões do que nasceu de novo ---------------------------
revoke all on function
  public.create_client(uuid, text, text, text, jsonb, text[], text, text, uuid, text, boolean), public.cnpj_other_uses(uuid),
  public.update_client(uuid, text, text, int, text), public.save_site(uuid, jsonb, boolean, text, text)
  from anon, authenticated, public;
grant execute on function
  public.cnpj_other_uses(uuid), public.update_client(uuid, text, text, int, text), public.save_site(uuid, jsonb, boolean, text, text)
  to authenticated;
grant execute on function
  public.create_client(uuid, text, text, text, jsonb, text[], text, text, uuid, text, boolean), public.cnpj_other_uses(uuid),
  public.update_client(uuid, text, text, int, text), public.save_site(uuid, jsonb, boolean, text, text)
  to service_role;
