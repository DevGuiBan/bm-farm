-- =====================================================================
-- Administrador gerencia; só operador é responsável por BM.
-- =====================================================================
create function public.operator_only() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if new.assigned_to is not null and not exists (select 1 from profiles where id = new.assigned_to and role = 'operador') then
    raise exception 'Só um operador pode ser responsável por uma BM';
  end if;
  return new;
end $$;
create trigger clients_operator_only before insert or update of assigned_to on public.clients
  for each row execute function public.operator_only();

-- Promover a administrador exige transferir antes o que está em aberto.
create function public.promotion_guard() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_open int;
begin
  select count(*) into v_open from clients where assigned_to = new.id and stage not in ('concluido', 'cancelado');
  if v_open > 0 then
    raise exception 'Transfira antes as BMs em aberto desta pessoa (%)', v_open;
  end if;
  return new;
end $$;
create trigger profiles_promotion before update of role on public.profiles
  for each row when (old.role = 'operador' and new.role = 'admin') execute function public.promotion_guard();

revoke all on function public.operator_only(), public.promotion_guard() from anon, authenticated, public;
