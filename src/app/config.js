// Only public browser configuration belongs here. Supabase enforces access via RLS/RPC.
export function configureWebRuntime(env) {
  window.__EPS_CLOUD_CONFIG__ = {
    url: env.VITE_SUPABASE_URL || "https://kgmhuwuiswabbmeyqibp.supabase.co",
    anonKey: env.VITE_SUPABASE_ANON_KEY || "sb_publishable_dJcG78XPNikpRqKGDB_0tw_ZZO7QAgj",
    etabId: env.VITE_SUPABASE_ETAB_ID || "",
    planningId: env.VITE_SUPABASE_PLANNING_ID || "planning-eps-2026-2027",
    enabled: true,
    autoSave: true,
    autoLoad: false
  };
  window.__EPS_BUG_FIX_LOG__ = "";
}
