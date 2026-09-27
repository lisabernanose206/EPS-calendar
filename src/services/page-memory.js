// Page-scoped working values only. Never persisted to browser storage.
// Supabase is the only durable source; reloads always start with an empty map.
const values = new Map();
export const pageMemory = Object.freeze({
  getItem(key) { return values.get(String(key)) ?? null; },
  setItem(key, value) { values.set(String(key), String(value)); },
  removeItem(key) { values.delete(String(key)); },
  clear() { values.clear(); }
});

export function purgeLegacyBrowserData() {
  // One-way cleanup only: never read or migrate legacy planning/session values.
  for (const kind of ["localStorage", "sessionStorage"]) {
    try {
      const storage = window[kind];
      const preserved = kind === "sessionStorage" ? new Set(["planningEpsAdminSession2026", "planningEpsOAuthPKCE", "planningEpsLogoutWarning"]) : new Set();
      for (const key of Object.keys(storage)) {
        if (key.startsWith("planningEps") && !preserved.has(key)) storage.removeItem(key);
      }
    } catch { /* Storage may be unavailable; it is never a business data source. */ }
  }
}
