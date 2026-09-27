import { pageMemory } from "../services/page-memory.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { activityAllowedForBuildBlock, blockCycleUnavailableMessage, classGroupVariant, classParts, classSameBase, clearInvalidBlockActivitySelection, constructionActivityById, constructionVersionLabel, constructionVersionPartOptions, constructionVersionPartsLabel, currentBlock, normalizedOptionHours, optionBlockAvailableForTeachers, optionDurationMax, parseYearCellKey, promoteRestoredConstructionVersionToCloud, restoreConstructionVersion, saveCurrentConstructionVersion, serviceFreeActivityById, setBlockTeacherClass, setBlockTeacherClassGroup, syncPrimaryBlockClassFromTeacherClasses, teacherIdsForBlock, updateBlockClass, updateBlockTeacherClass, updateSpecialBlockClass } from "../domain/assignments.js";
import { confirmBlockDeletion, excludeAsFromSlot, excludeEventFromSlot, moveSelectedBlockTo, movingBlockGhostHtml, removeConstructionBlock, startMovingBuildBlock } from "../domain/blocks.js";
import { renderConstructionConflictSummary } from "../domain/conflict-summary.js";
import { applyAnnualConstructionBlock, updateAnnualConstructionRule, updateConstructionRuleCycleDetails } from "../domain/construction.js";
import { schoolYearWeeks, yearRows } from "../domain/dates.js";
import { activeConstructionCycle, classicConstructionCycles, constructionCycleById, cycleForWeek } from "../domain/hours.js";
import { optimizeConstructionCycleDetails } from "../domain/optimizer.js";
import { canAccessConstructionPlanning, constructionBlocksStepComplete, constructionCycleDetailsStepComplete, renderConstructionLockedWarnings, renderConstructionServiceSummary, renderConstructionStatusRow } from "../domain/readiness.js";
import { cycleLabel, displayCycleName, isCollegeEstablishment } from "../domain/settings.js";
import { blockUnavailableMessage, clearPlanningParts } from "../domain/unavailability.js";
import { allOptionCycleIds, constructionBuildLocked, constructionCycleForBlockById, constructionCycleForRuleById, normalizedOptionCycleIds, saveAcceptedConflicts, saveConstructionLocks, saveConstructionVersions, saveConstructionWorkspaceMode, specialClassBaseIdFromSchoolId } from "../services/settings-storage.js";
import { renderClassesView } from "./classes.js";
import { renderCycleDefinition } from "./cycle-settings.js";
import { renderEstablishmentSettings } from "./establishment.js";
import { renderEventsView } from "./events.js";
import { renderFacilitiesActivitiesSettings } from "./facilities-activities.js";
import { renderHoursBalance } from "./hours.js";
import { renderPrerequisitesView } from "./prerequisites.js";
import { renderAsView } from "./sport-association.js";
import { renderTeamSettings } from "./team.js";
import { renderFacilityUnavailabilityView } from "./unavailability.js";
import { renderYearPrerequisitesView } from "./year-prerequisites.js";
import { renderBuildModal, renderDeleteBlockModal } from "../ui/block-modal.js";
import { constructionCycleDisplayBlock, renderConstructionCycleTable } from "../ui/construction-table.js";
import { showValidationPopup } from "../ui/feedback.js";
import { escapeHtml } from "../ui/format.js";

