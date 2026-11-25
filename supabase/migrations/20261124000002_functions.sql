-- =====================================================================
-- Regras de negócio. Nenhuma transição sensível acontece por UPDATE direto.
-- =====================================================================
create function public.is_staff() returns boolean language sql stable security definer
set search_path = public, pg_temp as
$$ select exists (select 1 from profiles where id = auth.uid() and active) $$;

create function public.is_admin() returns boolean language sql stable security definer
set search_path = public, pg_temp as
$$ select exists (select 1 from profiles where id = auth.uid() and active and role = 'admin') $$;

create function public.can_access_client(p_client uuid) returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select is_admin() or (is_staff() and exists
    (select 1 from clients where id = p_client and assigned_to = auth.uid()))
$$;

create function public.require_access(p_client uuid) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not can_access_client(p_client) then
    raise exception 'Sem acesso a este cliente' using errcode = '42501';
  end if;
end $$;

create function public.require_admin() returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'Somente administradores' using errcode = '42501';
  end if;
end $$;

create function public.log_event(p_actor uuid, p_client uuid, p_action text, p_meta jsonb default '{}')
returns void language sql security definer set search_path = public, pg_temp as
$$ insert into activity_log (actor_id, client_id, action, meta) values (p_actor, p_client, p_action, p_meta) $$;

