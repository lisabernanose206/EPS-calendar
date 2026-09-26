-- Politiques communiquées par l'utilisatrice ; email remplacé par une valeur fictive.
-- Les corps réels des deux helpers n'ont pas été fournis : ces versions sont des mocks.
create function public.is_etab_member(check_etab_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from public.etab_members where etab_id=check_etab_id and user_id=auth.uid());
$$;
create function public.is_etab_owner(check_etab_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from public.etab_members where etab_id=check_etab_id and user_id=auth.uid() and role='owner');
$$;
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('eps_plannings','etab_members','etabs','etab_invites','eps_feedback') loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
create policy "admin write planning" on public.eps_plannings for all to authenticated
using (auth.jwt()->>'email'='legacy-admin@example.invalid')
with check (auth.jwt()->>'email'='legacy-admin@example.invalid');
create policy "members read plannings" on public.eps_plannings for select to authenticated using (public.is_etab_member(etab_id));
create policy "owners insert plannings" on public.eps_plannings for insert to authenticated with check (public.is_etab_owner(etab_id));
create policy "owners update plannings" on public.eps_plannings for update to authenticated using (public.is_etab_owner(etab_id)) with check (public.is_etab_owner(etab_id));
create policy "read planning" on public.eps_plannings for select to public using (true);
create policy "members read own memberships" on public.etab_members for select to authenticated using (user_id=auth.uid());
create policy "owners update own etab" on public.etabs for update to public
using (exists(select 1 from public.etab_members m where m.etab_id=etabs.id and m.user_id=auth.uid() and m.role='owner'))
with check (exists(select 1 from public.etab_members m where m.etab_id=etabs.id and m.user_id=auth.uid() and m.role='owner'));
