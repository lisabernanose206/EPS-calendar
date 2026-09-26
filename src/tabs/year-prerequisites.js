import { escapeHtml } from "../ui/format.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { saveYearPrerequisiteLocks, yearPrerequisiteLocked } from "../services/cloud.js";
import { renderCycleDefinition } from "./cycle-settings.js";
import { renderEventsView } from "./events.js";
import { renderHoursBalance } from "./hours.js";
import { renderPrerequisiteTabs } from "./prerequisites.js";
import { renderAsView } from "./sport-association.js";
import { renderFacilityUnavailabilityView } from "./unavailability.js";
import { showValidationPopup } from "../ui/feedback.js";

export function renderYearPrerequisitesView() {
  const tabs = [{
    id: "unavailable",
    label: "Indisponibilités"
  }, {
    id: "cycles",
    label: "Cycles"
  }, {
    id: "as",
    label: "AS"
  }, {
    id: "events",
    label: "Événements sportifs"
  }, {
    id: "hours",
    label: "Service"
  }];
  const content = state.yearPrerequisiteMode === "cycles" ? `<section>
            <section class="cycleDefinitionPage">
              <div class="cycleDefinitionPanel">
                ${renderCycleDefinition()}
              </div>
            </section>
          </section>` : state.yearPrerequisiteMode === "as" ? renderAsView() : state.yearPrerequisiteMode === "events" ? renderEventsView() : state.yearPrerequisiteMode === "hours" ? renderHoursBalance() : renderFacilityUnavailabilityView();
  return `<section class="prerequisitesPage">
          <h2 class="prerequisitesPageTitle">Pré-requis année scolaire</h2>
          ${renderPrerequisiteTabs(tabs, state.yearPrerequisiteMode, "data-year-prerequisite-mode", yearPrerequisiteLocked)}
          <div class="prerequisitesLockRow">
            <label class="lockToggle" title="Verrouiller les modifications de ce sous-onglet">
              <input type="checkbox" data-year-prerequisites-lock="${escapeHtml(state.yearPrerequisiteMode)}" ${yearPrerequisiteLocked(state.yearPrerequisiteMode) ? "checked" : ""} />
              <span class="lockToggleTrack"></span>
              <span>${yearPrerequisiteLocked(state.yearPrerequisiteMode) ? "Sous-onglet verrouill&eacute;" : "Verrouiller ce sous-onglet"}</span>
            </label>
          </div>
          ${yearPrerequisiteLocked(state.yearPrerequisiteMode) ? `<div class="lockNotice">Sous-onglet verrouill&eacute; : vous pouvez consulter et naviguer, mais pas modifier cette partie.</div>` : ""}
          <div class="prerequisiteLockedBody ${yearPrerequisiteLocked(state.yearPrerequisiteMode) ? "locked" : ""}">
            ${content}
          </div>
        </section>`;
}
export function bindYearPrerequisitesEvents() {
  document.querySelectorAll("[data-year-prerequisite-mode]").forEach(button => {
    button.addEventListener("click", () => {
      state.yearPrerequisiteMode = button.dataset.yearPrerequisiteMode;
      render();
    });
  });
  document.querySelectorAll("[data-year-prerequisites-lock]").forEach(input => {
    input.addEventListener("change", () => {
      const mode = input.dataset.yearPrerequisitesLock || state.yearPrerequisiteMode;
      state.yearPrerequisiteLocks = {
        ...state.yearPrerequisiteLocks,
        [mode]: input.checked
      };
      saveYearPrerequisiteLocks();
      showValidationPopup(input.checked ? "Sous-onglet verrouillé" : "Sous-onglet déverrouillé");
      render();
    });
  });
}
