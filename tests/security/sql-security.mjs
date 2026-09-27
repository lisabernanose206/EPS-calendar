// Security checks against an ephemeral PostgreSQL database. No network or real users.
import { PGlite } from "@electric-sql/pglite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
const results = [];
const user = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const etabA = user(101), etabB = user(102);
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as
    $$select jsonb_build_object('email',current_setting('request.jwt.claim.email',true))$$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
// PGlite does not ship pgcrypto. The schema only uses gen_random_uuid(), built into Postgres.
const schema = (await readFile(new URL("../../supabase/schema.sql", import.meta.url), "utf8"))
  .replace(/create extension if not exists pgcrypto;\s*/i, "");
const observed = process.argv.includes("--observed");
const legacyFixture = process.env.EPS_SQL_LEGACY_FIXTURE || ((process.argv.includes("--legacy") || observed) ? new URL("./fixtures/schema-before-security.sql", import.meta.url) : null);
if (legacyFixture) {
  const legacy = (await readFile(legacyFixture, "utf8")).replace(/create extension if not exists pgcrypto;\s*/i, "");
  await db.exec(legacy);
  await db.exec("alter table public.etab_invites drop column max_uses; grant all on public.etab_invites to authenticated; grant update(created_by) on public.etabs to authenticated;");
  let snapshot;
  if (observed) {
    await db.exec(`alter table public.eps_feedback drop column etab_id cascade;
      alter table public.etab_invites alter column token drop default;
      alter table public.etab_invites alter column token type uuid using token::uuid;
      alter table public.etab_invites alter column token set default gen_random_uuid();
      alter table public.etab_invites alter column created_by drop not null;
      alter table public.etab_invites alter column expires_at set default now()+interval '14 days';
      alter table public.etab_invites add column max_uses integer;
      alter table public.eps_plannings alter column etab_id drop not null;
      insert into public.etabs(id,name) values ('00000000-0000-4000-8000-000000000900','Établissement existant');
      insert into public.eps_plannings(id,data) values ('historique','{"message":"À conserver"}');
      insert into public.eps_feedback(planning_id,kind,message) values ('historique','bug','Demande historique à conserver');
      insert into public.etab_invites(etab_id) values ('00000000-0000-4000-8000-000000000900');`);
    await db.exec(await readFile(new URL("./fixtures/observed-policies.sql",import.meta.url),"utf8"));
    snapshot=(await db.query("select (select jsonb_agg(to_jsonb(p)) from public.eps_plannings p) plannings, (select jsonb_agg(to_jsonb(i)) from public.etab_invites i) invites, (select jsonb_agg(to_jsonb(f)) from public.eps_feedback f) feedback")).rows[0];
  }
  const migration=await readFile(new URL("../../supabase/migrations/20260926_security_hardening.sql",import.meta.url),"utf8");
  if (observed) {
    await db.exec('create policy "unexpected custom policy" on public.eps_plannings for select using (true)');
    await assert.rejects(db.exec(migration),/Politiques supplémentaires/);
    await db.exec('rollback');
    assert.equal((await db.query("select count(*)::int n from pg_policies where policyname='read planning'")).rows[0].n,1);
    await db.exec('drop policy "unexpected custom policy" on public.eps_plannings');
    results.push({id:"MIGRATION-02",title:"Une politique encore inconnue bloque sans supprimer les anciennes règles",status:"PASS",evidence:"Échec attendu puis vérification après rollback"});
  }
  await db.exec(migration);
  await db.exec(migration); // Applying it twice must be safe.
  if (observed) {
    const after=(await db.query("select (select jsonb_agg(to_jsonb(p)) from public.eps_plannings p) plannings, (select jsonb_agg(to_jsonb(i)) from public.etab_invites i) invites, (select jsonb_agg(to_jsonb(f)-'etab_id'-'author_user_id') from public.eps_feedback f) feedback")).rows[0];
    assert.deepEqual(after,snapshot,"La migration doit préserver les valeurs historiques");
    assert.equal((await db.query("select count(*)::int n from public.eps_feedback where etab_id is not null")).rows[0].n,0);
    assert.equal((await db.query("select data_type from information_schema.columns where table_name='etab_invites' and column_name='token'")).rows[0].data_type,'uuid');
    results.push({id:"MIGRATION-01",title:"Données historiques, UUID et absence d'attribution préservés",status:"PASS",evidence:"Comparaison intégrale avant/après deux applications"});
  }
} else {
  await db.exec(schema);
  await db.exec(schema);
}
await db.exec(`
  insert into auth.users values
    ('${user(1)}','creator@example.invalid'), ('${user(2)}','member@example.invalid'),
    ('${user(3)}','admin@example.invalid'), ('${user(4)}','outsider@example.invalid');
  insert into public.etabs(id,name,created_by) values
    ('${etabA}','Collège Émile Zola','${user(1)}'), ('${etabB}','Autre établissement','${user(4)}');
  insert into public.etab_members(etab_id,user_id,role) values
    ('${etabA}','${user(1)}','owner'), ('${etabA}','${user(2)}','member'),
    ('${etabA}','${user(3)}','owner'), ('${etabB}','${user(4)}','owner');
  insert into public.eps_plannings(etab_id,id,data) values
    ('${etabA}','planning-a','{"teachers":[]}'), ('${etabB}','planning-b','{"teachers":[]}');
  insert into public.etab_invites(token,etab_id,created_by,role,max_uses) values
    ('00000000-0000-4000-8000-000000000601','${etabA}','${user(1)}','member',1);
`);
async function check(id, title, who, fn) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${who ? "authenticated" : "anon"}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [who || ""]);
    const evidence = await fn();
    results.push({ id, title, status: "PASS", evidence: evidence || "Security expectation met" });
  } catch (error) {
    results.push({ id, title, status: "FAIL", evidence: error.message });
  } finally { await db.exec("rollback"); }
}
await check("SQL-01", "Un membre ne peut pas se promouvoir avec claim_etab_for_current_user", user(2), async () => {
  try { await db.query("select public.claim_etab_for_current_user($1)", [etabA]); }
  catch { return "RPC denied"; }
  const row = (await db.query("select role from public.etab_members where user_id=auth.uid() and etab_id=$1", [etabA])).rows[0];
  assert.equal(row.role, "member", "Member became owner through the migration RPC");
});
await check("SQL-02", "Un admin non créateur ne peut pas réécrire created_by directement", user(3), async () => {
  try { await db.query("update public.etabs set created_by=auth.uid() where id=$1", [etabA]); }
  catch { return "Column update denied"; }
  const row = (await db.query("select created_by from public.etabs where id=$1", [etabA])).rows[0];
  assert.equal(row.created_by, user(1), "Non-creator owner took creator status by UPDATE");
});
await check("SQL-03", "Une invitation membre ne peut pas rétrograder le créateur", user(1), async () => {
  try { await db.query("select public.accept_etab_invite($1)", ["00000000-0000-4000-8000-000000000601"]); }
  catch { return "Creator role change denied"; }
  const row = (await db.query("select role from public.etab_members where user_id=auth.uid() and etab_id=$1", [etabA])).rows[0];
  assert.equal(row.role, "owner", "Creator was downgraded to member by accepting an invitation");
});
await check("SQL-04", "Un membre ne lit pas le planning d’un autre établissement", user(2), async () => {
  const rows = (await db.query("select id from public.eps_plannings where etab_id=$1", [etabB])).rows;
  assert.equal(rows.length, 0);
});
await check("SQL-05", "Un membre ne modifie pas directement le planning", user(2), async () => {
  const rows = (await db.query("update public.eps_plannings set data='{}' where etab_id=$1 returning id", [etabA])).rows;
  assert.equal(rows.length, 0);
});
await check("SQL-06", "Un anonyme ne peut pas lire les plannings", null, async () => {
  await assert.rejects(db.query("select * from public.eps_plannings"), /permission denied/);
});
await check("SQL-07", "Un utilisateur extérieur ne peut pas réclamer un établissement occupé", user(4), async () => {
  await assert.rejects(db.query("select public.claim_etab_for_current_user($1)", [etabA]), /invitation|permission denied/);
});
await check("SQL-08", "Un membre ne peut pas créer une invitation administrateur", user(2), async () => {
  await assert.rejects(db.query("select public.create_etab_invite($1,'owner')", [etabA]), /Droits insuffisants/);
});
await check("SQL-09", "Les métadonnées JSON ne peuvent pas désigner un autre établissement", user(1), async () => {
  try { await db.query("update public.eps_plannings set data=$1 where etab_id=$2", [JSON.stringify({ etabId: etabB, teachers: [] }), etabA]); }
  catch { return "Invalid JSON scope denied"; }
  assert.fail("A mismatched JSON etabId was accepted (row ownership itself was not bypassed)");
});
await check("SQL-10", "Les fonctions sensibles ne sont pas exécutables par anon", null, async () => {
  const row = (await db.query("select has_function_privilege('anon','public.claim_etab_for_current_user(uuid,text)','EXECUTE') allowed")).rows[0];
  assert.equal(row.allowed, false, "PUBLIC execution grant remains; internal auth.uid checks still apply");
});
await check("SQL-11", "Une invitation ne peut pas être réutilisée séquentiellement", user(4), async () => {
  await db.query("select public.accept_etab_invite($1)", ["00000000-0000-4000-8000-000000000601"]);
  await assert.rejects(db.query("select public.accept_etab_invite($1)", ["00000000-0000-4000-8000-000000000601"]), /invalide ou expiree/);
});
await check("SQL-12", "Un propriétaire peut modifier son propre planning", user(1), async () => {
  const rows = (await db.query("update public.eps_plannings set data='{}' where etab_id=$1 returning id", [etabA])).rows;
  assert.equal(rows.length, 1);
});
await check("SQL-13", "Un owner peut créer un lien et le destinataire rejoint l'établissement", user(1), async () => {
  const token=(await db.query("select public.create_etab_invite($1,'member') token",[etabA])).rows[0].token;
  assert.match(token,/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user(4)]);
  const row=(await db.query("select public.accept_etab_invite($1) result",[token])).rows[0].result;
  assert.equal(row.role,'member'); assert.equal(row.id,etabA);
});
await check("SQL-14", "Les jetons d'invitation ne sont pas lisibles directement", user(2), async () => {
  await assert.rejects(db.query('select token from public.etab_invites'),/permission denied/);
});
await check("SQL-15", "Le créateur peut transférer son statut par la fonction dédiée", user(1), async () => {
  await db.query('select public.transfer_etab_creator($1,$2)',[etabA,user(2)]);
  assert.equal((await db.query('select created_by from public.etabs where id=$1',[etabA])).rows[0].created_by,user(2));
});
await check("SQL-16", "Un administrateur peut toujours renommer son établissement", user(3), async () => {
  assert.equal((await db.query("update public.etabs set name='École sécurisée' where id=$1 returning name",[etabA])).rows[0].name,'École sécurisée');
});
await check("SQL-17", "Le journal est alimenté sans contenu sensible et interdit aux clients", user(1), async () => {
  await db.query("update public.eps_plannings set data='{}' where etab_id=$1",[etabA]);
  await db.exec('reset role');
  const rows=(await db.query("select * from public.eps_security_audit where actor_id=$1 and entity='eps_plannings'",[user(1)])).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].etab_id,etabA);
  assert.ok(!('data' in rows[0]) && !('token' in rows[0]));
  await db.exec('set local role authenticated');
  await assert.rejects(db.query('select * from public.eps_security_audit'),/permission denied/);
});
await check("SQL-18", "Les listes de planning mal formées sont refusées", user(1), async () => {
  await assert.rejects(db.query("update public.eps_plannings set data=$1 where etab_id=$2",[JSON.stringify({teachers:'invalid'}),etabA]),/Liste invalide/);
});
await check("SQL-19", "L'auteur d'une demande est établi par le serveur", user(2), async () => {
  await db.query("insert into public.eps_feedback(etab_id,planning_id,kind,author,message) values($1,'planning','bug','Autre personne','Échec de sauvegarde')",[etabA]);
  const row=(await db.query('select author_user_id,status from public.eps_feedback')).rows[0];
  assert.equal(row.author_user_id,user(2)); assert.equal(row.status,'new');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user(4)]);
  assert.equal((await db.query('select * from public.eps_feedback')).rows.length,0);
});
await check("SQL-20", "L'heure de sauvegarde est attribuée par le serveur", user(1), async () => {
  const row=(await db.query("update public.eps_plannings set updated_at='2099-01-01' where etab_id=$1 returning updated_at",[etabA])).rows[0];
  assert.ok(new Date(row.updated_at).getFullYear()<2099);
});
await check("SQL-21", "Les demandes trop longues sont refusées", user(2), async () => {
  await assert.rejects(db.query("insert into public.eps_feedback(etab_id,planning_id,kind,message) values($1,'p','bug',$2)",[etabA,'x'.repeat(5001)]),/volumineuse/);
});
await check("SQL-22", "Un membre ne peut pas falsifier directement son rôle", user(2), async () => {
  await assert.rejects(db.query("update public.etab_members set role='owner' where user_id=auth.uid()"),/permission denied/);
});

