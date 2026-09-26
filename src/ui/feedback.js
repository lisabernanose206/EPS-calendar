import { escapeHtml } from "./format.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { prerequisiteLocked, yearPrerequisiteLocked } from "../services/cloud.js";

export function showValidationPopup(message, type = "success") {
  state.validationPopupMessage = message;
  state.validationPopupType = type === "error" ? "error" : "success";
  clearTimeout(state.validationPopupTimer);
  state.validationPopupTimer = setTimeout(() => {
    state.validationPopupMessage = "";
    state.validationPopupType = "success";
    render();
  }, state.validationPopupType === "error" ? 5200 : 2400);
}
export function renderValidationPopup() {
  return state.validationPopupMessage ? `<div class="validationPopup ${state.validationPopupType === "error" ? "error" : ""}">${escapeHtml(state.validationPopupMessage)}</div>` : "";
}
export function renderAppError(error) {
  const message = String(error?.message || error || "Erreur inconnue").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
          <section class="panel">
            <h2>Affichage interrompu</h2>
            <p class="muted">Une erreur bloque le chargement de cet onglet. Rechargez la page, ou envoyez une requête avec le message ci-dessous si le problème revient.</p>
            <div class="warningItem">${message}</div>
          </section>`;
}
export function applyPrerequisitesLockState() {
  const locked = state.week === "build" && (state.constructionMode === "prerequisites" && prerequisiteLocked(state.prerequisiteMode) || state.constructionMode === "yearPrerequisites" && yearPrerequisiteLocked(state.yearPrerequisiteMode));
  if (!locked) return;
  const body = document.querySelector(".prerequisiteLockedBody");
  if (!body) return;
  body.querySelectorAll("input, select, textarea, button").forEach(control => {
    control.disabled = true;
  });
}
