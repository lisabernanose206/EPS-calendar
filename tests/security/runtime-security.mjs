import { webcrypto } from "node:crypto";
import { build } from "esbuild";
import vm from "node:vm";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const bundle = await build({
  stdin: { contents: 'export {state} from "./src/app/state.js"; export * from "./src/services/cloud.js"; export {startOAuthProvider} from "./src/services/auth.js";', resolveDir: process.cwd() },
  bundle: true, write: false, format: "iife", globalName: "audit",
  plugins: [{ name: "headless-ui", setup(builder) {
    builder.onLoad({ filter: /[\\/]app[\\/]render\.js$/ }, () => ({ contents: "export function render() {}" }));
    builder.onLoad({ filter: /[\\/]ui[\\/]feedback\.js$/ }, () => ({ contents: "export function showValidationPopup() {}" }));
  }}]
});
function client(fetchImpl) {
  const storage = new Map();
  let redirect;
  const context = vm.createContext({
    console, Date, URL, URLSearchParams, setTimeout, clearTimeout, crypto: webcrypto, TextEncoder, btoa, AbortSignal,
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { location: { protocol: "https:", hostname: "example.invalid", href: "https://example.invalid/", assign: value => redirect = value } },
    localStorage: { getItem() { throw new Error("Local data forbidden"); }, setItem() { throw new Error("Local data forbidden"); }, removeItem() {} },
    fetch: fetchImpl
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  Object.assign(context.audit.state, {
    adminSession: { access_token: "FAKE", expires_at: 4102444800 }, currentEtabRole: "owner",
    cloudConfig: { enabled: true, autoSave: true, autoLoad: true, url: "https://example.invalid", anonKey: "FAKE", etabId: "A", planningId: "planning" },
    cloudSourceLoaded: true, cloudSyncing: false, cloudSaveTimer: null, cloudSaveQueued: false,
    cloudDataKeys: ["teachers", "activities"], cloudDirtyKeys: new Set(["teachers"]), localUnsyncedChanges: "pending-change",
    CLOUD_LOCAL_UNSYNCED_KEY: "pending", CLOUD_DIRTY_KEYS_KEY: "dirty",
    teachers: [{ id: "p1", name: "Élodie" }], activities: [{ id: "a1", label: "Course" }]
  });
  return { ...context.audit, storage, redirect: () => redirect };
}
const response = data => ({ ok: true, json: async () => structuredClone(data) });
const results = [];
async function check(id, title, fn) {
  try { await fn(); results.push({ id, title, status: "PASS" }); }
  catch (error) { results.push({ id, title, status: "FAIL", evidence: error.message }); }
}
await check("SYNC-01", "Un rechargement échoué conserve les marqueurs non synchronisés", async () => {
  const c = client(async () => { throw new Error("Simulated offline"); });
  await c.cloudSaveToRemote(false);
  assert.equal(c.state.cloudDirtyKeys.has("teachers"), true);
  await c.cloudLoadFromRemote(false);
  assert.equal(c.state.cloudDirtyKeys.has("teachers"), true, "Pending markers cleared after failed reload");
});
await check("SYNC-02", "Deux écritures concurrentes sur des zones distinctes sont préservées", async () => {
  let remote = { updated_at: "2026-09-26T00:00:00.000Z", etab_id: "A", id: "A", data: { etabId: "A", teachers: ["old-teacher"], activities: ["old-activity"] } };
  let reads = 0, unlock;
  const barrier = new Promise(resolve => unlock = resolve);
  const backend = async (url, options = {}) => {
    if (!options.method) {
      const snapshot = structuredClone(remote);
      if (++reads === 2) unlock();
      await barrier;
      return response([snapshot]);
    }
    const filter = new URL(url).searchParams.get("updated_at");
    if (options.method === "PATCH" && filter !== "eq." + remote.updated_at) return response([]);
    remote = JSON.parse(options.body);
    return response([remote]);
  };
  const first = client(backend), second = client(backend);
  first.state.teachers = ["new-teacher"];
  second.state.activities = ["new-activity"];
  second.state.cloudDirtyKeys = new Set(["activities"]);
  await Promise.all([first.cloudSaveToRemote(false), second.cloudSaveToRemote(false)]);
  assert.deepEqual(remote.data.teachers, ["new-teacher"], "One client's change was overwritten by the other client's whole-document PATCH");
  assert.deepEqual(remote.data.activities, ["new-activity"]);
});
await check("SYNC-03", "Une opération en vol ne change pas d’établissement cible", async () => {
  let c, sent;
  c = client(async (url, options = {}) => {
    if (!options.method) {
      // Simulate a scope change while the first HTTP request is pending.
      c.state.cloudConfig = { ...c.state.cloudConfig, etabId: "B" };
      return response([{ etab_id: "A", id: "A", data: { etabId: "A", teachers: [] } }]);
    }
    sent = JSON.parse(options.body);
    return response(null);
  });
  await c.cloudSaveToRemote(false);
  assert.ok(!sent || sent.etab_id === "A", "Data captured in A was sent to B after a mid-flight scope change (simulated)");
});
await check("SYNC-04", "Une sauvegarde mise en attente pendant une lecture est relancée", async () => {
  let release, readStarted;
  const started = new Promise(resolve => readStarted = resolve);
  const c = client(async () => { readStarted(); return new Promise(resolve => release = () => resolve(response([]))); });
  c.state.cloudDirtyKeys.clear();
  const loading = c.cloudLoadFromRemote(false);
  await started;
  c.saveCloudNowIfPossible(["teachers"]);
  release();
  await loading;
  assert.ok(c.state.cloudSaveTimer || !c.state.cloudDirtyKeys.size, "Save queued during GET remains queued with no scheduled sender");
  clearTimeout(c.state.cloudSaveTimer);
});
await check("AUTH-03", "La connexion OAuth utilise une preuve PKCE", async () => {
  const c = client(async () => { throw new Error("Network not allowed"); });
  await c.startOAuthProvider("google");
  const url = new URL(c.redirect());
  assert.ok(url.searchParams.has("code_challenge"), "OAuth authorize URL has no PKCE challenge; the app uses the implicit flow");
});
await check("ENC-01", "Une URL de backend HTTP est refusée", async () => {
  const c = client(async () => { throw new Error("Network not allowed"); });
  c.state.cloudConfig.url = "http://example.invalid";
  assert.equal(c.cloudWriteAllowed(), false, "Application configuration accepts HTTP; actual browser mixed-content protection is separate");
});
await check("SYNC-05", "Un accusé de sauvegarde vide ne supprime pas les modifications", async () => {
  const c = client(async () => response([]));
  await c.cloudSaveToRemote(false);
  assert.equal(c.state.cloudDirtyKeys.has("teachers"), true);
});
await check("SYNC-06", "Une zone modifiée ailleurs depuis sa lecture n'est pas écrasée", async () => {
  let writes = 0;
  const c = client(async (url, options = {}) => {
    if (options.method) writes++;
    return response([{ etab_id: "A", id: "A", updated_at: "2026-09-26T00:00:00Z", data: { etabId: "A", teachers: ["other-editor"] } }]);
  });
  c.state.cloudBaseData = { etabId: "A", teachers: ["old-teacher"] };
  await c.cloudSaveToRemote(false);
  assert.equal(writes, 0);
  assert.equal(c.state.cloudDirtyKeys.has("teachers"), true);
  assert.match(c.state.cloudStatus, /Conflit/);
});
await check("SYNC-07", "Une modification pendant l'envoi reste à sauvegarder", async () => {
  let c;
  c = client(async (url, options = {}) => {
    if (!options.method) return response([]);
    c.state.teachers[0].name = "Modification après capture";
    return response([JSON.parse(options.body)]);
  });
  await c.cloudSaveToRemote(false);
  assert.equal(c.state.cloudDirtyKeys.has("teachers"), true);
});
await check("ENC-02", "Un appel hors du backend configuré ne reçoit aucun jeton", async () => {
  let sent = false;
  const c = client(async () => { sent = true; return response([]); });
  await assert.rejects(() => c.cloudFetchWithAuthRetry("https://attacker.invalid/collect"));
  assert.equal(sent, false);
});

await check("SOURCE-01", "Aucune écriture avant lecture Supabase même avec contournement demandé", async () => {
  let requests = 0;
  const c = client(async () => { requests++; return response([]); });
  c.state.cloudSourceLoaded = false;
  await c.cloudSaveToRemote(false, { allowBeforeSourceLoaded: true });
  c.saveCloudNowIfPossible(["teachers"]);
  c.scheduleCloudSave(["teachers"]);
  assert.equal(requests, 0);
  assert.equal(c.state.cloudSaveTimer, null);
  assert.equal(c.state.cloudDirtyKeys.has("teachers"), true);
});

await mkdir(new URL("./results/", import.meta.url), { recursive: true });
await writeFile(new URL("./results/runtime.json", import.meta.url), JSON.stringify({ scope: "Synthetic fetch and in-memory state; no production requests", results }, null, 2) + "\n");
for (const item of results) console.log(`${item.status} ${item.id}: ${item.title}${item.evidence ? "\n  " + item.evidence : ""}`);
process.exitCode = results.some(item => item.status === "FAIL") ? 1 : 0;
