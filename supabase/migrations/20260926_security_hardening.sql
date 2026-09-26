-- EPS Loustic : migration transactionnelle, à exécuter dans le SQL Editor.
-- Ne supprime aucun planning. Si une instruction échoue, tout est annulé.
begin;
set local lock_timeout = '10s';
-- Ne pas écraser silencieusement une politique ajoutée dans le SQL Editor.
do $$ declare unexpected text; begin
  select string_agg(tablename || ':' || policyname, ', ') into unexpected from pg_policies
  where schemaname='public' and tablename in ('etabs','etab_members','etab_invites','eps_plannings','eps_feedback')
    and not ((tablename || ':' || policyname)=any(array['etabs:members read own etab','etabs:owners update own etab','etab_members:members read memberships','etab_invites:members read invites','eps_plannings:members read plannings','eps_plannings:owners write plannings','eps_plannings:editors write plannings','eps_feedback:members insert feedback','eps_feedback:members read feedback','eps_feedback:authors and owners read feedback','eps_plannings:admin write planning','eps_plannings:owners insert plannings','eps_plannings:owners update plannings','eps_plannings:read planning','etab_members:members read own memberships']));
  if unexpected is not null then raise exception 'Politiques supplémentaires à examiner avant migration : %',unexpected; end if;
end $$;

-- Anciennes politiques examinées : remplacées par les règles d'appartenance ci-dessous.
drop policy if exists "admin write planning" on public.eps_plannings;
drop policy if exists "owners insert plannings" on public.eps_plannings;
drop policy if exists "owners update plannings" on public.eps_plannings;
drop policy if exists "read planning" on public.eps_plannings;
drop policy if exists "members read own memberships" on public.etab_members;

-- Les anciennes demandes restent sans attribution : aucun établissement n'est deviné.
alter table public.eps_feedback add column if not exists etab_id uuid references public.etabs(id) on delete cascade;

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



alter table public.etab_invites add column if not exists max_uses integer;
alter table public.etab_invites add column if not exists used_count integer not null default 0;
alter table public.eps_feedback add column if not exists author_user_id uuid references auth.users(id) on delete set null;

