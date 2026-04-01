-- Vi Nho Finance - rebuilt backend schema for realtime finance management.
-- Safe to run multiple times in Supabase SQL editor.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.user_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    full_name text not null,
    avatar_url text,
    phone text,
    monthly_spending_limit numeric(18,2) not null default 0,
    daily_spending_limit numeric(18,2) not null default 0,
    jar_balances jsonb not null default '{"necessities":0,"education":0,"savings":0,"entertainment":0,"freedom":0,"giving":0}'::jsonb,
    spending_limits jsonb not null default '{"necessities":0,"education":0,"savings":0,"entertainment":0,"freedom":0,"giving":0}'::jsonb,
    is_blocked boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    type text not null check (type in ('income', 'expense')),
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    type text not null check (type in ('income', 'expense')),
    amount numeric(18,2) not null check (amount >= 0),
    category_id uuid,
    jar text,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    role text not null default 'admin',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null references auth.users(id) on delete cascade,
    action text not null,
    target_table text not null,
    target_id text,
    meta jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.ai_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    input_data jsonb not null default '{}'::jsonb,
    result_data jsonb not null default '{}'::jsonb,
    status text not null default 'success',
    created_at timestamptz not null default now()
);

create table if not exists public.system_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    event_type text not null,
    source_table text not null,
    source_id text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.transactions add column if not exists category_id uuid;
alter table public.transactions add column if not exists jar text;
alter table public.transactions add column if not exists note text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'transactions_category_id_fkey'
    ) then
        alter table public.transactions
            add constraint transactions_category_id_fkey
            foreign key (category_id) references public.categories(id) on delete set null;
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'transactions_jar_check'
    ) then
        alter table public.transactions
            add constraint transactions_jar_check
            check (
                jar is null
                or jar in ('necessities', 'education', 'savings', 'entertainment', 'freedom', 'giving')
            );
    end if;
end $$;

create unique index if not exists user_profiles_email_idx on public.user_profiles (lower(email));
create index if not exists user_profiles_created_at_idx on public.user_profiles (created_at desc);
create unique index if not exists categories_user_type_name_idx on public.categories (user_id, lower(name), type);
create index if not exists categories_user_id_idx on public.categories (user_id);
create index if not exists transactions_user_id_created_at_idx on public.transactions (user_id, created_at desc);
create index if not exists transactions_user_type_created_at_idx on public.transactions (user_id, type, created_at desc);
create index if not exists transactions_category_id_idx on public.transactions (category_id);
create index if not exists admin_logs_created_at_idx on public.admin_logs (created_at desc);
create index if not exists admin_logs_admin_id_idx on public.admin_logs (admin_id);
create index if not exists ai_logs_created_at_idx on public.ai_logs (created_at desc);
create index if not exists ai_logs_user_id_idx on public.ai_logs (user_id);
create index if not exists system_events_created_at_idx on public.system_events (created_at desc);
create index if not exists system_events_user_id_idx on public.system_events (user_id);
create index if not exists system_events_event_type_idx on public.system_events (event_type);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

drop trigger if exists trg_admin_users_updated_at on public.admin_users;
create trigger trg_admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