export function renderConstructionView() {
  const rows = yearRows();
  const block = currentBlock();
  if (state.constructionMode === "prerequisites") {
    return renderPrerequisitesView();
  }
  if (state.constructionMode === "yearPrerequisites") {
    return renderYearPrerequisitesView();
  }
  if (state.constructionMode === "establishment") {
    return `<section>
            ${renderEstablishmentSettings()}
          </section>`;
  }
  if (state.constructionMode === "facilities" || state.constructionMode === "activities" || state.constructionMode === "facilitiesActivities") {
    return `<section>
            ${renderFacilitiesActivitiesSettings()}
          </section>`;
  }
  if (state.constructionMode === "team") {
    return `<section>
            ${renderTeamSettings()}
          </section>`;
  }
  if (state.constructionMode === "classes") {
    return `<section>
            ${renderClassesView()}
          </section>`;
  }
  if (state.constructionMode === "unavailable") {
    return `<section>
            ${renderFacilityUnavailabilityView()}
          </section>`;
  }
  if (state.constructionMode === "cycles") {
    return `<section>
            <section class="cycleDefinitionPage">
              <div class="cycleDefinitionPanel">
                ${renderCycleDefinition()}
              </div>
            </section>
          </section>`;
  }
  if (state.constructionMode === "events") {
    return `<section>
            ${renderEventsView()}
          </section>`;
  }
  if (state.constructionMode === "as") {
    return `<section>
            ${renderAsView()}
          </section>`;
  }
  if (state.constructionMode === "hours") {
    return `<section>
            ${renderHoursBalance()}
          </section>`;
  }
  if (!canAccessConstructionPlanning()) {
    return `<section class="builderPage constructionLockedPage">
            <div class="constructionWarningPanel constructionLockedNotice">
              <div class="constructionWarning blocking"><strong>Construction verrouill&eacute;e</strong><span>Compl&eacute;tez d'abord les pr&eacute;requis ci-dessous, puis revenez sur Construction.</span></div>
            </div>
            <div class="constructionWarningPanel">
              <div class="constructionWarning blocking"><strong>Construction verrouillée</strong><span>Complétez d’abord les prérequis ci-dessous, puis revenez sur Construction.</span></div>
            </div>
            ${renderConstructionLockedWarnings()}
          </section>`;
  }
  const constructionCycles = classicConstructionCycles();
  const selectedCycle = state.constructionBuildMode === "blocks" || state.constructionBuildMode === "versions" ? constructionCycles[0] : activeConstructionCycle();
  const blocksComplete = constructionBlocksStepComplete();
  const cycleDetailsComplete = constructionCycleDetailsStepComplete();
  const currentConstructionLocked = constructionBuildLocked(state.constructionBuildMode, selectedCycle?.id);
  const lockLabel = "Sous-onglet verrouill&eacute;";
  const unlockLabel = "Verrouiller ce sous-onglet";
  const constructionHelpText = state.constructionBuildMode === "blocks" ? `Blocs annuels : posez uniquement profs, classes, co-intervention et type de semaine. Les installations et activités se renseignent ensuite par ${cycleLabel(true)}.` : `Installations/activités : choisissez ${isCollegeEstablishment() ? "une période" : "un cycle"}, puis cliquez sur un bloc pour lui affecter une installation et une activité. Les choix sont enregistrés pour ${isCollegeEstablishment() ? "la période sélectionnée" : "le cycle sélectionné"}.`;
  const constructionTableContent = state.constructionBuildMode === "versions" ? renderConstructionVersionsView() : `<div class="constructionZoomWrap" style="--table-zoom:${escapeHtml(state.constructionZoom)};--table-offset:150px;zoom:${escapeHtml(state.constructionZoom)}">${renderConstructionCycleTable(selectedCycle, rows, !currentConstructionLocked)}</div>`;
  return `<section class="builderPage">
          <div class="constructionBuilderBody">
            <h2 class="prerequisitesPageTitle">Construction</h2>
            <div class="constructionTabs">
              <button class="${state.constructionBuildMode === "blocks" ? "active" : ""} ${blocksComplete ? "stepComplete" : "stepIncomplete"}" data-construction-build-mode="blocks">Blocs profs/classes<span class="subtabStatusStack"><span class="subtabLockIcon ${state.constructionLocks.blocks ? "locked" : ""}" aria-label="${state.constructionLocks.blocks ? "Verrouille" : "Deverrouillé"}">&#128274;</span><span class="stepStatus" aria-label="${blocksComplete ? "Étape complète" : "Étape incomplète"}"></span></span></button>
              <button class="${state.constructionBuildMode === "cycleDetails" ? "active" : ""} ${cycleDetailsComplete ? "stepComplete" : "stepIncomplete"}" data-construction-build-mode="cycleDetails">Installations/activités<span class="subtabStatusStack"><span class="subtabLockIcon ${Object.values(state.constructionLocks.cycleDetails || {}).some(Boolean) ? "locked" : ""}" aria-label="Verrous cycles">&#128274;</span><span class="stepStatus" aria-label="${cycleDetailsComplete ? "Étape complète" : "Étape incomplète"}"></span></span></button>
              <button class="${state.constructionBuildMode === "versions" ? "active" : ""}" data-construction-build-mode="versions">Versions</button>
            </div>
            ${state.constructionBuildMode === "cycleDetails" ? `<div class="constructionOptimizeActions">
              <button class="optimizeButton" id="openConstructionOptimizer" title="Construction optimisée désactivée temporairement : pas encore au point" disabled>Lancer la construction optimisée</button>
            </div>` : ""}
            ${state.constructionBuildMode === "cycleDetails" ? renderConstructionConflictSummary() : ""}
            ${state.constructionBuildMode === "cycleDetails" ? `<div class="cycleConstructionTabs">
              ${constructionCycles.map(cycle => `<button class="choiceButton ${selectedCycle?.id === cycle.id ? "active" : ""}" data-construction-cycle="${escapeHtml(cycle.id)}">${displayCycleName(cycle)}${state.constructionLocks.cycleDetails?.[cycle.id] ? " &#128274;" : ""}</button>`).join("")}
            </div>` : ""}
            ${state.constructionBuildMode !== "versions" ? `<div class="prerequisitesLockRow">
              <label class="lockToggle" title="Verrouiller les modifications de cette partie">
                <input type="checkbox" data-construction-lock="${escapeHtml(state.constructionBuildMode)}" data-construction-lock-cycle="${selectedCycle?.id || ""}" ${currentConstructionLocked ? "checked" : ""} />
                <span class="lockToggleTrack"></span>
                <span>${currentConstructionLocked ? lockLabel : unlockLabel}</span>
              </label>
            </div>
            ${currentConstructionLocked ? `<div class="lockNotice">Sous-onglet verrouill&eacute; : vous pouvez consulter et naviguer, mais pas modifier cette partie.</div>` : ""}` : ""}
            ${state.constructionBuildMode === "cycleDetails" && state.constructionOptimizationResult ? `<div class="constructionOptimizeNotice ${state.constructionOptimizationResult.unresolved ? "blocking" : ""}"><strong>${escapeHtml(state.constructionOptimizationResult.message)}</strong><span>${escapeHtml(state.constructionOptimizationResult.detail || "")}</span></div>` : ""}
            ${state.constructionBuildMode === "versions" ? "" : renderConstructionStatusRow(constructionHelpText)}
            ${state.constructionBuildMode === "blocks" ? renderConstructionServiceSummary() : ""}
            ${state.constructionBuildMode !== "versions" && state.clearConstructionPanelOpen ? renderClearConstructionPanel() : ""}
            ${state.constructionBuildMode !== "versions" && state.movingBuildBlock ? `<div class="constructionMoveHint"><span>Bloc sélectionné : cliquez sur la case de destination.</span><button id="cancelMoveBlock">Annuler</button></div>` : ""}
            ${state.constructionBuildMode === "blocks" ? renderConstructionConflictSummary() : ""}
            ${state.constructionBuildMode !== "versions" ? `<div class="builderActions constructionSubtabActions constructionTableActions">
              <div class="teacherColorLegend">
                ${state.teachers.map(teacher => `<span style="background:${escapeHtml(teacher.color)};border-color:${escapeHtml(teacher.border)}">${escapeHtml(teacher.name)}</span>`).join("")}
              </div>
              <div class="zoomControls">
                <button class="ghostButton" data-construction-zoom="-">-</button>
                <button class="ghostButton" data-construction-zoom-reset>${Math.round(state.constructionZoom * 100)}%</button>
                <button class="ghostButton" data-construction-zoom="+">+</button>
              </div>
              <div class="constructionExportControls">
                <button class="iconButton exportPrintButton" data-print-format="A4" title="Exporter / imprimer en A4" aria-label="Exporter / imprimer en A4">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span>Exporter/Imprimer</span>
                </button>
              </div>
              <button class="ghostButton" id="saveConstructionVersion">Sauvegarder la construction</button>
              <button class="ghostButton" id="clearConstruction">Vider la construction</button>
            </div>` : ""}
            ${constructionTableContent}
          </div>
          ${state.activeBuildCell ? renderBuildModal() : ""}
          ${state.constructionVersionPanelOpen ? renderSaveConstructionVersionModal() : ""}
          ${state.constructionOptimizeConfirmOpen ? renderConstructionOptimizeConfirmModal() : ""}
          ${state.pendingBlockDelete ? renderDeleteBlockModal() : ""}
          ${movingBlockGhostHtml()}
        </section>`;
}
export function renderConstructionOptimizeConfirmModal() {
  return `<div class="modalBackdrop" role="presentation">
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="constructionOptimizeTitle">
            <button class="modalClose" id="cancelConstructionOptimizer" aria-label="Fermer">x</button>
            <h2 id="constructionOptimizeTitle">Construction optimisée</h2>
            <p>Affecter automatiquement les installations et les activités à partir des blocs profs/classes existants ?</p>
            <p class="muted">Les blocs profs/classes et les détails installations/activités déjà saisis ne seront pas modifiés. Seuls les détails vides seront remplis selon les contraintes.</p>
            <div class="modalFooter">
              <button class="ghostButton" id="cancelConstructionOptimizerFooter">Annuler</button>
              <button class="addButton" id="confirmConstructionOptimizer">Affecter automatiquement</button>
            </div>
          </div>
        </div>`;
}
export function renderClearConstructionPanel() {
  const constructionCycles = classicConstructionCycles();
  return `<div class="modalBackdrop" role="presentation">
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="clearConstructionTitle">
            <button class="modalClose" id="cancelClearConstructionTop" aria-label="Fermer">x</button>
            <h2 id="clearConstructionTitle">Vider la construction</h2>
            <div class="alertHelp"><strong>Conserve</strong><span>Les pré-requis, règles de construction, AS, événements sportifs, services, installations et activités restent intacts.</span></div>
            <div class="clearConstructionPanel">
              <h3>Installations / activités</h3>
              <div class="clearConstructionOptions">
                <label><input type="checkbox" data-clear-option="constructionDetailsAll" /> Tous les cycles</label>
                ${constructionCycles.map(cycle => `<label><input type="checkbox" data-clear-cycle-detail="${escapeHtml(cycle.id)}" /> ${escapeHtml(displayCycleName(cycle) || cycle.id)}</label>`).join("")}
              </div>
            </div>
            <div class="clearConstructionPanel">
              <h3>Squelette</h3>
              <div class="clearConstructionOptions">
                <label><input type="checkbox" data-clear-option="construction" /> Blocs profs/classes</label>
              </div>
            </div>
            <div class="modalFooter">
              <button class="ghostButton" id="cancelClearConstruction">Annuler</button>
              <button class="ghostButton" id="confirmClearConstruction">Supprimer la selection</button>
            </div>
          </div>
        </div>`;
}
export function renderConstructionVersionsView() {
  return `<section class="eventPage">
          <div class="eventList" style="grid-column:1 / -1">
            <h3>Versions sauvegardees</h3>
            ${state.constructionVersions.length ? `<div class="compactCardGrid">${state.constructionVersions.map(version => {
    const ruleCount = Array.isArray(version.constructionRules) ? version.constructionRules.length : 0;
    const exclusionCount = version.blockExclusions && typeof version.blockExclusions === "object" ? Object.values(version.blockExclusions).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0) : 0;
    return `<article class="eventCard">
                <strong>${escapeHtml(constructionVersionLabel(version))}</strong>
                <span>${escapeHtml(constructionVersionPartsLabel(version))}</span>
                <span>${ruleCount} bloc(s) · ${exclusionCount} exclusion(s)</span>
                <span>${version.mode === "optimized" ? "Construction optimisée" : "Construction manuelle"}</span>
                <div class="constructionRuleActions">
                  <button class="ghostButton" data-restore-construction-version="${escapeHtml(version.id)}">Charger</button>
                  <button class="ghostButton" data-delete-construction-version="${escapeHtml(version.id)}">Supprimer</button>
                </div>
              </article>`;
  }).join("")}</div>` : `<div class="alertEmpty">Aucune version sauvegardee pour le moment.</div>`}
          </div>
        </section>`;
}
export function renderSaveConstructionVersionModal() {
  const options = constructionVersionPartOptions();
  const validIds = options.map(option => option.id);
  const selectedParts = state.constructionVersionDraftParts.filter((part, index) => validIds.includes(part) && state.constructionVersionDraftParts.indexOf(part) === index);
  return `<div class="modalBackdrop">
          <section class="modal">
            <div class="modalHeader">
              <div>
                <h3>Sauvegarder la construction</h3>
                <p class="muted">Creez une version reutilisable de la construction actuelle.</p>
              </div>
              <button class="modalClose" id="cancelConstructionVersionSaveTop">x</button>
            </div>
            <div class="eventField">
              <label>Nom de la version</label>
              <input id="constructionVersionName" value="${escapeHtml(state.constructionVersionDraftName)}" placeholder="Ex. Version conseil peda" />
            </div>
            <div class="eventField">
              <label>Contenu sauvegarde</label>
              <div class="constructionVersionChoices">
                ${options.map(option => `<label class="constructionVersionChoice">
                  <input type="checkbox" data-construction-version-part="${escapeHtml(option.id)}" ${selectedParts.includes(option.id) ? "checked" : ""} />
                  ${escapeHtml(option.label)}
                </label>`).join("")}
              </div>
            </div>
            <div class="modalFooter">
              <button class="ghostButton" id="cancelConstructionVersionSave">Annuler</button>
              <button class="addButton" id="confirmConstructionVersionSave" ${selectedParts.length ? "" : "disabled"}>Sauvegarder</button>
            </div>
          </section>
        </div>`;
}
export function bindConstructionEvents() {
  document.querySelectorAll("[data-warning-build-mode]").forEach(warning => {
    warning.addEventListener("click", () => {
      state.week = "build";
      state.constructionMode = warning.dataset.warningBuildMode || "planning";
      if (state.constructionMode === "prerequisites" && warning.dataset.warningSubMode) state.prerequisiteMode = warning.dataset.warningSubMode;
      if (state.constructionMode === "yearPrerequisites" && warning.dataset.warningSubMode) state.yearPrerequisiteMode = warning.dataset.warningSubMode;
      render();
    });
  });
  document.querySelectorAll("[data-print-format]").forEach(button => {
    button.addEventListener("click", () => {
      const format = button.dataset.printFormat;
      const printTrimesters = button.dataset.printTrimesters === "construction";
      const printCycleSummary = format === "A3" && Boolean(button.closest(".cycleSummaryHeader"));
      const isIOSPrint = printCycleSummary && (/iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (printTrimesters) {
        state.constructionPrintTrimesterExport = true;
        render();
      }
      setTimeout(() => {
        const existingPrintStyle = document.getElementById("printPageStyle");
        if (existingPrintStyle) existingPrintStyle.remove();
        const printStyle = document.createElement("style");
        printStyle.id = "printPageStyle";
        const printPageSize = printCycleSummary && format === "A3" ? isIOSPrint ? "A4 landscape" : "420mm 297mm" : `${format} landscape`;
        const printPageMargin = printTrimesters || printCycleSummary ? "4mm" : "6mm";
        printStyle.textContent = `@page { size: ${printPageSize}; margin: ${printPageMargin}; }`;
        document.head.appendChild(printStyle);
        document.body.classList.remove("printA3", "printA2", "printA4", "printConstructionTrimesters", "printCycleSummary");
        document.body.classList.add(`print${format}`);
        if (printTrimesters) document.body.classList.add("printConstructionTrimesters");
        if (printCycleSummary) document.body.classList.add("printCycleSummary");
        if (isIOSPrint) {
          document.body.style.setProperty("--cycle-summary-print-width", "289mm");
          document.body.style.setProperty("--cycle-summary-print-height", "202mm");
        }
        setTimeout(() => {
          if (printCycleSummary) {
            const summaryWrap = document.querySelector(".printCycleSummary .cycleSummaryTableWrap");
            const summaryTable = summaryWrap?.querySelector(".cycleTwoWeekTable");
            const availableWidth = Math.max(0, Math.min(summaryWrap?.clientWidth || 0, window.innerWidth || 0) - 12);
            const requiredWidth = summaryTable?.scrollWidth || summaryTable?.getBoundingClientRect().width || 0;
            const scale = availableWidth && requiredWidth ? Math.min(1, Math.max(0.25, availableWidth / requiredWidth)) : 1;
            document.body.style.setProperty("--cycle-summary-print-scale", String(scale));
          } else {
            document.body.style.removeProperty("--cycle-summary-print-scale");
          }
          let printCleanupDone = false;
          const cleanupPrintState = () => {
            if (printCleanupDone) return;
            printCleanupDone = true;
            window.removeEventListener("afterprint", cleanupPrintState);
            document.body.classList.remove("printA3", "printA2", "printA4", "printConstructionTrimesters", "printCycleSummary");
            document.body.style.removeProperty("--cycle-summary-print-scale");
            document.body.style.removeProperty("--cycle-summary-print-width");
            document.body.style.removeProperty("--cycle-summary-print-height");
            const style = document.getElementById("printPageStyle");
            if (style) style.remove();
            if (printTrimesters) {
              state.constructionPrintTrimesterExport = false;
              render();
            }
          };
          window.addEventListener("afterprint", cleanupPrintState, {
            once: true
          });
          window.print();
          setTimeout(cleanupPrintState, isIOSPrint ? 15000 : 1200);
        }, 50);
      }, printTrimesters ? 60 : 0);
    });
  });
  document.querySelectorAll("[data-construction-lock]").forEach(input => {
    input.addEventListener("change", () => {
      const mode = input.dataset.constructionLock;
      if (mode === "blocks") state.constructionLocks = {
        ...state.constructionLocks,
        blocks: input.checked
      };
      if (mode === "cycleDetails") {
        const cycleId = input.dataset.constructionLockCycle || state.activeConstructionCycleId;
        state.constructionLocks = {
          ...state.constructionLocks,
          cycleDetails: {
            ...(state.constructionLocks.cycleDetails || {}),
            [cycleId]: input.checked
          }
        };
      }
      saveConstructionLocks();
      showValidationPopup(input.checked ? "Partie verrouillée" : "Partie déverrouillée");
      render();
    });
  });
  document.querySelectorAll("[data-toggle-construction-rule-category]").forEach(button => {
    button.addEventListener("click", () => {
      const category = button.dataset.toggleConstructionRuleCategory;
      state.expandedConstructionRuleCategory = state.expandedConstructionRuleCategory === category ? "" : category;
      render();
    });
  });
  document.querySelectorAll("[data-construction-zoom]").forEach(button => {
    button.addEventListener("click", () => {
      const direction = button.dataset.constructionZoom;
      state.constructionZoom = Math.min(1.5, Math.max(0.15, state.constructionZoom + (direction === "+" ? 0.1 : -0.1)));
      state.constructionZoom = Math.round(state.constructionZoom * 100) / 100;
      render();
    });
  });
  document.querySelectorAll("[data-construction-zoom-reset]").forEach(button => {
    button.addEventListener("click", () => {
      state.constructionZoom = 1;
      render();
    });
  });
  document.querySelectorAll("[data-pick-teacher]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const teacherId = button.dataset.pickTeacher;
      if (state.blockTeacherIds.includes(teacherId)) {
        if (state.blockTeacherIds.length > 1) state.blockTeacherIds = state.blockTeacherIds.filter(id => id !== teacherId);
      } else {
        state.blockTeacherIds = [...state.blockTeacherIds, teacherId].slice(-2);
        if (state.blockClass && !state.blockTeacherClasses[teacherId]) state.blockTeacherClasses = {
          ...state.blockTeacherClasses,
          [teacherId]: state.blockClass
        };
      }
      state.blockTeacherClasses = Object.fromEntries(Object.entries(state.blockTeacherClasses).filter(([id]) => state.blockTeacherIds.includes(id)));
      state.blockTeacherClassLevels = Object.fromEntries(Object.entries(state.blockTeacherClassLevels).filter(([id]) => state.blockTeacherIds.includes(id)));
      syncPrimaryBlockClassFromTeacherClasses();
      clearInvalidBlockActivitySelection();
      if (state.blockIsOption && !optionBlockAvailableForTeachers()) {
        state.blockIsOption = false;
        state.blockOptionId = "";
        state.blockOptionHours = "";
        state.blockOptionCycleIds = [];
      }
      if (state.blockTeacherIds.length < 2) state.blockSecondTeacherHours = "";
      render();
    });
  });
  document.querySelectorAll("[data-pick-facility]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.blockFacilityId = button.dataset.pickFacility;
      if (state.blockActivityId && !constructionActivityById(state.blockActivityId) && !serviceFreeActivityById(state.blockActivityId)) state.blockActivityId = "";
      clearInvalidBlockActivitySelection();
      render();
    });
  });
  document.querySelectorAll("[data-clear-facility]").forEach(button => {
    button.addEventListener("click", () => {
      state.blockFacilityId = "";
      render();
    });
  });
  document.querySelectorAll("[data-toggle-co-intervention]").forEach(button => {
    button.addEventListener("click", () => {
      state.blockCoIntervention = true;
      state.blockIsOption = false;
      state.blockOptionId = "";
      state.blockOptionHours = "";
      state.blockOptionCycleIds = [];
      render();
    });
  });
  document.querySelectorAll("[data-toggle-single-intervention]").forEach(button => {
    button.addEventListener("click", () => {
      state.blockCoIntervention = false;
      state.blockIsOption = false;
      state.blockOptionId = "";
      state.blockOptionHours = "";
      state.blockOptionCycleIds = [];
      render();
    });
  });
  document.querySelectorAll("[data-toggle-option-block]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.getAttribute("aria-disabled") === "true" || !optionBlockAvailableForTeachers()) return;
      state.blockIsOption = true;
      state.blockCoIntervention = false;
      state.blockClass = "";
      state.blockClassLevel = "";
      state.blockTeacherClasses = {};
      state.blockTeacherClassLevels = {};
      state.blockActivityId = "";
      state.blockOptionCycleIds = allOptionCycleIds();
      render();
    });
  });
  document.querySelectorAll("[data-pick-activity]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.blockActivityId = state.blockActivityId === button.dataset.pickActivity ? "" : button.dataset.pickActivity;
      render();
    });
  });
  document.querySelectorAll("[data-clear-activity]").forEach(button => {
    button.addEventListener("click", () => {
      state.blockActivityId = "";
      render();
    });
  });
  document.querySelectorAll("[data-pick-option]").forEach(button => {
    button.addEventListener("click", () => {
      state.blockOptionId = state.blockOptionId === button.dataset.pickOption ? "" : button.dataset.pickOption;
      state.blockOptionHours = state.blockOptionId ? String(optionDurationMax(state.blockOptionId)) : "";
      render();
    });
  });
  document.querySelectorAll("[data-pick-option-cycle]").forEach(button => {
    button.addEventListener("click", () => {
      const cycleId = button.dataset.pickOptionCycle;
      const selected = normalizedOptionCycleIds();
      if (selected.includes(cycleId)) {
        const next = selected.filter(id => id !== cycleId);
        state.blockOptionCycleIds = next.length ? next : selected;
      } else {
        state.blockOptionCycleIds = [...selected, cycleId];
      }
      render();
    });
  });
  const blockOptionHoursInput = document.getElementById("blockOptionHours");
  if (blockOptionHoursInput) {
    blockOptionHoursInput.addEventListener("input", () => {
      state.blockOptionHours = blockOptionHoursInput.value;
    });
    blockOptionHoursInput.addEventListener("change", () => {
      state.blockOptionHours = String(normalizedOptionHours(state.blockOptionId, blockOptionHoursInput.value));
      render();
    });
  }
  document.querySelectorAll("[data-pick-class-level]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      updateBlockClass("level", button.dataset.pickClassLevel);
      clearInvalidBlockActivitySelection();
      render();
    });
  });
  document.querySelectorAll("[data-pick-class-number]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      updateBlockClass("number", button.dataset.pickClassNumber);
      clearInvalidBlockActivitySelection();
      render();
    });
  });
  document.querySelectorAll("[data-pick-class-group]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      updateBlockClass("group", button.dataset.pickClassGroup);
      clearInvalidBlockActivitySelection();
      render();
    });
  });
  document.querySelectorAll("[data-pick-special-class]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      updateSpecialBlockClass(button.dataset.pickSpecialClass);
      clearInvalidBlockActivitySelection();
      render();
    });
  });
  document.querySelectorAll("[data-pick-teacher-class-level]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      updateBlockTeacherClass(button.dataset.pickTeacherClassLevel, "level", button.dataset.classLevel);
      clearInvalidBlockActivitySelection();
      render();
    });
  });
  document.querySelectorAll("[data-pick-teacher-class]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const teacherId = button.dataset.pickTeacherClass;
      const current = state.blockTeacherClasses[teacherId] || "";
      const currentGroup = classSameBase(current, button.dataset.schoolClass) ? classParts(current).group : "whole";
      setBlockTeacherClass(teacherId, classGroupVariant(button.dataset.schoolClass, currentGroup));
      clearInvalidBlockActivitySelection();
      render();
    });
  });
  document.querySelectorAll("[data-pick-teacher-class-group]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      setBlockTeacherClassGroup(button.dataset.pickTeacherClassGroup, button.dataset.classGroup);
      clearInvalidBlockActivitySelection();
      render();
    });
  });
  document.querySelectorAll("[data-clear-teacher-class]").forEach(button => {
    button.addEventListener("click", () => {
      const teacherId = button.dataset.clearTeacherClass;
      state.blockTeacherClasses = {
        ...state.blockTeacherClasses
      };
      state.blockTeacherClassLevels = {
        ...state.blockTeacherClassLevels
      };
      delete state.blockTeacherClasses[teacherId];
      delete state.blockTeacherClassLevels[teacherId];
      syncPrimaryBlockClassFromTeacherClasses();
      clearInvalidBlockActivitySelection();
      render();
    });
  });
  document.querySelectorAll("[data-clear-class]").forEach(button => {
    button.addEventListener("click", () => {
      state.blockClass = "";
      state.blockClassLevel = "";
      clearInvalidBlockActivitySelection();
      render();
    });
  });
  const addBuiltBlock = document.getElementById("addBuiltBlock");
  if (addBuiltBlock && state.activeBuildCell) {
    addBuiltBlock.addEventListener("click", () => {
      const {
        rowId,
        weekRank
      } = parseYearCellKey(state.activeBuildCell);
      const weekItem = schoolYearWeeks().find(item => item.rank === weekRank);
      if (!state.blockTeacherIds.length) return;
      const block = currentBlock();
      const editingCycleDetails = state.constructionBuildMode === "cycleDetails" && Boolean(state.editingBuildBlock?.ruleId);
      const editingRule = editingCycleDetails ? state.constructionRules.find(rule => rule.id === state.editingBuildBlock.ruleId) : null;
      const cellCycle = state.activeBuildCycleId ? editingRule ? constructionCycleForRuleById(editingRule, state.activeBuildCycleId) : constructionCycleForBlockById(block, state.activeBuildCycleId) : cycleForWeek(weekItem, classParts(block.schoolClass).level);
      if (!cellCycle) return;
      const row = yearRows().find(item => item.id === rowId);
      if (!editingCycleDetails && blockUnavailableMessage(row, weekItem, block)) {
        render();
        return;
      }
      if (!editingCycleDetails && !state.activeBuildCycleId && state.blockWeekLetter !== "all" && state.blockWeekLetter !== weekItem.letter) {
        render();
        return;
      }
      if (blockCycleUnavailableMessage(rowId, cellCycle.id, block, state.blockWeekLetter)) {
        render();
        return;
      }
      if (!activityAllowedForBuildBlock(block)) {
        render();
        return;
      }
      if (editingCycleDetails) {
        const saved = updateConstructionRuleCycleDetails(state.editingBuildBlock.ruleId, state.activeBuildCycleId || block.cycleId || state.activeConstructionCycleId, block);
        showValidationPopup(saved ? "Installation / activité mises à jour" : "Bloc introuvable : modification non enregistrée");
      } else if (state.editingBuildBlock?.ruleId) {
        updateAnnualConstructionRule(state.editingBuildBlock.ruleId, block, state.blockWeekLetter);
        showValidationPopup("Bloc annuel modifie");
      } else {
        applyAnnualConstructionBlock(rowId, block, state.blockWeekLetter);
        showValidationPopup("Bloc annuel valide");
      }
      state.editingBuildBlock = null;
      state.activeBuildCell = null;
      state.activeBuildCycleId = null;
      state.blockWeekLetter = "all";
      state.blockSecondTeacherHours = "";
      state.blockCoIntervention = false;
      state.blockIsOption = false;
      state.blockOptionId = "";
      state.blockOptionHours = "";
      state.blockOptionCycleIds = [];
      state.blockTeacherClasses = {};
      state.blockTeacherClassLevels = {};
      render();
    });
  }
  document.querySelectorAll("#closeBuildModal, #closeBuildModalFooter").forEach(button => {
    button.addEventListener("click", () => {
      state.activeBuildCell = null;
      state.activeBuildCycleId = null;
      state.editingBuildBlock = null;
      state.blockWeekLetter = "all";
      state.blockSecondTeacherHours = "";
      state.blockCoIntervention = false;
      state.blockIsOption = false;
      state.blockOptionId = "";
      state.blockOptionHours = "";
      state.blockOptionCycleIds = [];
      state.blockTeacherClasses = {};
      state.blockTeacherClassLevels = {};
      render();
    });
  });
  document.querySelectorAll("[data-construction-cycle]").forEach(button => {
    button.addEventListener("click", () => {
      state.activeConstructionCycleId = button.dataset.constructionCycle;
      state.activeBuildCell = null;
      state.activeBuildCycleId = null;
      state.editingBuildBlock = null;
      render();
    });
  });
  document.querySelectorAll("[data-move-cell], [data-open-cell]").forEach(cell => {
    cell.addEventListener("click", event => {
      if (event.target.closest("[data-remove-cell], [data-start-move-kind]")) return;
      if (state.ignoreNextMoveCellClick) {
        state.ignoreNextMoveCellClick = false;
        return;
      }
      if (state.movingBuildBlock) {
        moveSelectedBlockTo(cell.dataset.moveCell || cell.dataset.openCell);
        state.movingBuildBlock = null;
        window.onpointermove = null;
        state.activeBuildCell = null;
        state.activeBuildCycleId = null;
        state.editingBuildBlock = null;
        state.blockCoIntervention = false;
        state.blockIsOption = false;
        state.blockOptionId = "";
        state.blockOptionHours = "";
        state.blockOptionCycleIds = [];
        state.blockTeacherClasses = {};
        state.blockTeacherClassLevels = {};
        render();
        return;
      }
      if (!cell.dataset.openCell) return;
      state.activeBuildCell = cell.dataset.openCell;
      state.activeBuildCycleId = cell.dataset.openCycleId || null;
      state.editingBuildBlock = null;
      state.blockTeacherIds = [];
      state.blockFacilityId = "";
      state.blockActivityId = "";
      state.blockClass = "";
      state.blockClassLevel = "";
      state.blockTeacherClasses = {};
      state.blockTeacherClassLevels = {};
      state.blockWeekLetter = cell.dataset.openWeekLetter || "all";
      state.blockSecondTeacherHours = "";
      state.blockCoIntervention = false;
      state.blockIsOption = false;
      state.blockOptionId = "";
      state.blockOptionHours = "";
      state.blockOptionCycleIds = [];
      render();
    });
  });
  const cancelMoveBlock = document.getElementById("cancelMoveBlock");
  if (cancelMoveBlock) {
    cancelMoveBlock.addEventListener("click", () => {
      state.movingBuildBlock = null;
      state.ignoreNextMoveCellClick = false;
      window.onpointermove = null;
      render();
    });
  }
  if (state.movingBuildBlock) {
    window.onpointermove = event => {
      state.movingBuildBlock = {
        ...state.movingBuildBlock,
        x: event.clientX,
        y: event.clientY
      };
      const ghost = document.getElementById("movingBlockGhost");
      if (ghost) {
        ghost.style.left = `${event.clientX}px`;
        ghost.style.top = `${event.clientY}px`;
      }
    };
  } else {
    window.onpointermove = null;
  }
  window.onkeydown = event => {
    if (event.key !== "Escape" || !state.movingBuildBlock) return;
    state.movingBuildBlock = null;
    state.ignoreNextMoveCellClick = false;
    window.onpointermove = null;
    render();
  };
  document.querySelectorAll("[data-edit-built-block]").forEach(block => {
    block.addEventListener("dblclick", event => {
      event.stopPropagation();
      const index = Number(block.dataset.editBuiltBlock);
      const item = state.constructionPlan[state.activeBuildCell]?.[index];
      if (!item) return;
      state.activeBuildCycleId = item.cycleId || state.activeBuildCycleId;
      state.blockTeacherIds = teacherIdsForBlock(item);
      state.blockFacilityId = item.facilityId;
      state.blockActivityId = item.activityId || "";
      state.blockClass = item.schoolClass;
      state.blockClassLevel = classParts(item.schoolClass).level;
      state.blockTeacherClasses = item.teacherClasses && typeof item.teacherClasses === "object" ? Object.fromEntries(state.blockTeacherIds.map(teacherId => [teacherId, item.teacherClasses[teacherId] || item.schoolClass || ""]).filter(([, schoolClass]) => schoolClass)) : Object.fromEntries(state.blockTeacherIds.map(teacherId => [teacherId, item.schoolClass || ""]).filter(([, schoolClass]) => schoolClass));
      state.blockTeacherClassLevels = Object.fromEntries(Object.entries(state.blockTeacherClasses).map(([teacherId, schoolClass]) => {
        const baseClassId = specialClassBaseIdFromSchoolId(schoolClass);
        return [teacherId, classParts(baseClassId || schoolClass).level];
      }));
      state.blockWeekLetter = item.weekLetter || "all";
      state.blockSecondTeacherHours = "";
      state.blockCoIntervention = Boolean(item.coIntervention);
      state.blockIsOption = Boolean(item.optionBlock);
      state.blockOptionId = item.optionId || "";
      state.blockOptionHours = item.optionHours ? String(item.optionHours) : "";
      state.blockOptionCycleIds = item.optionBlock ? normalizedOptionCycleIds(item.optionCycleIds) : [];
      state.editingBuildBlock = {
        index,
        ruleId: item.ruleId
      };
      render();
    });
  });
  document.querySelectorAll("[data-edit-cycle-details]").forEach(block => {
    block.addEventListener("click", event => {
      event.stopPropagation();
      const key = block.dataset.blockKey;
      const index = Number(block.dataset.editCycleDetails);
      const cycleId = block.dataset.cycleId || state.activeConstructionCycleId;
      const rule = block.dataset.ruleId ? state.constructionRules.find(entry => entry.id === block.dataset.ruleId) : null;
      const cycle = rule ? constructionCycleForRuleById(rule, cycleId) : constructionCycleById(cycleId) || activeConstructionCycle();
      const item = rule && cycle ? constructionCycleDisplayBlock({
        ...(state.constructionPlan[key]?.[index] || {}),
        ruleId: rule.id
      }, cycle) : state.constructionPlan[key]?.[index];
      if (!item) return;
      state.activeBuildCell = key;
      state.activeBuildCycleId = cycle?.id || cycleId || item.cycleId || state.activeConstructionCycleId;
      state.blockTeacherIds = teacherIdsForBlock(item);
      state.blockFacilityId = item.facilityId || "";
      state.blockActivityId = item.activityId || "";
      state.blockClass = item.schoolClass || "";
      state.blockClassLevel = classParts(item.schoolClass || "").level;
      state.blockTeacherClasses = item.teacherClasses && typeof item.teacherClasses === "object" ? Object.fromEntries(state.blockTeacherIds.map(teacherId => [teacherId, item.teacherClasses[teacherId] || item.schoolClass || ""]).filter(([, schoolClass]) => schoolClass)) : Object.fromEntries(state.blockTeacherIds.map(teacherId => [teacherId, item.schoolClass || ""]).filter(([, schoolClass]) => schoolClass));
      state.blockTeacherClassLevels = Object.fromEntries(Object.entries(state.blockTeacherClasses).map(([teacherId, schoolClass]) => {
        const baseClassId = specialClassBaseIdFromSchoolId(schoolClass);
        return [teacherId, classParts(baseClassId || schoolClass).level];
      }));
      state.blockWeekLetter = item.weekLetter || "all";
      state.blockSecondTeacherHours = "";
      state.blockCoIntervention = Boolean(item.coIntervention);
      state.blockIsOption = Boolean(item.optionBlock);
      state.blockOptionId = item.optionId || "";
      state.blockOptionHours = item.optionHours ? String(item.optionHours) : "";
      state.blockOptionCycleIds = item.optionBlock ? normalizedOptionCycleIds(item.optionCycleIds) : [];
      state.editingBuildBlock = {
        index,
        ruleId: item.ruleId
      };
      render();
    });
  });
  document.querySelectorAll("[data-start-move-kind]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      startMovingBuildBlock({
        type: button.dataset.startMoveKind,
        key: button.dataset.blockKey,
        index: Number(button.dataset.moveIndex),
        id: button.dataset.moveId
      }, event.clientX, event.clientY);
    });
  });
  document.querySelectorAll("[data-remove-cell]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const key = button.dataset.removeCell;
      const index = Number(button.dataset.removeIndex);
      removeConstructionBlock(key, index);
      render();
    });
  });
  const clearConstruction = document.getElementById("clearConstruction");
  if (clearConstruction) {
    clearConstruction.addEventListener("click", () => {
      state.clearConstructionPanelOpen = !state.clearConstructionPanelOpen;
      render();
    });
  }
  ["cancelClearConstruction", "cancelClearConstructionTop"].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.addEventListener("click", () => {
      state.clearConstructionPanelOpen = false;
      render();
    });
  });
  const confirmClearConstruction = document.getElementById("confirmClearConstruction");
  if (confirmClearConstruction) {
    confirmClearConstruction.addEventListener("click", () => {
      const clearAllDetails = Boolean(document.querySelector("[data-clear-option='constructionDetailsAll']")?.checked);
      const selectedDetailCycleIds = [...document.querySelectorAll("[data-clear-cycle-detail]:checked")].map(input => input.dataset.clearCycleDetail);
      const options = {
        constructionDetails: clearAllDetails || selectedDetailCycleIds.length > 0,
        constructionDetailCycleIds: clearAllDetails ? null : selectedDetailCycleIds,
        construction: Boolean(document.querySelector("[data-clear-option='construction']")?.checked)
      };
      if (!options.constructionDetails && !options.construction) return;
      const onlyDetails = options.constructionDetails && !options.construction;
      const detailScope = clearAllDetails ? isCollegeEstablishment() ? "toutes les périodes" : "tous les cycles" : selectedDetailCycleIds.map(cycleId => displayCycleName(classicConstructionCycles().find(cycle => cycle.id === cycleId)) || cycleId).join(", ");
      const firstConfirm = window.confirm(onlyDetails ? `Supprimer uniquement les installations/activités (${detailScope}) ?\n\nLes blocs profs/classes seront conservés.` : "Supprimer les éléments sélectionnés de la construction ?\n\nLes pré-requis, règles, AS et événements sportifs seront conservés.");
      if (!firstConfirm) return;
      const typedConfirm = window.prompt("Deuxieme validation : tapez VIDER pour confirmer.");
      if (typedConfirm !== "VIDER") return;
      clearPlanningParts(options);
      showValidationPopup(onlyDetails ? "Installations / activités vidées, squelette conservé" : "Construction vidée, pré-requis conservés");
      render();
    });
  }
  const openConstructionOptimizer = document.getElementById("openConstructionOptimizer");
  if (openConstructionOptimizer) {
    openConstructionOptimizer.addEventListener("click", () => {
      if (openConstructionOptimizer.disabled) return;
      state.constructionOptimizeConfirmOpen = true;
      render();
    });
  }
  const closeConstructionOptimizer = () => {
    state.constructionOptimizeConfirmOpen = false;
    render();
  };
  ["cancelConstructionOptimizer", "cancelConstructionOptimizerFooter"].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.addEventListener("click", closeConstructionOptimizer);
  });
  const confirmConstructionOptimizer = document.getElementById("confirmConstructionOptimizer");
  if (confirmConstructionOptimizer) {
    confirmConstructionOptimizer.addEventListener("click", () => {
      state.constructionOptimizeConfirmOpen = false;
      state.constructionWorkspaceMode = "optimized";
      state.constructionBuildMode = "cycleDetails";
      const result = optimizeConstructionCycleDetails();
      saveConstructionWorkspaceMode();
      showValidationPopup(result.message);
      render();
    });
  }
  document.querySelectorAll("[data-construction-build-mode]").forEach(button => {
    button.addEventListener("click", () => {
      state.constructionBuildMode = ["cycleDetails", "versions"].includes(button.dataset.constructionBuildMode) ? button.dataset.constructionBuildMode : "blocks";
      state.constructionHelpOpen = false;
      state.activeBuildCell = null;
      state.activeBuildCycleId = null;
      state.editingBuildBlock = null;
      state.movingBuildBlock = null;
      render();
    });
  });
  document.querySelectorAll("[data-toggle-construction-help]").forEach(button => {
    button.addEventListener("click", () => {
      state.constructionHelpOpen = !state.constructionHelpOpen;
      render();
    });
  });
  document.querySelectorAll("[data-toggle-construction-service-summary]").forEach(button => {
    button.addEventListener("click", () => {
      state.constructionServiceSummaryHidden = !state.constructionServiceSummaryHidden;
      pageMemory.setItem("planningEpsConstructionServiceSummaryHidden2026", state.constructionServiceSummaryHidden ? "true" : "false");
      render();
    });
  });
  document.querySelectorAll("[data-toggle-construction-conflicts]").forEach(button => {
    button.addEventListener("click", () => {
      state.constructionConflictsHidden = !state.constructionConflictsHidden;
      pageMemory.setItem("planningEpsConstructionConflictsHidden2026", state.constructionConflictsHidden ? "true" : "false");
      render();
    });
  });
  const saveConstructionVersionButton = document.getElementById("saveConstructionVersion");
  if (saveConstructionVersionButton) {
    saveConstructionVersionButton.addEventListener("click", () => {
      state.constructionVersionDraftName = `Version ${state.constructionVersions.length + 1}`;
      state.constructionVersionDraftParts = constructionVersionPartOptions().map(item => item.id);
      state.constructionVersionPanelOpen = true;
      render();
    });
  }
  const constructionVersionName = document.getElementById("constructionVersionName");
  if (constructionVersionName) {
    constructionVersionName.addEventListener("input", () => {
      state.constructionVersionDraftName = constructionVersionName.value;
    });
  }
  document.querySelectorAll("[data-construction-version-part]").forEach(input => {
    input.addEventListener("change", () => {
      const part = input.dataset.constructionVersionPart;
      state.constructionVersionDraftParts = input.checked ? [...state.constructionVersionDraftParts, part].filter((item, index, list) => list.indexOf(item) === index) : state.constructionVersionDraftParts.filter(item => item !== part);
      render();
    });
  });
  document.querySelectorAll("#cancelConstructionVersionSave, #cancelConstructionVersionSaveTop").forEach(button => {
    button.addEventListener("click", () => {
      state.constructionVersionPanelOpen = false;
      render();
    });
  });
  const confirmConstructionVersionSave = document.getElementById("confirmConstructionVersionSave");
  if (confirmConstructionVersionSave) {
    confirmConstructionVersionSave.addEventListener("click", () => {
      const options = constructionVersionPartOptions().map(item => item.id);
      const selectedParts = state.constructionVersionDraftParts.filter((part, index) => options.includes(part) && state.constructionVersionDraftParts.indexOf(part) === index);
      if (!selectedParts.length) return;
      saveCurrentConstructionVersion(state.constructionVersionDraftName, selectedParts);
      state.constructionVersionPanelOpen = false;
      showValidationPopup("Version de construction sauvegardee");
      state.constructionBuildMode = "versions";
      render();
    });
  }
  document.querySelectorAll("[data-restore-construction-version]").forEach(button => {
    button.addEventListener("click", () => {
      if (!window.confirm("Charger cette version dans la construction actuelle ?")) return;
      if (restoreConstructionVersion(button.dataset.restoreConstructionVersion)) {
        promoteRestoredConstructionVersionToCloud();
        showValidationPopup("Version récupérée et définie comme source Supabase");
      }
      state.constructionBuildMode = "blocks";
      render();
    });
  });
  document.querySelectorAll("[data-delete-construction-version]").forEach(button => {
    button.addEventListener("click", () => {
      const version = state.constructionVersions.find(item => item.id === button.dataset.deleteConstructionVersion);
      if (!version || !window.confirm(`Supprimer la version ${constructionVersionLabel(version)} ?`)) return;
      state.constructionVersions = state.constructionVersions.filter(item => item.id !== version.id);
      saveConstructionVersions();
      showValidationPopup("Version supprimee");
      render();
    });
  });
  document.querySelectorAll("[data-pick-week-letter]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.blockWeekLetter = button.dataset.pickWeekLetter;
      render();
    });
  });
  document.querySelectorAll("[data-delete-cell-event]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      excludeEventFromSlot(button.dataset.deleteCellEvent, button.dataset.deleteCellKey);
    });
  });
  document.querySelectorAll("[data-delete-cell-as]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      excludeAsFromSlot(button.dataset.deleteCellAs, button.dataset.deleteCellKey);
    });
  });
  document.querySelectorAll("[data-accept-conflict]").forEach(button => {
    button.addEventListener("click", () => {
      const key = decodeURIComponent(button.dataset.acceptConflict || "");
      if (!key) return;
      if (!state.acceptedConflicts.some(item => item.key === key)) {
        state.acceptedConflicts = [...state.acceptedConflicts, {
          key,
          title: decodeURIComponent(button.dataset.conflictTitle || ""),
          label: decodeURIComponent(button.dataset.conflictLabel || ""),
          detail: decodeURIComponent(button.dataset.conflictDetail || ""),
          acceptedAt: new Date().toISOString()
        }];
      }
      saveAcceptedConflicts();
      showValidationPopup("Exception de conflit validée");
      render();
    });
  });
  document.querySelectorAll("[data-revoke-conflict]").forEach(button => {
    button.addEventListener("click", () => {
      const key = decodeURIComponent(button.dataset.revokeConflict || "");
      state.acceptedConflicts = state.acceptedConflicts.filter(item => item.key !== key);
      saveAcceptedConflicts();
      showValidationPopup("Exception de conflit annulée");
      render();
    });
  });
  const deleteSelectedSlot = document.getElementById("deleteSelectedSlot");
  if (deleteSelectedSlot) {
    deleteSelectedSlot.addEventListener("click", () => {
      confirmBlockDeletion("slot");
      render();
    });
  }
  document.querySelectorAll("#cancelBlockDelete, #cancelBlockDeleteTop").forEach(button => {
    button.addEventListener("click", () => {
      state.pendingBlockDelete = null;
      render();
    });
  });
}