await check("SQL-23", "Les clés dangereuses imbriquées sont refusées", user(1), async () => {
  await assert.rejects(db.query("update public.eps_plannings set data=$1 where etab_id=$2",['{"extra":{"__proto__":{"polluted":true}}}',etabA]),/JSON interdite/);
});
await check("SQL-24", "Un professeur incomplet est refusé", user(1), async () => {
  await assert.rejects(db.query("update public.eps_plannings set data=$1 where etab_id=$2",['{"teachers":[{"id":"p1"}]}',etabA]),/Professeur incomplet/);
});
await check("SQL-25", "L'ancien email admin ne donne plus accès à un autre établissement", user(4), async () => {
  await db.query("select set_config('request.jwt.claim.email','legacy-admin@example.invalid',true)");
  assert.equal((await db.query("select id from public.eps_plannings where etab_id=$1",[etabA])).rows.length,0);
  assert.equal((await db.query("update public.eps_plannings set data='{}' where etab_id=$1 returning id",[etabA])).rows.length,0);
});
await check("SQL-26", "Un membre conserve la lecture de son établissement et de son appartenance", user(2), async () => {
  assert.equal((await db.query("select id from public.eps_plannings where etab_id=$1",[etabA])).rows.length,1);
  assert.equal((await db.query("select user_id from public.etab_members where etab_id=$1",[etabA])).rows[0].user_id,user(2));
});
await mkdir(new URL("./results/", import.meta.url), { recursive: true });
await writeFile(new URL(observed ? "./results/sql-observed.json" : legacyFixture ? "./results/sql-migration.json" : "./results/sql.json", import.meta.url), JSON.stringify({
  scope: "Local schema only; auth.uid is simulated; no production access; pgcrypto declaration omitted", results
}, null, 2) + "\n");
for (const item of results) console.log(`${item.status} ${item.id}: ${item.title}\n  ${item.evidence}`);
await db.close();
process.exitCode = results.some(item => item.status === "FAIL") ? 1 : 0;
