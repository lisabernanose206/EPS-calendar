import { safeHtml } from "../security/html.js";
import { securityEvent } from "../security/log.js";
import { renderErrorState } from "../ui/error-state.js";
let dialog;
let recovery;
export function showAppFailure(startup = false) {
  securityEvent("render_failed");
  if (dialog?.open) return;
  dialog = document.createElement("dialog");
  dialog.className = "lousticErrorDialog";
  dialog.setAttribute("aria-labelledby", "loustic-failure-title");
  dialog.innerHTML = safeHtml(renderErrorState(startup ? "startup" : "unexpected", { headingId: "loustic-failure-title" }));
  const current = dialog;
  dialog.addEventListener("close", () => { current.remove(); if (dialog === current) dialog = null; }, { once: true });
  dialog.querySelector("[data-error-retry]")?.addEventListener("click", () => { dialog.close(); recovery?.retry(); });
  dialog.querySelector("[data-error-home]")?.addEventListener("click", () => { dialog.close(); recovery?.home(); });
  dialog.querySelector("[data-error-reload]")?.addEventListener("click", () => {
    if (window.confirm("Recharger l’application ? Les modifications non confirmées par Supabase peuvent être perdues.")) window.location.reload();
  });
  document.body.append(dialog);
  dialog.showModal();
}
export function installErrorBoundary(callbacks) {
  if (recovery) return;
  recovery = callbacks;
  window.addEventListener("error", event => { if (event instanceof ErrorEvent) showAppFailure(); });
  window.addEventListener("unhandledrejection", () => showAppFailure());
}
