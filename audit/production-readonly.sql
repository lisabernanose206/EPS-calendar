-- Optional verification in the Supabase SQL editor. READ ONLY: no application data is read.
-- Compare these deployed definitions with supabase/schema.sql and the audit report.
begin read only;

select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('etabs','etab_members','etab_invites','eps_plannings','eps_feedback');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('etabs','etab_members','etab_invites','eps_plannings','eps_feedback')
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')
  and table_name in ('etabs','etab_members','etab_invites','eps_plannings','eps_feedback')
order by table_name, grantee, privilege_type;

select grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'etabs'
  and grantee in ('anon','authenticated','PUBLIC')
order by grantee, column_name, privilege_type;

select p.oid::regprocedure as function_signature, p.prosecdef as security_definer,
       p.proconfig as function_settings,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       pg_get_functiondef(p.oid) as deployed_definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'claim_etab_for_current_user','create_etab_for_current_user',
  'create_etab_invite','accept_etab_invite','get_current_etab_role',
  'get_current_user_etab','list_current_user_etabs','list_etab_members',
  'remove_etab_member','promote_etab_member_to_owner',
  'demote_etab_owner_to_member','transfer_etab_creator'
)
order by p.proname;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.etabs'::regclass, 'public.etab_members'::regclass,
                  'public.etab_invites'::regclass, 'public.eps_plannings'::regclass,
                  'public.eps_feedback'::regclass)
order by table_name, conname;

select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('etabs','etab_members','etab_invites','eps_plannings','eps_feedback');

select current_setting('pgaudit.log', true) as pgaudit_log_configuration;

rollback;
