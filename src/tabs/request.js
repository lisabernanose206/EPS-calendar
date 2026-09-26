import { escapeHtml } from "../ui/format.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { cloudFetchWithAuthRetry, cloudReady, cloudWriteAllowed, cloudWriteBlockedMessage, feedbackEndpoint } from "../services/cloud.js";

export async function submitFeedback() {
  if (!state.requestMessage.trim() || state.requestSubmitting) return;
  if (state.requestMessage.length > 5000 || state.requestAuthor.length > 200 || !["bug", "improvement"].includes(state.requestKind)) {
    state.requestStatus = "Message limité à 5 000 caractères et nom à 200 caractères.";
    render();
    return;
  }
  state.requestSubmitting = true;
  state.requestStatus = "Envoi en cours...";
  render();
  try {
    if (!cloudReady()) throw new Error("cloud non configuré");
    if (!cloudWriteAllowed()) throw new Error(cloudWriteBlockedMessage());
    const payload = {
      etab_id: state.cloudConfig.etabId,
      planning_id: state.cloudConfig.planningId,
      kind: state.requestKind,
      author: state.requestAuthor.trim() || null,
      message: state.requestMessage.trim(),
      context: {
        page: state.week,
        schoolYear: state.schoolYear.label,

        sentAt: new Date().toISOString()
      },
      status: "new"
    };
    const response = await cloudFetchWithAuthRetry(feedbackEndpoint(), {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await response.text());
    state.requestMessage = "";
    state.requestStatus = "Votre requête a bien été envoyée. Merci pour votre retour.";
  } catch (error) {
    state.requestStatus = `Envoi impossible : ${error.message || "erreur inconnue"}`;
  } finally {
    state.requestSubmitting = false;
    render();
  }
}
export function renderRequestView() {
  const canSend = state.requestMessage.trim().length > 0 && !state.requestSubmitting;
  const requestStatusClass = state.requestSubmitting ? "pending" : state.requestStatus.startsWith("Votre requête") ? "success" : "error";
  return `<section class="requestPage">
          <div class="requestPanel">
            <h2>Une question ?</h2>
            <p class="muted">Signalez un bug vu dans l'outil ou proposez une amelioration.</p>
            <div class="eventField">
              <label>Type</label>
              <div class="choiceGrid">
                <button class="choiceButton ${state.requestKind === "bug" ? "active" : ""}" data-request-kind="bug">Bug</button>
                <button class="choiceButton ${state.requestKind === "improvement" ? "active" : ""}" data-request-kind="improvement">Amélioration</button>
              </div>
            </div>
            <div class="requestField">
              <label>Votre nom ou email</label>
              <input id="requestAuthor" value="${escapeHtml(state.requestAuthor)}" placeholder="Facultatif" />
            </div>
            <div class="requestField">
              <label>Message</label>
              <textarea id="requestMessage" placeholder="Décrivez le bug, ce que vous vouliez faire, ou l'amélioration souhaitée.">${escapeHtml(state.requestMessage)}</textarea>
            </div>
            <div class="modalFooter">
              <button class="ghostButton primaryWeekButton" id="sendFeedback" ${canSend ? "" : "disabled"}>${state.requestSubmitting ? "Envoi..." : "Envoyer la requête"}</button>
            </div>
            ${state.requestStatus ? `<div class="requestStatus ${requestStatusClass}">${escapeHtml(state.requestStatus)}</div>` : ""}
          </div>
        </section>`;
}
export function bindRequestEvents() {
  document.querySelectorAll("[data-request-kind]").forEach(button => {
    button.addEventListener("click", () => {
      state.requestKind = button.dataset.requestKind;
      render();
    });
  });
  const requestMessageInput = document.getElementById("requestMessage");
  if (requestMessageInput) requestMessageInput.addEventListener("input", () => state.requestMessage = requestMessageInput.value);
  const sendFeedback = document.getElementById("sendFeedback");
  if (sendFeedback) sendFeedback.addEventListener("click", submitFeedback);
}