create function public.normalize_name(t text) returns text language sql immutable as $$
  select trim(regexp_replace(translate(upper(coalesce(t, '')),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Z]+', ' ', 'g'))
$$;

-- ---------- Cadastro (service_role, após consulta pública do CNPJ) -----
create function public.create_client(
  p_actor uuid, p_cnpj text, p_legal_name text, p_trade_name text, p_registry jsonb, p_partners text[],
  p_contact_name text, p_contact_email text, p_contact_phone text, p_assigned_to uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_role user_role;
begin
  select role into v_role from profiles where id = p_actor and active;
  if v_role is null then raise exception 'Usuário sem acesso' using errcode = '42501'; end if;
  if v_role = 'operador' then p_assigned_to := p_actor; end if;
  if p_assigned_to is not null and not exists (select 1 from profiles where id = p_assigned_to and active) then
    raise exception 'Responsável inválido';
  end if;
  insert into clients (cnpj, legal_name, trade_name, registry, partners, contact_name, contact_email, contact_phone, assigned_to, created_by)
  values (p_cnpj, p_legal_name, p_trade_name, p_registry, p_partners, p_contact_name, lower(trim(p_contact_email)), p_contact_phone, p_assigned_to, p_actor)
  returning id into v_id;
  insert into sites (client_id) values (v_id);
  insert into checklist_items (client_id, key, stage, position, label) values
    (v_id, 'bm_titular',   'meta', 1, 'Portfólio empresarial criado ou acessado pela conta do próprio cliente'),
    (v_id, 'bm_parceiro',  'meta', 2, 'Agência adicionada como parceira, com permissões limitadas'),
    (v_id, 'bm_2fa',       'meta', 3, 'Autenticação em dois fatores ativa para os administradores do cliente'),
    (v_id, 'bm_dominio',   'meta', 4, 'Domínio do cliente verificado na Meta'),
    (v_id, 'vf_dados',     'verificacao', 1, 'Dados enviados conferem com o cadastro público'),
    (v_id, 'vf_envio',     'verificacao', 2, 'Cliente enviou a verificação com os documentos originais'),
    (v_id, 'vf_resultado', 'verificacao', 3, 'Resultado da Meta registrado e comunicado ao cliente');
  perform log_event(p_actor, v_id, 'cliente_criado');
  return v_id;
end $$;

-- ---------- Movimentação de etapa --------------------------------------
create function public.apply_stage(p_client clients, p_to stage, p_outcome text, p_actor uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_set stage_settings; v_rework uuid;
begin
  select * into v_set from stage_settings where stage = p_client.stage;
  if p_outcome = 'retorno' then
    select operator_id into v_rework from stage_history
     where client_id = p_client.id and stage = p_to and outcome = 'avanco' order by id desc limit 1;
  end if;
  insert into stage_history (client_id, stage, operator_id, entered_at, to_stage, outcome, rework_of,
                             sla_hours, counts_for_operator, moved_by, reason)
  values (p_client.id, p_client.stage, p_client.assigned_to, p_client.stage_entered_at, p_to, p_outcome, v_rework,
          v_set.sla_hours, coalesce(v_set.counts_for_operator, false), p_actor, nullif(trim(p_reason), ''));
  update clients set stage = p_to, stage_entered_at = now(),
    completed_at = case when p_to = 'concluido' then now() end where id = p_client.id;
  perform log_event(p_actor, p_client.id, 'etapa_' || p_outcome,
    jsonb_build_object('de', p_client.stage, 'para', p_to, 'motivo', p_reason));
end $$;

create function public.stage_blockers(p_client uuid) returns text[] language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare c clients; b text[] := '{}'; k doc_kind;
begin
  perform require_access(p_client);
  select * into c from clients where id = p_client;
  if c.stage in ('concluido', 'cancelado') then return b; end if;
  if not exists (select 1 from profiles where id = c.assigned_to and active) then
    b := array_append(b, 'Defina um responsável ativo');
  end if;
  if not exists (select 1 from authorizations where client_id = p_client and status = 'aprovado') then
    b := array_append(b, 'Autorização do titular ainda não aprovada por um administrador');
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

create function public.move_stage(p_client uuid, p_direction text, p_to stage default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c clients; v_next stage; b text[];
begin
  perform require_access(p_client);
  select * into c from clients where id = p_client for update;
  if p_direction = 'avancar' then
    if c.stage in ('concluido', 'cancelado') then raise exception 'Processo já encerrado'; end if;
    b := stage_blockers(p_client);
    if cardinality(b) > 0 then raise exception '%', array_to_string(b, '; '); end if;
    v_next := (array['documentos', 'site', 'meta', 'verificacao', 'concluido']::stage[])
      [array_position(array['autorizacao', 'documentos', 'site', 'meta', 'verificacao']::stage[], c.stage)];
    perform apply_stage(c, v_next, 'avanco', auth.uid(), p_reason);
  elsif p_direction = 'devolver' then
    if c.stage = 'cancelado' then raise exception 'Reabra o processo primeiro'; end if;
    if c.stage = 'concluido' then perform require_admin(); end if;
    if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Informe o motivo da devolução'; end if;
    if p_to is null or p_to >= c.stage then raise exception 'Escolha uma etapa anterior'; end if;
    perform apply_stage(c, p_to, 'retorno', auth.uid(), p_reason);
  elsif p_direction = 'cancelar' then
    if c.stage in ('concluido', 'cancelado') then raise exception 'Processo já encerrado'; end if;
    if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Informe o motivo do cancelamento'; end if;
    perform apply_stage(c, 'cancelado', 'cancelamento', auth.uid(), p_reason);
  elsif p_direction = 'reabrir' then
    perform require_admin();
    if c.stage <> 'cancelado' then raise exception 'Processo não está cancelado'; end if;
    perform apply_stage(c, 'autorizacao', 'reabertura', auth.uid(), p_reason);
  else
    raise exception 'Movimento inválido';
  end if;
end $$;

-- ---------- Ações da equipe --------------------------------------------
create function public.assign_client(p_client uuid, p_operator uuid) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform require_admin();
  if not exists (select 1 from profiles where id = p_operator and active) then
    raise exception 'Responsável inválido';
  end if;
  update clients set assigned_to = p_operator where id = p_client;
  perform log_event(auth.uid(), p_client, 'responsavel_alterado', 
    jsonb_build_object('responsavel', (select full_name from profiles where id = p_operator)));
end $$;

create function public.update_client(p_client uuid, p_trade_name text, p_contact_phone text, p_priority int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform require_access(p_client);
  update clients set trade_name = nullif(trim(p_trade_name), ''), contact_phone = nullif(trim(p_contact_phone), ''),
    priority = p_priority where id = p_client;
  perform log_event(auth.uid(), p_client, 'cliente_atualizado');
end $$;

create function public.toggle_checklist(p_client uuid, p_key text, p_done boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c clients; i checklist_items;
begin
  perform require_access(p_client);
  select * into c from clients where id = p_client;
  select * into i from checklist_items where client_id = p_client and key = p_key;
  if i.stage is distinct from c.stage then raise exception 'Este item pertence a outra etapa'; end if;
  update checklist_items set done_at = case when p_done then now() end,
    done_by = case when p_done then auth.uid() end where client_id = p_client and key = p_key;
  perform log_event(auth.uid(), p_client, case when p_done then 'checklist_feito' else 'checklist_desfeito' end,
    jsonb_build_object('item', i.label));
end $$;

create function public.add_note(p_client uuid, p_body text) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform require_access(p_client);
  insert into notes (client_id, author_id, body) values (p_client, auth.uid(), trim(p_body));
  perform log_event(auth.uid(), p_client, 'anotacao');
end $$;

create function public.create_invite(p_client uuid, p_token_hash text) returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v uuid;
begin
  perform require_access(p_client);
  update portal_invites set revoked_at = now() where client_id = p_client and revoked_at is null;
  insert into portal_invites (client_id, token_hash, created_by)
  values (p_client, p_token_hash, auth.uid()) returning id into v;
  perform log_event(auth.uid(), p_client, 'convite_gerado');
  return v;
end $$;

create function public.review_document(p_doc uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare d documents;
begin
  select * into d from documents where id = p_doc;
  perform require_access(d.client_id);
  if d.kind = 'procuracao' then perform require_admin(); end if;
  if d.uploaded_by = auth.uid() then raise exception 'Quem anexou o documento não pode aprová-lo'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Explique o que precisa ser corrigido';
  end if;
  update documents set status = (case when p_approve then 'aprovado' else 'recusado' end)::review_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '') where id = p_doc;
  perform log_event(auth.uid(), d.client_id, case when p_approve then 'documento_aprovado' else 'documento_recusado' end,
    jsonb_build_object('documento', d.kind, 'arquivo', d.file_name, 'motivo', nullif(trim(p_note), '')));
end $$;

create function public.save_site(p_client uuid, p_content jsonb, p_submit boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c clients;
begin
  perform require_access(p_client);
  select * into c from clients where id = p_client;
  if c.stage <> 'site' then raise exception 'O conteúdo só pode ser editado na etapa Site'; end if;
  update sites set content = p_content, status = (case when p_submit then 'em_aprovacao' else 'rascunho' end)::site_status,
    approved_at = null, updated_by = auth.uid(), updated_at = now() where client_id = p_client;
  perform log_event(auth.uid(), p_client, case when p_submit then 'site_enviado' else 'site_rascunho' end);
end $$;

-- Arquivo recebido do cliente e anexado pela equipe (service_role, após conferir o conteúdo).
create function public.add_document(
  p_actor uuid, p_client uuid, p_kind doc_kind, p_path text, p_name text, p_mime text, p_size bigint, p_sha256 text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from profiles p join clients c on c.id = p_client
      where p.id = p_actor and p.active and (p.role = 'admin' or c.assigned_to = p.id)) then
    raise exception 'Sem acesso a este cliente' using errcode = '42501';
  end if;
  if exists (select 1 from clients where id = p_client and stage in ('concluido', 'cancelado')) then
    raise exception 'Processo encerrado';
  end if;
  insert into documents (client_id, kind, storage_path, file_name, mime, size_bytes, sha256, uploaded_by)
  values (p_client, p_kind, p_path, p_name, p_mime, p_size, p_sha256, p_actor);
  perform log_event(p_actor, p_client, 'documento_enviado', jsonb_build_object('documento', p_kind, 'arquivo', p_name));
end $$;

-- Resposta do cliente sobre o site, com o print da conversa como evidência.
create function public.record_site_reply(p_client uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s sites;
begin
  perform require_access(p_client);
  select * into s from sites where client_id = p_client for update;
  if s.status is distinct from 'em_aprovacao' then raise exception 'Não há conteúdo aguardando aprovação'; end if;
  if p_approve and not exists (select 1 from documents
      where client_id = p_client and kind = 'aprovacao_site' and uploaded_at > s.updated_at) then
    raise exception 'Anexe em Documentos o print da aprovação desta versão pelo cliente';
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 5 then raise exception 'Descreva o que o cliente pediu'; end if;
  update sites set status = (case when p_approve then 'aprovado' else 'ajustes' end)::site_status,
    approved_at = case when p_approve then now() end, client_note = nullif(trim(p_note), '') where client_id = p_client;
  perform log_event(auth.uid(), p_client, case when p_approve then 'site_aprovado' else 'site_ajustes' end,
    jsonb_build_object('motivo', nullif(trim(p_note), '')));
end $$;

-- Quatro olhos: administrador que não é o responsável pelo cliente.
create function public.review_authorization(p_auth uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a authorizations; c clients;
begin
  perform require_admin();
  select * into a from authorizations where id = p_auth for update;
  if a.status is distinct from 'pendente' then raise exception 'Autorização já analisada'; end if;
  select * into c from clients where id = a.client_id;
  if c.assigned_to = auth.uid() then
    raise exception 'O responsável pelo cliente não pode aprovar a própria autorização';
  end if;
  if p_approve and (not a.signer_in_registry or a.signer_role = 'procurador') and not exists
     (select 1 from documents where client_id = a.client_id and kind = 'procuracao' and status = 'aprovado') then
    raise exception 'Signatário fora do quadro societário: é preciso uma procuração aprovada';
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 5 then raise exception 'Informe o motivo da recusa'; end if;
  update authorizations set status = (case when p_approve then 'aprovado' else 'recusado' end)::review_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '') where id = p_auth;
  perform log_event(auth.uid(), a.client_id,
    case when p_approve then 'autorizacao_aprovada' else 'autorizacao_recusada' end,
    jsonb_build_object('signatario', a.signer_name, 'motivo', nullif(trim(p_note), '')));
end $$;

create function public.transfer_clients(p_from uuid, p_to uuid) returns int language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_id uuid; v_total int := 0; v_to text;
begin
  perform require_admin();
  select full_name into v_to from profiles where id = p_to and active and id <> p_from;
  if v_to is null then raise exception 'Escolha outra pessoa ativa da equipe'; end if;
  for v_id in select id from clients where assigned_to = p_from and stage not in ('concluido', 'cancelado') for update loop
    update clients set assigned_to = p_to where id = v_id;
    perform log_event(auth.uid(), v_id, 'responsavel_alterado', jsonb_build_object('responsavel', v_to));
    v_total := v_total + 1;
  end loop;
  perform log_event(auth.uid(), null, 'clientes_transferidos', jsonb_build_object(
    'de', (select full_name from profiles where id = p_from), 'para', v_to, 'quantidade', v_total));
  return v_total;
end $$;

create function public.open_clients_by_member() returns table (member_id uuid, total bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select assigned_to, count(*) from clients
  where is_admin() and assigned_to is not null and stage not in ('concluido', 'cancelado') group by assigned_to
$$;

create function public.update_member(p_user uuid, p_role user_role, p_active boolean, p_goal int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_open int;
begin
  perform require_admin();
  if p_user = auth.uid() and (p_role <> 'admin' or not p_active) then
    raise exception 'Você não pode remover o próprio acesso de administrador';
  end if;
  if not p_active then
    select count(*) into v_open from clients where assigned_to = p_user and stage not in ('concluido', 'cancelado');
    if v_open > 0 then
      raise exception 'Transfira antes os clientes em aberto desta pessoa (%)', v_open;
    end if;
  end if;
  update profiles set role = p_role, active = p_active, monthly_goal = p_goal where id = p_user;
  perform log_event(auth.uid(), null, 'membro_atualizado',
    jsonb_build_object('nome', (select full_name from profiles where id = p_user), 'papel', p_role, 'ativo', p_active, 'meta', p_goal));
end $$;

create function public.update_stage_setting(p_stage stage, p_sla int, p_counts boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform require_admin();
  update stage_settings set sla_hours = p_sla, counts_for_operator = p_counts where stage = p_stage;
  perform log_event(auth.uid(), null, 'prazo_atualizado', jsonb_build_object('etapa', p_stage, 'horas', p_sla));
end $$;

-- ---------- Assinatura do titular (service_role) ---------------------------
create function public.portal_sign(
  p_client uuid, p_name text, p_role text, p_domain text, p_phone text,
  p_terms_version text, p_terms_sha256 text, p_ip text, p_user_agent text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c clients; v_norm text := normalize_name(p_name); v_match boolean;
begin
  select * into c from clients where id = p_client for update;
  if c.stage <> 'autorizacao' then raise exception 'A autorização não está aberta neste momento'; end if;
  if coalesce(array_length(string_to_array(v_norm, ' '), 1), 0) < 2 then raise exception 'Informe o nome completo'; end if;
  if exists (select 1 from authorizations where client_id = p_client and status in ('pendente', 'aprovado')) then
    raise exception 'Já existe uma autorização registrada';
  end if;
  v_match := exists (select 1 from unnest(c.partners) s where normalize_name(s) = v_norm)
    or (cardinality(c.partners) = 0 and position(v_norm in normalize_name(c.legal_name)) > 0);
  update clients set domain = lower(trim(p_domain)), public_phone = trim(p_phone) where id = p_client;
  insert into authorizations (client_id, signer_name, signer_role, signer_email, cnpj, domain, public_phone,
    terms_version, terms_sha256, ip, user_agent, signer_in_registry)
  values (p_client, trim(p_name), p_role, c.contact_email, c.cnpj, lower(trim(p_domain)), trim(p_phone),
    p_terms_version, p_terms_sha256, p_ip, left(p_user_agent, 400), v_match);
  perform log_event(null, p_client, 'autorizacao_assinada', jsonb_build_object('signatario', trim(p_name)));
end $$;

create function public.portal_revoke(p_client uuid) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare c clients;
begin
  select * into c from clients where id = p_client for update;
  update authorizations set status = 'revogado', revoked_at = now()
    where client_id = p_client and status in ('pendente', 'aprovado');
  if not found then raise exception 'Não há autorização ativa'; end if;
  perform log_event(null, p_client, 'autorizacao_revogada');
  if c.stage not in ('autorizacao', 'concluido', 'cancelado') then
    perform apply_stage(c, 'cancelado', 'cancelamento', null, 'Autorização revogada pelo cliente');
  end if;
end $$;

-- ---------- Indicadores ------------------------------------------------
create function public.operator_metrics(p_from date, p_to date) returns table (
  operator_id uuid, full_name text, role user_role, active boolean, monthly_goal int,
  completed bigint, completed_month bigint, advances bigint, rework bigint, sla_ok bigint, sla_total bigint,
  avg_hours numeric, open_now bigint, late_now bigint, actions bigint, active_days bigint, last_action timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with b as (select (p_from::timestamp at time zone 'America/Sao_Paulo') f,
                    ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') t,
                    (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') m)
  select p.id, p.full_name, p.role, p.active, p.monthly_goal,
    h.completed, hm.n, h.advances, rw.n, h.sla_ok, h.sla_total, h.avg_hours, o.open_now, o.late_now, a.n, a.days, a.last
  from profiles p cross join b
  cross join lateral (select
      count(*) filter (where s.to_stage = 'concluido') completed,
      count(*) filter (where s.outcome = 'avanco') advances,
      count(*) filter (where s.outcome = 'avanco' and s.counts_for_operator
        and s.left_at - s.entered_at <= s.sla_hours * interval '1 hour') sla_ok,
      count(*) filter (where s.outcome = 'avanco' and s.counts_for_operator) sla_total,
      round((avg(extract(epoch from s.left_at - s.entered_at) / 3600)
        filter (where s.outcome = 'avanco' and s.counts_for_operator))::numeric, 1) avg_hours
    from stage_history s where s.operator_id = p.id and s.left_at >= b.f and s.left_at < b.t) h
  cross join lateral (select count(*) n from stage_history s
    where s.operator_id = p.id and s.to_stage = 'concluido' and s.left_at >= b.m) hm
  cross join lateral (select count(*) n from stage_history s
    where s.rework_of = p.id and s.left_at >= b.f and s.left_at < b.t) rw
  cross join lateral (select count(*) open_now,
      count(*) filter (where ss.counts_for_operator
        and now() - c.stage_entered_at > ss.sla_hours * interval '1 hour') late_now
    from clients c join stage_settings ss on ss.stage = c.stage where c.assigned_to = p.id) o
  cross join lateral (select count(*) n, count(distinct (l.created_at at time zone 'America/Sao_Paulo')::date) days,
      max(l.created_at) last
    from activity_log l where l.actor_id = p.id and l.created_at >= b.f and l.created_at < b.t) a
  where (is_admin() or (is_staff() and p.id = auth.uid()))
  order by h.completed desc, h.advances desc, p.full_name
$$;

create function public.daily_advances(p_from date, p_to date, p_operator uuid default null)
returns table (day date, advances bigint, completed bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select d::date, count(s.id) filter (where s.outcome = 'avanco'), count(s.id) filter (where s.to_stage = 'concluido')
  from generate_series(p_from::timestamp, least(p_to, p_from + 366)::timestamp, interval '1 day') d
  left join stage_history s on (s.left_at at time zone 'America/Sao_Paulo')::date = d::date
    and (p_operator is null or s.operator_id = p_operator)
    and (is_admin() or s.operator_id = auth.uid())
  where is_staff()
  group by d order by d
$$;

create function public.stage_durations(p_from date, p_to date, p_operator uuid default null)
returns table (stage stage, avg_hours numeric, samples bigint, sla_hours int)
language sql stable security definer set search_path = public, pg_temp as $$
  select ss.stage, round(avg(extract(epoch from h.left_at - h.entered_at) / 3600)::numeric, 1), count(h.id), ss.sla_hours
  from stage_settings ss
  left join stage_history h on h.stage = ss.stage and h.outcome = 'avanco'
    and (h.left_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
    and (p_operator is null or h.operator_id = p_operator)
    and (is_admin() or h.operator_id = auth.uid())
  where is_staff()
  group by ss.stage, ss.sla_hours, ss.position order by ss.position
$$;

-- Fila de conferência, com sinais de alerta para o administrador.
create function public.authorization_queue() returns table (
  id uuid, client_id uuid, legal_name text, cnpj text, partners text[], signer_name text, signer_role text,
  signer_email text, domain text, public_phone text, ip text, signed_at timestamptz, signer_in_registry boolean,
  has_power_of_attorney boolean, same_email bigint, same_ip bigint, same_domain bigint, same_phone bigint,
  assigned_name text, is_mine boolean, registry_email text, registry_phone text)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, c.id, c.legal_name, c.cnpj, c.partners, a.signer_name, a.signer_role, a.signer_email, a.domain,
    a.public_phone, a.ip, a.signed_at, a.signer_in_registry,
    exists (select 1 from documents d where d.client_id = c.id and d.kind = 'procuracao' and d.status = 'aprovado'),
    (select count(*) from clients x where x.contact_email = c.contact_email and x.id <> c.id),
    (select count(distinct x.client_id) from authorizations x where x.ip = a.ip and x.client_id <> c.id),
    (select count(*) from clients x where x.domain = a.domain and x.id <> c.id),
    (select count(*) from clients x where x.public_phone = a.public_phone and x.id <> c.id),
    p.full_name, coalesce(c.assigned_to = auth.uid(), false), c.registry->>'email', c.registry->>'telefone'
  from authorizations a join clients c on c.id = a.client_id left join profiles p on p.id = c.assigned_to
  where a.status = 'pendente' and is_admin() order by a.signed_at
$$;
