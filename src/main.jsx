import standaloneHtml from "../standalone.html?raw";
import bugFixLog from "../BUG_FIX_LOG.md?raw";

function extractFirst(pattern, source, fallback = "") {
  return source.match(pattern)?.[1] ?? fallback;
}

const title = extractFirst(/<title>([\s\S]*?)<\/title>/i, standaloneHtml, "Emploi du temps EPS");
const styles = extractFirst(/<style>([\s\S]*?)<\/style>/i, standaloneHtml);
const script = extractFirst(/<script>([\s\S]*?)<\/script>/i, standaloneHtml);
const body = extractFirst(/<body[^>]*>([\s\S]*?)<\/body>/i, standaloneHtml)
  .replace(/<script>[\s\S]*?<\/script>/i, "");

document.title = title;
document.body.innerHTML = body;

const previousStyle = document.getElementById("standalone-style");
if (previousStyle) previousStyle.remove();

const styleElement = document.createElement("style");
styleElement.id = "standalone-style";
styleElement.textContent = styles;
document.head.appendChild(styleElement);

window.__EPS_CLOUD_CONFIG__ = {
  url: import.meta.env.VITE_SUPABASE_URL || "https://kgmhuwuiswabbmeyqibp.supabase.co",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_dJcG78XPNikpRqKGDB_0tw_ZZO7QAgj",
  planningId: import.meta.env.VITE_SUPABASE_PLANNING_ID || "planning-eps-2026-2027",
  enabled: true,
  autoSave: true,
  autoLoad: false
};

window.__EPS_BUG_FIX_LOG__ = bugFixLog;
new Function(script)();