create or replace function public.is_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.admin_users au
        where au.user_id = coalesce(target_user_id, auth.uid())
    );
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated, service_role;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.user_profiles (
        user_id,
        email,
        full_name
    )
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
    )
    on conflict (user_id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();

    insert into public.categories (user_id, name, type, is_default)
    values
        (new.id, 'Salary', 'income', true),
        (new.id, 'Necessities', 'expense', true),
        (new.id, 'Education', 'expense', true),
        (new.id, 'Savings', 'expense', true),
        (new.id, 'Entertainment', 'expense', true),
        (new.id, 'Freedom', 'expense', true),
        (new.id, 'Giving', 'expense', true)
    on conflict do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.handle_auth_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.user_profiles
    set email = new.email,
        full_name = coalesce(new.raw_user_meta_data->>'full_name', full_name),
        updated_at = now()
    where user_id = new.id;

    return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_auth_user_update();

create or replace function public.log_system_event(
    p_user_id uuid,
    p_event_type text,
    p_source_table text,
    p_source_id text,
    p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.system_events (user_id, event_type, source_table, source_id, payload)
    values (p_user_id, p_event_type, p_source_table, p_source_id, coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function public.trg_user_profiles_system_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        perform public.log_system_event(
            new.user_id,
            'profile_created',
            'user_profiles',
            new.user_id::text,
            jsonb_build_object(
                'full_name', new.full_name,
                'monthly_spending_limit', new.monthly_spending_limit,
                'daily_spending_limit', new.daily_spending_limit
            )
        );
    elsif tg_op = 'UPDATE' then
        perform public.log_system_event(
            new.user_id,
            'profile_updated',
            'user_profiles',
            new.user_id::text,
            jsonb_build_object(
                'full_name', new.full_name,
                'monthly_spending_limit', new.monthly_spending_limit,
                'daily_spending_limit', new.daily_spending_limit
            )
        );
    end if;

    return new;
end;
$$;

drop trigger if exists trg_user_profiles_system_events on public.user_profiles;
create trigger trg_user_profiles_system_events
after insert or update on public.user_profiles
for each row execute function public.trg_user_profiles_system_events();

create or replace function public.trg_transactions_system_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'DELETE' then
        perform public.log_system_event(
            old.user_id,
            'transaction_deleted',
            'transactions',
            old.id::text,
            jsonb_build_object('type', old.type, 'amount', old.amount, 'jar', old.jar, 'note', old.note)
        );
        return old;
    end if;

    if tg_op = 'INSERT' then
        perform public.log_system_event(
            new.user_id,
            'transaction_created',
            'transactions',
            new.id::text,
            jsonb_build_object('type', new.type, 'amount', new.amount, 'jar', new.jar, 'note', new.note)
        );
    elsif tg_op = 'UPDATE' then
        perform public.log_system_event(
            new.user_id,
            'transaction_updated',
            'transactions',
            new.id::text,
            jsonb_build_object('type', new.type, 'amount', new.amount, 'jar', new.jar, 'note', new.note)
        );
    end if;

    return new;
end;
$$;

drop trigger if exists trg_transactions_system_events on public.transactions;
create trigger trg_transactions_system_events
after insert or update or delete on public.transactions
for each row execute function public.trg_transactions_system_events();

alter table public.user_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_logs enable row level security;
alter table public.ai_logs enable row level security;
alter table public.system_events enable row level security;

drop policy if exists user_profiles_select_self on public.user_profiles;
create policy user_profiles_select_self
on public.user_profiles
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists user_profiles_insert_self on public.user_profiles;
create policy user_profiles_insert_self
on public.user_profiles
for insert
with check (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self
on public.user_profiles
for update
using (auth.uid() = user_id or public.is_admin(auth.uid()))
with check (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists categories_crud_own on public.categories;
create policy categories_crud_own
on public.categories
for all
using (auth.uid() = user_id or public.is_admin(auth.uid()))
with check (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists transactions_crud_own on public.transactions;
create policy transactions_crud_own
on public.transactions
for all
using (auth.uid() = user_id or public.is_admin(auth.uid()))
with check (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists ai_logs_select_own on public.ai_logs;
create policy ai_logs_select_own
on public.ai_logs
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists ai_logs_insert_own on public.ai_logs;
create policy ai_logs_insert_own
on public.ai_logs
for insert
with check (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists admin_users_select_self on public.admin_users;
create policy admin_users_select_self
on public.admin_users
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists admin_logs_select_admin on public.admin_logs;
create policy admin_logs_select_admin
on public.admin_logs
for select
using (public.is_admin(auth.uid()));

drop policy if exists admin_logs_insert_admin on public.admin_logs;
create policy admin_logs_insert_admin
on public.admin_logs
for insert
with check (public.is_admin(auth.uid()));

drop policy if exists system_events_select_own_or_admin on public.system_events;
create policy system_events_select_own_or_admin
on public.system_events
for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

do $$
begin
    if to_regclass('public.user_profiles') is not null
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'user_profiles'
       ) then
        alter publication supabase_realtime add table public.user_profiles;
    end if;

    if to_regclass('public.transactions') is not null
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'transactions'
       ) then
        alter publication supabase_realtime add table public.transactions;
    end if;

    if to_regclass('public.categories') is not null
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'categories'
       ) then
        alter publication supabase_realtime add table public.categories;
    end if;

    if to_regclass('public.admin_users') is not null
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'admin_users'
       ) then
        alter publication supabase_realtime add table public.admin_users;
    end if;

    if to_regclass('public.admin_logs') is not null
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'admin_logs'
       ) then
        alter publication supabase_realtime add table public.admin_logs;
    end if;

    if to_regclass('public.ai_logs') is not null
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'ai_logs'
       ) then
        alter publication supabase_realtime add table public.ai_logs;
    end if;

    if to_regclass('public.system_events') is not null
       and not exists (
           select 1
           from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'system_events'
       ) then
        alter publication supabase_realtime add table public.system_events;
    end if;
end
$$;
