import { renderErrorState } from "./error-state.js";
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
  return state.validationPopupMessage ? `<div class="validationPopup ${state.validationPopupType === "error" ? "error" : ""}">${state.validationPopupType === "error" ? '<img class="lousticErrorMini" src="./assets/icon_app_small.png" alt="">' : ""}${escapeHtml(state.validationPopupMessage)}</div>` : "";
}
export function renderAppError() {
  return renderErrorState("unexpected");
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
