import { escapeHtml } from "../ui/format.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { adminStepComplete } from "../domain/readiness.js";
import { prerequisiteLocked, savePrerequisiteLocks } from "../services/cloud.js";
import { renderClassesView } from "./classes.js";
import { renderEstablishmentSettings } from "./establishment.js";
import { renderFacilitiesActivitiesSettings } from "./facilities-activities.js";
import { renderActivityProgramSettings } from "./program.js";
import { renderTeamSettings } from "./team.js";
import { showValidationPopup } from "../ui/feedback.js";

export function renderPrerequisiteTabs(items, active, datasetName, lockState = () => false) {
  return `<div class="constructionTabs">
          ${items.map(item => {
    const complete = adminStepComplete(item.id);
    const locked = lockState(item.id);
    return `<button class="${active === item.id ? "active" : ""} ${complete ? "stepComplete" : "stepIncomplete"}" ${datasetName}="${escapeHtml(item.id)}">${escapeHtml(item.label)}<span class="subtabStatusStack"><span class="subtabLockIcon ${locked ? "locked" : ""}" aria-label="${locked ? "Verrouille" : "Deverrouillé"}">&#128274;</span><span class="stepStatus" aria-label="${complete ? "Étape complète" : "Étape incomplète"}"></span></span></button>`;
  }).join("")}
        </div>`;
}
export function renderPrerequisitesView() {
  const tabs = [{
    id: "establishment",
    label: "Établissement"
  }, {
    id: "team",
    label: "Profs"
  }, {
    id: "classes",
    label: "Classes"
  }, {
    id: "facilitiesActivities",
    label: "Installations & activités"
  }, {
    id: "program",
    label: "Programme"
  }];
  const content = state.prerequisiteMode === "team" ? renderTeamSettings() : state.prerequisiteMode === "classes" ? renderClassesView() : state.prerequisiteMode === "facilitiesActivities" || state.prerequisiteMode === "facilities" || state.prerequisiteMode === "activities" ? renderFacilitiesActivitiesSettings() : state.prerequisiteMode === "program" ? renderActivityProgramSettings() : renderEstablishmentSettings();
  const currentLocked = prerequisiteLocked(state.prerequisiteMode);
  return `<section class="prerequisitesPage">
          <div class="prerequisitesHeader">
            <h2 class="prerequisitesPageTitle">Pré-requis établissement</h2>
          </div>
          ${renderPrerequisiteTabs(tabs, state.prerequisiteMode, "data-prerequisite-mode", prerequisiteLocked)}
          <div class="prerequisitesLockRow">
            <label class="lockToggle" title="Verrouiller les modifications de ce sous-onglet">
              <input type="checkbox" data-prerequisites-lock="${escapeHtml(state.prerequisiteMode)}" ${currentLocked ? "checked" : ""} />
              <span class="lockToggleTrack"></span>
              <span>${currentLocked ? "Sous-onglet verrouill&eacute;" : "Verrouiller ce sous-onglet"}</span>
            </label>
          </div>
          ${currentLocked ? `<div class="lockNotice">Sous-onglet verrouill&eacute; : vous pouvez consulter et naviguer, mais pas modifier cette partie.</div>` : ""}
          <div class="prerequisiteLockedBody ${currentLocked ? "locked" : ""}">
            ${content}
          </div>
        </section>`;
}
export function bindPrerequisitesEvents() {
  document.querySelectorAll("[data-prerequisite-mode]").forEach(button => {
    button.addEventListener("click", () => {
      state.prerequisiteMode = button.dataset.prerequisiteMode;
      render();
    });
  });
  document.querySelectorAll("[data-prerequisites-lock]").forEach(input => {
    input.addEventListener("change", () => {
      const mode = input.dataset.prerequisitesLock || state.prerequisiteMode;
      state.prerequisiteLocks = {
        ...state.prerequisiteLocks,
        [mode]: input.checked
      };
      savePrerequisiteLocks();
      showValidationPopup(input.checked ? "Sous-onglet verrouillé" : "Sous-onglet déverrouillé");
      render();
    });
  });
}
