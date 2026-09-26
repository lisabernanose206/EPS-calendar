// Local diagnostic events only: never include payloads, email, tokens or URLs.
const events = [];
const codes = new Set(["render_failed", "oauth_failed", "logout_failed", "save_failed", "load_failed"]);
export function securityEvent(code) {
  if (!codes.has(code)) return;
  events.push({ at: new Date().toISOString(), code });
  if (events.length > 50) events.shift();
}
export function securityDiagnostics() { return events.map(event => ({ ...event })); }
