
create type public.app_role as enum ('admin','estoquista','diretor');
create type public.origem_tipo as enum ('mercado','agricultura');
create type public.mov_tipo as enum ('entrada','saida');
create type public.unidade_tipo as enum ('kg','L','un');

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  responsavel text,
  diretor text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.schools to authenticated;
grant all on public.schools to service_role;
alter table public.schools enable row level security;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  school_id uuid references public.schools(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.user_school(_user_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = _user_id
$$;

create or replace function public.can_view_school(_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(),'admin') or (public.user_school(auth.uid()) = _school
    and (public.has_role(auth.uid(),'estoquista') or public.has_role(auth.uid(),'diretor')))
$$;

create or replace function public.can_write_school(_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(),'admin') or (public.user_school(auth.uid()) = _school and public.has_role(auth.uid(),'estoquista'))
$$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade unidade_tipo not null,
  categoria text not null,
  origem_padrao origem_tipo not null default 'mercado',
  ativo boolean not null default true,
  estoque_minimo numeric not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  tipo mov_tipo not null,
  data date not null,
  quantidade numeric not null check (quantidade > 0),
  origem origem_tipo not null,
  fornecedor text,
  nota_fiscal text,
  destino text,
  responsavel text,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.movements (school_id, product_id, origem);
create index on public.movements (school_id, data);
grant select, insert, delete on public.movements to authenticated;
grant all on public.movements to service_role;
alter table public.movements enable row level security;

create table public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  ano int not null,
  mes int not null check (mes between 1 and 12),
  responsavel text,
  observacoes text,
  snapshot jsonb not null default '[]'::jsonb,
  closed_by uuid default auth.uid(),
  closed_at timestamptz not null default now(),
  unique (school_id, ano, mes)
);
grant select, insert, delete on public.monthly_closings to authenticated;
grant all on public.monthly_closings to service_role;
alter table public.monthly_closings enable row level security;

create table public.audit_log (
  id bigserial primary key,
  tabela text not null,
  acao text not null,
  registro_id text,
  dados jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;

-- Policies
create policy "schools view" on public.schools for select to authenticated using (public.can_view_school(id));
create policy "schools admin write" on public.schools for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "profiles view" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "profiles admin update" on public.profiles for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "roles view" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "roles admin write" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "products view" on public.products for select to authenticated using (true);
create policy "products admin write" on public.products for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "mov view" on public.movements for select to authenticated using (public.can_view_school(school_id));
create policy "mov insert" on public.movements for insert to authenticated with check (public.can_write_school(school_id));
create policy "mov admin delete" on public.movements for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "close view" on public.monthly_closings for select to authenticated using (public.can_view_school(school_id));
create policy "close insert" on public.monthly_closings for insert to authenticated with check (public.can_write_school(school_id));
create policy "close admin delete" on public.monthly_closings for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "audit admin view" on public.audit_log for select to authenticated using (public.has_role(auth.uid(),'admin'));

-- Signup: profile + first user admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email);
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Movement validation: closed month + no negative stock
create or replace function public.validate_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare saldo numeric;
begin
  if exists (select 1 from public.monthly_closings c where c.school_id = new.school_id
     and c.ano = extract(year from new.data)::int and c.mes = extract(month from new.data)::int) then
    raise exception 'O mês % / % já foi fechado para esta escola. Movimentações não podem ser alteradas.', extract(month from new.data), extract(year from new.data);
  end if;
  if new.tipo = 'saida' then
    perform pg_advisory_xact_lock(hashtext(new.school_id::text || new.product_id::text || new.origem::text));
    select coalesce(sum(case when tipo='entrada' then quantidade else -quantidade end),0) into saldo
      from public.movements where school_id = new.school_id and product_id = new.product_id and origem = new.origem;
    if saldo < new.quantidade then
      raise exception 'Estoque insuficiente (%). Disponível: %', new.origem, saldo;
    end if;
  end if;
  return new;
end $$;
create trigger trg_validate_movement before insert on public.movements for each row execute function public.validate_movement();

create or replace function public.validate_movement_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare saldo numeric;
begin
  if exists (select 1 from public.monthly_closings c where c.school_id = old.school_id
     and c.ano = extract(year from old.data)::int and c.mes = extract(month from old.data)::int) then
    raise exception 'Mês fechado. Reabra o fechamento antes de corrigir.';
  end if;
  if old.tipo = 'entrada' then
    select coalesce(sum(case when tipo='entrada' then quantidade else -quantidade end),0) into saldo
      from public.movements where school_id = old.school_id and product_id = old.product_id and origem = old.origem;
    if saldo - old.quantidade < 0 then
      raise exception 'Excluir esta entrada deixaria o estoque negativo.';
    end if;
  end if;
  return old;
end $$;
create trigger trg_validate_movement_delete before delete on public.movements for each row execute function public.validate_movement_delete();

-- Saída com origem automática (mercado primeiro, depois agricultura)
create or replace function public.registrar_saida(
  _school uuid, _product uuid, _data date, _quantidade numeric, _origem text,
  _destino text, _responsavel text, _observacoes text)
returns void language plpgsql security invoker set search_path = public as $$
declare s_merc numeric; s_agri numeric; resto numeric := _quantidade; q numeric;
begin
  if _quantidade <= 0 then raise exception 'Quantidade inválida'; end if;
  if _origem in ('mercado','agricultura') then
    insert into public.movements (school_id, product_id, tipo, data, quantidade, origem, destino, responsavel, observacoes)
    values (_school, _product, 'saida', _data, _quantidade, _origem::origem_tipo, _destino, _responsavel, _observacoes);
    return;
  end if;
  select coalesce(sum(case when tipo='entrada' then quantidade else -quantidade end),0) into s_merc
    from public.movements where school_id=_school and product_id=_product and origem='mercado';
  select coalesce(sum(case when tipo='entrada' then quantidade else -quantidade end),0) into s_agri
    from public.movements where school_id=_school and product_id=_product and origem='agricultura';
  if s_merc + s_agri < _quantidade then
    raise exception 'Estoque insuficiente. Disponível: %', s_merc + s_agri;
  end if;
  q := least(s_merc, resto);
  if q > 0 then
    insert into public.movements (school_id, product_id, tipo, data, quantidade, origem, destino, responsavel, observacoes)
    values (_school, _product, 'saida', _data, q, 'mercado', _destino, _responsavel, _observacoes);
    resto := resto - q;
  end if;
  if resto > 0 then
    insert into public.movements (school_id, product_id, tipo, data, quantidade, origem, destino, responsavel, observacoes)
    values (_school, _product, 'saida', _data, resto, 'agricultura', _destino, _responsavel, _observacoes);
  end if;
end $$;
grant execute on function public.registrar_saida to authenticated;

-- Audit
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (tabela, acao, registro_id, dados, user_id)
  values (tg_table_name, tg_op,
    coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', ''),
    case when tg_op='UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new))
         when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end,
    auth.uid());
  return null;
end $$;
create trigger audit_movements after insert or update or delete on public.movements for each row execute function public.audit_trigger();
create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_trigger();
create trigger audit_closings after insert or update or delete on public.monthly_closings for each row execute function public.audit_trigger();
create trigger audit_schools after insert or update or delete on public.schools for each row execute function public.audit_trigger();
create trigger audit_roles after insert or update or delete on public.user_roles for each row execute function public.audit_trigger();
create trigger audit_profiles after update on public.profiles for each row execute function public.audit_trigger();