-- Permissions de tables ET de colonnes : les deux peuvent accorder un accès.
do $$
declare t text; cols text;
begin
  foreach t in array array['etabs','etab_members','etab_invites','eps_plannings','eps_feedback'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    select string_agg(quote_ident(column_name), ',') into cols
      from information_schema.columns where table_schema='public' and table_name=t;
    execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated', cols,cols,cols,cols,t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
grant usage on schema public to authenticated;
grant select on public.etabs, public.etab_members, public.eps_plannings to authenticated;
grant update (name, slug) on public.etabs to authenticated;
grant insert, update on public.eps_plannings to authenticated;
grant select on public.eps_feedback to authenticated;
grant insert (etab_id, planning_id, kind, author, message, context, status) on public.eps_feedback to authenticated;
-- Aucun accès direct aux jetons, même pour les membres de l'établissement.
drop policy if exists "members read invites" on public.etab_invites;

create or replace function public.claim_etab_for_current_user(claim_etab_id uuid, etab_name text default 'Établissement EPS')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Migration désactivée : utilisez une invitation ou créez un établissement.' using errcode='42501';
end;
$$;

create or replace function public.accept_etab_invite(invite_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  invite_row public.etab_invites%rowtype;
  target_etab uuid;
  invite_etab_name text;
  effective_role text;
begin
  if auth.uid() is null then raise exception 'Utilisateur non connecté' using errcode='42501'; end if;
  select i.etab_id into target_etab from public.etab_invites i where i.token::text=invite_token;
  -- Même ordre de verrouillage pour toutes les opérations de gouvernance.
  perform 1 from public.etabs where id=target_etab for update;
  update public.etab_invites i
    set used_count=coalesce(i.used_count,0)+1
    where i.token::text=invite_token and i.expires_at>clock_timestamp()
      and coalesce(i.used_count,0)<coalesce(i.max_uses,1)
      and exists (select 1 from public.etab_members m where m.etab_id=i.etab_id and m.user_id=i.created_by and m.role='owner')
    returning i.* into invite_row;
  if not found then raise exception 'Invitation invalide ou expiree'; end if;
  insert into public.etab_members as existing (etab_id,user_id,role)
    values (invite_row.etab_id,auth.uid(),invite_row.role)
    on conflict (etab_id,user_id) do update
      set role=case when existing.role='owner' then 'owner' else excluded.role end
    returning role into effective_role;
  select e.name into invite_etab_name from public.etabs e where e.id=invite_row.etab_id;
  return jsonb_build_object('id',invite_row.etab_id,'role',effective_role,'etab_name',invite_etab_name);
end;
$$;

create or replace function public.create_etab_for_current_user(etab_name text, etab_slug text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_etab_id uuid;
  clean_name text;
  clean_slug text;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecte';
  end if;

  if length(etab_name)>200 or length(etab_slug)>200 then raise exception 'Nom ou identifiant trop long'; end if;
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

create or replace function public.get_current_etab_role(check_etab_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
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

create or replace function public.get_current_user_etab()
returns jsonb
language plpgsql
security definer
set search_path = ''
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

create or replace function public.list_current_user_etabs()
returns jsonb
language plpgsql
security definer
set search_path = ''
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

create or replace function public.list_etab_members(check_etab_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
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

create or replace function public.remove_etab_member(target_etab_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_email text;
  removed_role text;
  is_creator boolean;
  owner_count integer;
begin
  perform 1 from public.etabs where id=target_etab_id for update;
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

create or replace function public.promote_etab_member_to_owner(target_etab_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  perform 1 from public.etabs where id=target_etab_id for update;
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

create or replace function public.demote_etab_owner_to_member(target_etab_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
  is_target_creator boolean;
begin
  perform 1 from public.etabs where id=target_etab_id for update;
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

create or replace function public.transfer_etab_creator(target_etab_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  perform 1 from public.etabs where id=target_etab_id for update;
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

create or replace function public.create_etab_invite(invite_etab_id uuid, invite_role text default 'member')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_token text;
begin
  perform 1 from public.etabs where id=invite_etab_id for update;
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

  if invite_role is null or invite_role not in ('owner', 'member') then
    invite_role := 'member';
  end if;

  insert into public.etab_invites (etab_id, created_by, role, max_uses)
  values (invite_etab_id, auth.uid(), invite_role, 1)
  returning token into invite_token;

  return invite_token;
end;
$$;

do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['create_etab_for_current_user','claim_etab_for_current_user','get_current_etab_role','get_current_user_etab','list_current_user_etabs','list_etab_members','remove_etab_member','promote_etab_member_to_owner','demote_etab_owner_to_member','transfer_etab_creator','create_etab_invite','accept_etab_invite']) loop
    execute format('revoke all on function %s from public, anon, authenticated',f);
    execute format('alter function %s set search_path = %L',f,'');
  end loop;
end $$;
grant execute on function public.create_etab_for_current_user(text, text) to authenticated;
grant execute on function public.get_current_etab_role(uuid) to authenticated;
grant execute on function public.get_current_user_etab() to authenticated;
grant execute on function public.list_current_user_etabs() to authenticated;
grant execute on function public.list_etab_members(uuid) to authenticated;
grant execute on function public.remove_etab_member(uuid, uuid) to authenticated;
grant execute on function public.promote_etab_member_to_owner(uuid, uuid) to authenticated;
grant execute on function public.demote_etab_owner_to_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_etab_creator(uuid, uuid) to authenticated;
grant execute on function public.create_etab_invite(uuid, text) to authenticated;
grant execute on function public.accept_etab_invite(text) to authenticated;

create or replace function public.eps_validate_json(value jsonb, depth integer default 0)
returns void language plpgsql immutable set search_path = '' as $$
declare entry record; element jsonb;
begin
  if depth is null or depth < 0 or depth > 30 then raise exception 'JSON trop profond' using errcode='23514'; end if;
  if jsonb_typeof(value)='string' and length(value #>> '{}')>100000 then raise exception 'Texte trop long' using errcode='23514'; end if;
  if jsonb_typeof(value)='object' then
    for entry in select * from jsonb_each(value) loop
      if entry.key in ('__proto__','constructor','prototype') then raise exception 'Clé JSON interdite' using errcode='23514'; end if;
      perform public.eps_validate_json(entry.value,depth+1);
    end loop;
  elsif jsonb_typeof(value)='array' then
    if jsonb_array_length(value)>20000 then raise exception 'Tableau trop volumineux' using errcode='23514'; end if;
    for element in select * from jsonb_array_elements(value) loop
      perform public.eps_validate_json(element,depth+1);
    end loop;
  end if;
end;
$$;
revoke all on function public.eps_validate_json(jsonb,integer) from public, anon, authenticated;
grant execute on function public.eps_validate_json(jsonb,integer) to authenticated;

create or replace function public.eps_validate_write()
returns trigger language plpgsql set search_path = '' as $$
declare k text; item jsonb;
begin
  if new.etab_id is null then raise exception 'Établissement requis pour toute nouvelle écriture' using errcode='23514'; end if;
  if tg_table_name='eps_plannings' then
    if jsonb_typeof(new.data) is distinct from 'object' or octet_length(new.data::text)>10000000 then
      raise exception 'Format ou taille du planning invalide' using errcode='23514';
    end if;
    perform public.eps_validate_json(new.data);
    if new.data ? 'planningId' and (jsonb_typeof(new.data->'planningId') is distinct from 'string' or length(new.data->>'planningId')>200) then raise exception 'Identifiant de planning invalide' using errcode='23514'; end if;
    if new.data ? 'etabId' and (jsonb_typeof(new.data->'etabId') is distinct from 'string' or new.data->>'etabId' is distinct from new.etab_id::text) then
      raise exception 'Établissement du planning incohérent' using errcode='23514';
    end if;
    foreach k in array array['teachers','activities','facilities','cycles','constructionRules','constructionVersions','sportEvents','asSessions','facilityUnavailability'] loop
      if new.data ? k then
        if jsonb_typeof(new.data->k) is distinct from 'array' then raise exception 'Liste invalide : %', k using errcode='23514'; end if;
        if jsonb_array_length(new.data->k)>20000 then raise exception 'Liste trop volumineuse : %', k using errcode='23514'; end if;
        for item in select value from jsonb_array_elements(new.data->k) loop
          if jsonb_typeof(item) is distinct from 'object' then raise exception 'Élément invalide : %',k using errcode='23514'; end if;
          if k='teachers' and (jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'name') is distinct from 'string' or jsonb_typeof(item->'weekTargets'->'A') is distinct from 'number' or jsonb_typeof(item->'weekTargets'->'B') is distinct from 'number') then raise exception 'Professeur incomplet' using errcode='23514'; end if;
          if item ? 'name' and (jsonb_typeof(item->'name') is distinct from 'string' or length(item->>'name')>1000) then raise exception 'Nom invalide' using errcode='23514'; end if;
          if item ? 'label' and (jsonb_typeof(item->'label') is distinct from 'string' or length(item->>'label')>1000) then raise exception 'Libellé invalide' using errcode='23514'; end if;
        end loop;
      end if;
    end loop;
    new.data=jsonb_set(new.data,'{etabId}',to_jsonb(new.etab_id::text));
    if tg_op='UPDATE' then
      if new.etab_id is distinct from old.etab_id or new.id is distinct from old.id then raise exception 'Identité du planning immuable' using errcode='23514'; end if;
      new.updated_at=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
    else new.updated_at=clock_timestamp(); end if;
  elsif tg_table_name='eps_feedback' then
    if length(btrim(new.message)) not between 1 and 5000 or length(coalesce(new.author,''))>200 or length(new.planning_id)>200
       or jsonb_typeof(new.context) is distinct from 'object' or octet_length(new.context::text)>10000 then
      raise exception 'Demande invalide ou trop volumineuse' using errcode='23514';
    end if;
    new.author_user_id=auth.uid();
    new.created_at=clock_timestamp();
    new.status='new';
  end if;
  return new;
end;
$$;
revoke all on function public.eps_validate_write() from public, anon, authenticated;
drop trigger if exists eps_validate_planning on public.eps_plannings;
create trigger eps_validate_planning before insert or update on public.eps_plannings for each row execute function public.eps_validate_write();
drop trigger if exists eps_validate_feedback on public.eps_feedback;
create trigger eps_validate_feedback before insert on public.eps_feedback for each row execute function public.eps_validate_write();

drop policy if exists "members read feedback" on public.eps_feedback;
drop policy if exists "authors and owners read feedback" on public.eps_feedback;
create policy "authors and owners read feedback" on public.eps_feedback for select to authenticated using (
  exists (select 1 from public.etab_members m where m.etab_id=eps_feedback.etab_id and m.user_id=auth.uid()
    and (m.role='owner' or eps_feedback.author_user_id=auth.uid()))
);

-- Journal minimal : pas de contenu de planning, d'email ou de jeton d'invitation.
create table if not exists public.eps_security_audit (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  etab_id uuid,
  entity text not null,
  action text not null,
  subject_id uuid,
  old_role text,
  new_role text
);
alter table public.eps_security_audit enable row level security;
revoke all on public.eps_security_audit from public, anon, authenticated;
create index if not exists eps_security_audit_etab_time on public.eps_security_audit(etab_id,occurred_at);
create or replace function public.eps_audit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a jsonb; b jsonb;
begin
  if tg_op<>'DELETE' then a=to_jsonb(new); end if;
  if tg_op<>'INSERT' then b=to_jsonb(old); end if;
  insert into public.eps_security_audit(actor_id,etab_id,entity,action,subject_id,old_role,new_role)
  values(auth.uid(),(case when tg_table_name='etabs' then coalesce(a->>'id',b->>'id') else coalesce(a->>'etab_id',b->>'etab_id') end)::uuid,
    tg_table_name,tg_op,
    case when tg_table_name='etab_members' then coalesce(a->>'user_id',b->>'user_id')::uuid
         when tg_table_name='etabs' then coalesce(a->>'created_by',b->>'created_by')::uuid end,
    case when tg_table_name='etab_members' then b->>'role' end,
    case when tg_table_name='etab_members' then a->>'role' end);
  return null;
end;
$$;
revoke all on function public.eps_audit_change() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['etabs','etab_members','etab_invites','eps_plannings','eps_feedback'] loop
    execute format('drop trigger if exists eps_security_audit_trigger on public.%I',t);
    execute format('create trigger eps_security_audit_trigger after insert or update or delete on public.%I for each row execute function public.eps_audit_change()',t);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
