create extension if not exists pgcrypto;

create table if not exists public.etabs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);

alter table public.etabs
add column if not exists created_by uuid references auth.users(id) on delete set null;

create table if not exists public.etab_members (
  etab_id uuid not null references public.etabs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (etab_id, user_id)
);

create table if not exists public.etab_invites (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  etab_id uuid not null references public.etabs(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  expires_at timestamptz not null default now() + interval '30 days',
  used_count integer not null default 0,
  max_uses integer,
  created_at timestamptz not null default now()
);

create table if not exists public.eps_plannings (
  etab_id uuid not null references public.etabs(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint eps_plannings_one_save_per_etab unique (etab_id)
);

alter table public.eps_plannings
add column if not exists etab_id uuid references public.etabs(id) on delete cascade;

-- Migration si eps_plannings existait déjà avec id comme seule cl? primaire :
-- 1. creez d'abord l’établissement et récupérez son UUID.
-- 2. adaptez puis lancez :
-- alter table public.eps_plannings add column if not exists etab_id uuid references public.etabs(id) on delete cascade;
-- update public.eps_plannings set etab_id = 'ETAB_UUID_ICI' where etab_id is null;
-- alter table public.eps_plannings alter column etab_id set not null;
-- Pour garantir une seule sauvegarde par etablissement :
-- delete from public.eps_plannings a
-- using public.eps_plannings b
-- where a.etab_id = b.etab_id
--   and a.updated_at < b.updated_at;
-- alter table public.eps_plannings add constraint eps_plannings_one_save_per_etab unique (etab_id);

-- AS et événements sportifs sont rattachés au planning dans data :
-- data->'asSessions' et data->'sportEvents'.
-- Chaque entree contient etabId + planningId.

grant usage on schema public to anon, authenticated;
grant select, update on public.etabs to authenticated;
grant select on public.etab_members to authenticated;
grant insert, select, update on public.eps_plannings to authenticated;

create table if not exists public.eps_feedback (
  id uuid primary key default gen_random_uuid(),
  etab_id uuid not null references public.etabs(id) on delete cascade,
  planning_id text not null,
  kind text not null check (kind in ('bug', 'improvement')),
  author text,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.eps_feedback
add column if not exists etab_id uuid references public.etabs(id) on delete cascade;

grant insert, select, update on public.eps_feedback to authenticated;

alter table public.etabs enable row level security;
alter table public.etab_members enable row level security;
alter table public.etab_invites enable row level security;
alter table public.eps_plannings enable row level security;
alter table public.eps_feedback enable row level security;

drop policy if exists "members read own etab" on public.etabs;
create policy "members read own etab"
on public.etabs for select
using (
  exists (
    select 1 from public.etab_members m
    where m.etab_id = etabs.id
    and m.user_id = auth.uid()
  )
);

drop policy if exists "owners update own etab" on public.etabs;
create policy "owners update own etab"
on public.etabs for update
using (
  exists (
    select 1 from public.etab_members m
    where m.etab_id = etabs.id
    and m.user_id = auth.uid()
    and m.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.etab_members m
    where m.etab_id = etabs.id
    and m.user_id = auth.uid()
    and m.role = 'owner'
  )
);

drop policy if exists "members read memberships" on public.etab_members;
create policy "members read memberships"
on public.etab_members for select
using (user_id = auth.uid());

drop policy if exists "members read invites" on public.etab_invites;
create policy "members read invites"
on public.etab_invites for select
using (
  exists (
    select 1 from public.etab_members m
    where m.etab_id = etab_invites.etab_id
    and m.user_id = auth.uid()
  )
);

drop policy if exists "members read plannings" on public.eps_plannings;
create policy "members read plannings"
on public.eps_plannings for select
using (
  exists (
    select 1 from public.etab_members m
    where m.etab_id = eps_plannings.etab_id
    and m.user_id = auth.uid()
  )
);

drop policy if exists "owners write plannings" on public.eps_plannings;
drop policy if exists "editors write plannings" on public.eps_plannings;
create policy "owners write plannings"
on public.eps_plannings for all
using (
  exists (
    select 1 from public.etab_members m
    where m.etab_id = eps_plannings.etab_id
    and m.user_id = auth.uid()
    and m.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.etab_members m
    where m.etab_id = eps_plannings.etab_id
    and m.user_id = auth.uid()
    and m.role = 'owner'
  )
);

drop policy if exists "members insert feedback" on public.eps_feedback;
create policy "members insert feedback"
on public.eps_feedback for insert
with check (
  exists (
    select 1 from public.etab_members m
    where m.etab_id = eps_feedback.etab_id
    and m.user_id = auth.uid()
  )
);

drop policy if exists "members read feedback" on public.eps_feedback;
create policy "members read feedback"
on public.eps_feedback for select
using (
  exists (
    select 1 from public.etab_members m
    where m.etab_id = eps_feedback.etab_id
    and m.user_id = auth.uid()
  )
);

update public.etabs e
set created_by = first_owner.user_id
from (
  select distinct on (etab_id) etab_id, user_id
  from public.etab_members
  where role = 'owner'
  order by etab_id, created_at asc
) first_owner
where e.id = first_owner.etab_id
and e.created_by is null;

create or replace function public.create_etab_for_current_user(etab_name text, etab_slug text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_etab_id uuid;
  clean_name text;
  clean_slug text;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecte';
  end if;

  clean_name := nullif(trim(etab_name), '');
  if clean_name is null then
    raise exception 'Nom d''Établissement requis';
  end if;

  clean_slug := nullif(trim(etab_slug), '');
  if clean_slug is null then
    clean_slug := lower(regexp_replace(clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
  end if;
  clean_slug := trim(both '-' from clean_slug);
  if clean_slug = '' then
    clean_slug := 'Établissement';
  end if;
  clean_slug := clean_slug || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.etabs (name, slug, created_by)
  values (clean_name, clean_slug, auth.uid())
  returning id into new_etab_id;

  insert into public.etab_members (etab_id, user_id, role)
  values (new_etab_id, auth.uid(), 'owner');

  return new_etab_id;
end;
$$;

grant execute on function public.create_etab_for_current_user(text, text) to authenticated;

create or replace function public.claim_etab_for_current_user(claim_etab_id uuid, etab_name text default 'Établissement EPS')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
  clean_name text;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecte';
  end if;

  if claim_etab_id is null then
    raise exception 'etab_id requis';
  end if;

  clean_name := nullif(trim(etab_name), '');
  if clean_name is null then
    clean_name := 'Établissement EPS';
  end if;

  insert into public.etabs (id, name, slug)
  values (claim_etab_id, clean_name, 'migration-' || substr(claim_etab_id::text, 1, 8))
  on conflict (id) do nothing;

  select count(*) into member_count
  from public.etab_members
  where etab_id = claim_etab_id;

  if member_count > 0 and not exists (
    select 1 from public.etab_members
    where etab_id = claim_etab_id
    and user_id = auth.uid()
  ) then
    raise exception 'Cet ?tablissement a déjà une équipe. Demandez un lien d''invitation owner.';
  end if;

  insert into public.etab_members (etab_id, user_id, role)
  values (claim_etab_id, auth.uid(), 'owner')
  on conflict (etab_id, user_id) do update
  set role = 'owner';

  return jsonb_build_object('id', claim_etab_id, 'role', 'owner');
end;
$$;

grant execute on function public.claim_etab_for_current_user(uuid, text) to authenticated;

create or replace function public.get_current_etab_role(check_etab_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  found_role text;
begin
  if auth.uid() is null then
    return '';
  end if;

  select role
  into found_role
  from public.etab_members
  where etab_id = check_etab_id
    and user_id = auth.uid()
  limit 1;

  return coalesce(found_role, '');
end;
$$;

grant execute on function public.get_current_etab_role(uuid) to authenticated;

create or replace function public.get_current_user_etab()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found_etab_id uuid;
  found_role text;
  found_etab_name text;
begin
  if auth.uid() is null then
    return jsonb_build_object();
  end if;

  select etab_id, role
  into found_etab_id, found_role
  from public.etab_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if found_etab_id is null then
    return jsonb_build_object();
  end if;

  select name
  into found_etab_name
  from public.etabs
  where id = found_etab_id
  limit 1;

  return jsonb_build_object('etab_id', found_etab_id, 'role', found_role, 'etab_name', found_etab_name);
end;
$$;

grant execute on function public.get_current_user_etab() to authenticated;

create or replace function public.list_current_user_etabs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'etab_id', m.etab_id,
      'role', m.role,
      'etab_name', e.name,
      'created_at', m.created_at
    ) order by m.created_at asc)
    from public.etab_members m
    left join public.etabs e on e.id = m.etab_id
    where m.user_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_current_user_etabs() to authenticated;

create or replace function public.list_etab_members(check_etab_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;

  if not exists (
    select 1 from public.etab_members m
    where m.etab_id = check_etab_id
    and m.user_id = auth.uid()
  ) then
    raise exception 'Droits insuffisants pour consulter les membres';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', m.user_id,
      'email', coalesce(u.email, m.user_id::text),
      'role', m.role,
      'is_creator', m.user_id = e.created_by,
      'created_at', m.created_at
    ) order by (m.role = 'owner') desc, coalesce(u.email, m.user_id::text) asc)
    from public.etab_members m
    left join public.etabs e on e.id = m.etab_id
    left join auth.users u on u.id = m.user_id
    where m.etab_id = check_etab_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_etab_members(uuid) to authenticated;

create or replace function public.remove_etab_member(target_etab_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_email text;
  removed_role text;
  is_creator boolean;
  owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecte';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Un admin ne peut pas supprimer son propre acces depuis cette page';
  end if;

  if not exists (
    select 1 from public.etab_members m
    where m.etab_id = target_etab_id
    and m.user_id = auth.uid()
    and m.role = 'owner'
  ) then
    raise exception 'Droits insuffisants pour supprimer un membre';
  end if;

  select exists (
    select 1 from public.etabs e
    where e.id = target_etab_id
    and e.created_by = target_user_id
  )
  into is_creator;

  if is_creator then
    raise exception 'Le createur de l''etablissement ne peut pas etre supprime';
  end if;

  select email
  into removed_email
  from auth.users
  where id = target_user_id
  limit 1;

  select role
  into removed_role
  from public.etab_members
  where etab_id = target_etab_id
  and user_id = target_user_id
  limit 1;

  if removed_role is null then
    raise exception 'Membre introuvable dans cet etablissement';
  end if;

  if removed_role = 'owner' then
    select count(*)
    into owner_count
    from public.etab_members
    where etab_id = target_etab_id
    and role = 'owner';

    if owner_count <= 1 then
      raise exception 'Impossible de supprimer le dernier admin de l''etablissement';
    end if;
  end if;

  delete from public.etab_members
  where etab_id = target_etab_id
  and user_id = target_user_id;

  if not found then
    raise exception 'Membre introuvable dans cet etablissement';
  end if;

  return jsonb_build_object('user_id', target_user_id, 'email', removed_email);
end;
$$;

grant execute on function public.remove_etab_member(uuid, uuid) to authenticated;

create or replace function public.promote_etab_member_to_owner(target_etab_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecte';
  end if;

  if not exists (
    select 1 from public.etab_members m
    where m.etab_id = target_etab_id
    and m.user_id = auth.uid()
    and m.role = 'owner'
  ) then
    raise exception 'Droits insuffisants pour donner le role admin';
  end if;

  if not exists (
    select 1 from public.etab_members m
    where m.etab_id = target_etab_id
    and m.user_id = target_user_id
  ) then
    raise exception 'Le membre cible est introuvable dans cet etablissement';
  end if;

  update public.etab_members
  set role = 'owner'
  where etab_id = target_etab_id
  and user_id = target_user_id;

  select email
  into target_email
  from auth.users
  where id = target_user_id
  limit 1;

  return jsonb_build_object('user_id', target_user_id, 'email', target_email, 'role', 'owner');
end;
$$;

grant execute on function public.promote_etab_member_to_owner(uuid, uuid) to authenticated;

create or replace function public.demote_etab_owner_to_member(target_etab_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
  is_target_creator boolean;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecte';
  end if;

  if not exists (
    select 1 from public.etabs e
    where e.id = target_etab_id
    and e.created_by = auth.uid()
  ) then
    raise exception 'Seul le createur peut retrograder un admin';
  end if;

  select exists (
    select 1 from public.etabs e
    where e.id = target_etab_id
    and e.created_by = target_user_id
  )
  into is_target_creator;

  if is_target_creator then
    raise exception 'Le createur de l''etablissement ne peut pas etre retrograde';
  end if;

  if not exists (
    select 1 from public.etab_members m
    where m.etab_id = target_etab_id
    and m.user_id = target_user_id
    and m.role = 'owner'
  ) then
    raise exception 'L''admin cible est introuvable dans cet etablissement';
  end if;

  update public.etab_members
  set role = 'member'
  where etab_id = target_etab_id
  and user_id = target_user_id;

  select email
  into target_email
  from auth.users
  where id = target_user_id
  limit 1;

  return jsonb_build_object('user_id', target_user_id, 'email', target_email, 'role', 'member');
end;
$$;

grant execute on function public.demote_etab_owner_to_member(uuid, uuid) to authenticated;

create or replace function public.transfer_etab_creator(target_etab_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecte';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Le createur actuel est deja createur de cet etablissement';
  end if;

  if not exists (
    select 1 from public.etabs e
    where e.id = target_etab_id
    and e.created_by = auth.uid()
  ) then
    raise exception 'Seul le createur actuel peut transmettre ce statut';
  end if;

  if not exists (
    select 1 from public.etab_members m
    where m.etab_id = target_etab_id
    and m.user_id = target_user_id
  ) then
    raise exception 'Le nouveau createur doit deja etre membre de cet etablissement';
  end if;

  update public.etab_members
  set role = 'owner'
  where etab_id = target_etab_id
  and user_id = target_user_id;

  update public.etabs
  set created_by = target_user_id
  where id = target_etab_id;

  select email
  into target_email
  from auth.users
  where id = target_user_id
  limit 1;

  return jsonb_build_object('user_id', target_user_id, 'email', target_email);
end;
$$;

grant execute on function public.transfer_etab_creator(uuid, uuid) to authenticated;

create or replace function public.create_etab_invite(invite_etab_id uuid, invite_role text default 'member')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_token text;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecte';
  end if;

  if not exists (
    select 1 from public.etab_members m
    where m.etab_id = invite_etab_id
    and m.user_id = auth.uid()
    and m.role = 'owner'
  ) then
    raise exception 'Droits insuffisants pour inviter';
  end if;

  if invite_role not in ('owner', 'member') then
    invite_role := 'member';
  end if;

  insert into public.etab_invites (etab_id, created_by, role, max_uses)
  values (invite_etab_id, auth.uid(), invite_role, 1)
  returning token into invite_token;

  return invite_token;
end;
$$;

create or replace function public.accept_etab_invite(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.etab_invites%rowtype;
  invite_etab_name text;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecte';
  end if;

  select * into invite_row
  from public.etab_invites
  where token = invite_token
    and expires_at > now()
    and (max_uses is null or used_count < max_uses);

  if invite_row.token is null then
    raise exception 'Invitation invalide ou expiree';
  end if;

  insert into public.etab_members (etab_id, user_id, role)
  values (invite_row.etab_id, auth.uid(), invite_row.role)
  on conflict (etab_id, user_id) do update
  set role = excluded.role;

  update public.etab_invites
  set used_count = used_count + 1
  where token = invite_row.token;

  select name
  into invite_etab_name
  from public.etabs
  where id = invite_row.etab_id
  limit 1;

  return jsonb_build_object('id', invite_row.etab_id, 'role', invite_row.role, 'etab_name', invite_etab_name);
end;
$$;

grant execute on function public.create_etab_invite(uuid, text) to authenticated;
grant execute on function public.accept_etab_invite(text) to authenticated;
