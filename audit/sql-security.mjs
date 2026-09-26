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
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
// PGlite does not ship pgcrypto. The schema only uses gen_random_uuid(), built into Postgres.
const schema = (await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"))
  .replace(/^create extension if not exists pgcrypto;\s*/i, "");
await db.exec(schema);
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
    ('test-invite','${etabA}','${user(1)}','member',1);
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
  try { await db.query("select public.accept_etab_invite($1)", ["test-invite"]); }
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
  await assert.rejects(db.query("select public.claim_etab_for_current_user($1)", [etabA]), /invitation/);
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
  await db.query("select public.accept_etab_invite($1)", ["test-invite"]);
  await assert.rejects(db.query("select public.accept_etab_invite($1)", ["test-invite"]), /invalide ou expiree/);
});
await check("SQL-12", "Un propriétaire peut modifier son propre planning", user(1), async () => {
  const rows = (await db.query("update public.eps_plannings set data='{}' where etab_id=$1 returning id", [etabA])).rows;
  assert.equal(rows.length, 1);
});
await mkdir(new URL("./results/", import.meta.url), { recursive: true });
await writeFile(new URL("./results/sql.json", import.meta.url), JSON.stringify({
  scope: "Local schema only; auth.uid is simulated; no production access; pgcrypto declaration omitted", results
}, null, 2) + "\n");
for (const item of results) console.log(`${item.status} ${item.id}: ${item.title}\n  ${item.evidence}`);
await db.close();
process.exitCode = results.some(item => item.status === "FAIL") ? 1 : 0;
