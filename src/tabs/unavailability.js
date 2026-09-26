import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { classParts, schoolClassLabel, toggleUnavailableClass, toggleUnavailableGridCell, toggleUnavailableTeacher, unavailableCellSelected } from "../domain/assignments.js";
import { teacherNamesFromIds } from "../domain/events.js";
import { cycleLabel, displayCycleName, isCollegeEstablishment } from "../domain/settings.js";
import { renderUnavailableGroup, resetFacilityUnavailableForm, unavailableDateRange, unavailableSelectedCycles } from "../domain/unavailability.js";
import { classNumbersForLevel, rebuildConstructionPlan, saveFacilityUnavailability } from "../services/settings-storage.js";
import { renderDateRangePicker } from "../ui/date-picker.js";
import { showValidationPopup } from "../ui/feedback.js";
import { classSelectionButtonClass, classSelectionButtonLabel } from "../ui/format.js";

export function renderFacilityUnavailabilityView() {
  const hasUnavailableTime = state.unavailableCells.length;
  const cyclesAvailable = state.cycles.length > 0;
  const selectedCycles = unavailableSelectedCycles();
  const period = unavailableDateRange();
  const hasPeriod = state.unavailablePeriodMode === "cycles" ? cyclesAvailable && state.unavailableCycleIds.length > 0 : state.unavailableStart && state.unavailableEnd;
  const unavailableSelectionCount = state.unavailableType === "facility" ? state.unavailableFacilityIds.length : state.unavailableType === "class" ? state.unavailableClassIds.length : state.unavailableTeacherIds.length;
  const canSaveUnavailable = hasUnavailableTime && unavailableSelectionCount && hasPeriod;
  return `<section class="eventPage">
          <div class="eventForm">
            <h3>${state.editingUnavailableId ? "Modifier la contrainte" : "Ajouter une contrainte"}</h3>
            <div class="eventField">
              <label>Type de contrainte</label>
              <div class="choiceGrid">
                <button class="choiceButton ${state.unavailableType === "facility" ? "active" : ""}" data-unavailable-type="facility">Installations</button>
                <button class="choiceButton ${state.unavailableType === "class" ? "active" : ""}" data-unavailable-type="class">Classes</button>
                <button class="choiceButton ${state.unavailableType === "teacher" ? "active" : ""}" data-unavailable-type="teacher">Prof</button>
              </div>
            </div>
            <div class="eventField">
              <label>Periode</label>
              <div class="choiceGrid">
                <button class="choiceButton ${state.unavailablePeriodMode === "dates" ? "active" : ""}" data-unavailable-period-mode="dates">Dates</button>
                <button class="choiceButton ${state.unavailablePeriodMode === "cycles" ? "active" : ""}" data-unavailable-period-mode="cycles" ${cyclesAvailable ? "" : "disabled"}>${cycleLabel(false, true)}</button>
              </div>
              ${!cyclesAvailable ? `<span class="muted">Si vous voulez paramêtrer vos indispo sur des ${cycleLabel(true, true)}, définissez-les avant.</span>` : ""}
            </div>
            <div class="eventField">
              <label>Dates</label>
              ${renderDateRangePicker("unavailable", period.start, period.end, state.unavailablePeriodMode === "cycles")}
            </div>
            ${state.unavailablePeriodMode === "cycles" ? `<div class="eventField">
              <label>${isCollegeEstablishment() ? "P\u00e9riodes concern\u00e9es" : "Cycles concern\u00e9s"}</label>
              ${cyclesAvailable ? `<div class="choiceGrid">${state.cycles.map(cycle => `<button class="choiceButton ${state.unavailableCycleIds.includes(cycle.id) ? "active" : ""}" data-unavailable-cycle="${cycle.id}">${displayCycleName(cycle)}</button>`).join("")}</div>
              <span class="muted">${selectedCycles.length ? `Dates appliquées : ${period.start} -> ${period.end}` : `Sélectionnez ${isCollegeEstablishment() ? "une ou plusieurs périodes" : "un ou plusieurs cycles"}.`}</span>` : `<span class="muted">Si vous voulez paramêtrer vos indispo sur des ${cycleLabel(true, true)}, définissez-les avant.</span>`}
            </div>` : ""}
            ${state.unavailableType === "facility" ? `<div class="eventField">
              <label>Contraintes installations</label>
              <div class="choiceGrid">
                ${state.facilities.map(facility => `<button class="choiceButton ${state.unavailableFacilityIds.includes(facility.id) ? "active" : ""}" data-unavailable-facility="${facility.id}">${facility.label}</button>`).join("") || `<span class="muted">Aucune installation disponible.</span>`}
              </div>
              <label>Créneaux indisponibles</label>
              <table class="availabilityGrid">
                <thead><tr><th>Créneau</th>${state.days.map(day => `<th>${day}</th>`).join("")}</tr></thead>
                <tbody>${state.slots.map(slot => `<tr>
                  <th>${slot.label}</th>
                  ${state.days.map(day => `<td><button class="choiceButton unavailableCellButton ${unavailableCellSelected(day, slot.id) ? "active" : ""}" data-unavailable-cell-day="${day}" data-unavailable-cell-slot="${slot.id}">${unavailableCellSelected(day, slot.id) ? "x" : ""}</button></td>`).join("")}
                </tr>`).join("")}</tbody>
              </table>
            </div>` : state.unavailableType === "class" ? `<div class="eventField">
              <label>Contraintes classes</label>
              <div class="choiceGrid">${state.classLevels.map(level => `<button class="choiceButton ${state.unavailableClassLevelFilter === level ? "active" : ""}" data-unavailable-class-level-filter="${level}">${level}</button>`).join("")}</div>
              ${state.unavailableClassLevelFilter ? `<div class="choiceGrid">${classNumbersForLevel(state.unavailableClassLevelFilter).map(number => state.classGroups.map(group => {
    const schoolClass = schoolClassLabel(state.unavailableClassLevelFilter, number, group.id);
    return `<button class="choiceButton${classSelectionButtonClass(schoolClass)} ${state.unavailableClassIds.includes(schoolClass) ? "active" : ""}" data-unavailable-class="${schoolClass}">${classSelectionButtonLabel(schoolClass)}</button>`;
  }).join("")).join("")}</div>` : `<span class="muted">Choisissez un niveau puis un numéro de classe.</span>`}
              <span class="muted">${state.unavailableClassIds.length ? `Classes sélectionnées : ${state.unavailableClassIds.map(classSelectionButtonLabel).join(", ")}` : "Aucune classe sélectionnée"}</span>
              <label>Créneaux indisponibles</label>
              <table class="availabilityGrid">
                <thead><tr><th>Créneau</th>${state.days.map(day => `<th>${day}</th>`).join("")}</tr></thead>
                <tbody>${state.slots.map(slot => `<tr>
                  <th>${slot.label}</th>
                  ${state.days.map(day => `<td><button class="choiceButton unavailableCellButton ${unavailableCellSelected(day, slot.id) ? "active" : ""}" data-unavailable-cell-day="${day}" data-unavailable-cell-slot="${slot.id}">${unavailableCellSelected(day, slot.id) ? "x" : ""}</button></td>`).join("")}
                </tr>`).join("")}</tbody>
              </table>
            </div>` : `<div class="eventField">
              <label>Contraintes profs</label>
              <div class="choiceGrid">
                ${state.teachers.map(teacher => `<button class="choiceButton ${state.unavailableTeacherIds.includes(teacher.id) ? "active" : ""}" data-unavailable-teacher="${teacher.id}" style="background:${teacher.color};border-color:${teacher.border}">${teacher.name}</button>`).join("") || `<span class="muted">Aucun prof disponible.</span>`}
              </div>
              <span class="muted">${state.unavailableTeacherIds.length ? `Profs sélectionnés : ${teacherNamesFromIds(state.unavailableTeacherIds).join(", ")}` : "Aucun prof sélectionné"}</span>
              <label>Créneaux indisponibles</label>
              <table class="availabilityGrid">
                <thead><tr><th>Créneau</th>${state.days.map(day => `<th>${day}</th>`).join("")}</tr></thead>
                <tbody>${state.slots.map(slot => `<tr>
                  <th>${slot.label}</th>
                  ${state.days.map(day => `<td><button class="choiceButton unavailableCellButton ${unavailableCellSelected(day, slot.id) ? "active" : ""}" data-unavailable-cell-day="${day}" data-unavailable-cell-slot="${slot.id}">${unavailableCellSelected(day, slot.id) ? "x" : ""}</button></td>`).join("")}
                </tr>`).join("")}</tbody>
              </table>
            </div>`}
            <div class="modalFooter">
              ${state.editingUnavailableId ? `<button class="ghostButton" id="cancelUnavailableEdit">Annuler</button>` : ""}
              <button class="addButton" id="addFacilityUnavailable" ${canSaveUnavailable ? "" : "disabled"}>${state.editingUnavailableId ? "Enregistrer les modifications" : "Ajouter la contrainte"}</button>
            </div>
          </div>
          <div class="eventList">
            <h3>Contraintes existantes</h3>
            ${state.facilityUnavailability.length === 0 ? `<div class="alertEmpty">Aucune contrainte ajoutée.</div>` : [renderUnavailableGroup("Profs", "teacher"), renderUnavailableGroup("Classes", "class"), renderUnavailableGroup("Installations", "facility")].join("")}
          </div>
        </section>`;
}
export function bindUnavailabilityEvents() {
  document.querySelectorAll("[data-delete-unavailable]").forEach(button => {
    button.addEventListener("click", () => {
      state.facilityUnavailability = state.facilityUnavailability.filter(item => item.id !== button.dataset.deleteUnavailable);
      if (state.editingUnavailableId === button.dataset.deleteUnavailable) resetFacilityUnavailableForm();
      saveFacilityUnavailability();
      rebuildConstructionPlan();
      showValidationPopup("Contrainte supprimée");
      render();
    });
  });
  const unavailableNameInput = document.getElementById("unavailableName");
  if (unavailableNameInput) unavailableNameInput.addEventListener("input", () => state.unavailableName = unavailableNameInput.value);
  document.querySelectorAll("[data-unavailable-period-mode]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.unavailablePeriodMode = button.dataset.unavailablePeriodMode;
      render();
    });
  });
  document.querySelectorAll("[data-unavailable-cycle]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.unavailableCycle;
      state.unavailableCycleIds = state.unavailableCycleIds.includes(id) ? state.unavailableCycleIds.filter(item => item !== id) : [...state.unavailableCycleIds, id];
      render();
    });
  });
  document.querySelectorAll("[data-unavailable-type]").forEach(button => {
    button.addEventListener("click", () => {
      state.unavailableType = button.dataset.unavailableType;
      state.unavailableWeekdays = [...new Set(state.unavailableCells.map(cell => cell.day))];
      state.unavailableSlotIds = [...new Set(state.unavailableCells.map(cell => cell.slotId))];
      render();
    });
  });
  document.querySelectorAll("[data-unavailable-facility]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.unavailableFacility;
      state.unavailableFacilityIds = state.unavailableFacilityIds.includes(id) ? state.unavailableFacilityIds.filter(item => item !== id) : [...state.unavailableFacilityIds, id];
      render();
    });
  });
  document.querySelectorAll("[data-unavailable-teacher]").forEach(button => {
    button.addEventListener("click", () => {
      toggleUnavailableTeacher(button.dataset.unavailableTeacher);
      render();
    });
  });
  document.querySelectorAll("[data-unavailable-cell-day]").forEach(button => {
    button.addEventListener("click", () => {
      toggleUnavailableGridCell(button.dataset.unavailableCellDay, button.dataset.unavailableCellSlot);
      render();
    });
  });
  document.querySelectorAll("[data-toggle-unavailable-group]").forEach(button => {
    button.addEventListener("click", () => {
      state.expandedUnavailableGroup = state.expandedUnavailableGroup === button.dataset.toggleUnavailableGroup ? "" : button.dataset.toggleUnavailableGroup;
      render();
    });
  });
  document.querySelectorAll("[data-unavailable-class-level-filter]").forEach(button => {
    button.addEventListener("click", () => {
      state.unavailableClassLevelFilter = button.dataset.unavailableClassLevelFilter;
      render();
    });
  });
  document.querySelectorAll("[data-unavailable-class]").forEach(button => {
    button.addEventListener("click", () => {
      toggleUnavailableClass(button.dataset.unavailableClass);
      render();
    });
  });
  const cancelUnavailableEdit = document.getElementById("cancelUnavailableEdit");
  if (cancelUnavailableEdit) {
    cancelUnavailableEdit.addEventListener("click", () => {
      resetFacilityUnavailableForm();
      render();
    });
  }
  document.querySelectorAll("[data-edit-unavailable]").forEach(button => {
    button.addEventListener("click", () => {
      const item = state.facilityUnavailability.find(entry => entry.id === button.dataset.editUnavailable);
      if (!item) return;
      state.editingUnavailableId = item.id;
      state.unavailableName = item.name;
      state.unavailableType = item.type || ((item.classIds || []).length ? "class" : (item.teacherIds || []).length ? "teacher" : "facility");
      state.unavailableFacilityIds = [...(item.facilityIds || [])];
      state.unavailableClassIds = [...(item.classIds || [])];
      state.unavailableTeacherIds = [...(item.teacherIds || [])];
      state.unavailableClassLevelFilter = state.unavailableClassIds[0] ? classParts(state.unavailableClassIds[0]).level : "";
      state.unavailablePeriodMode = item.periodMode || ((item.cycleIds || []).length ? "cycles" : "dates");
      state.unavailableCycleIds = [...(item.cycleIds || [])];
      state.unavailableStart = item.start;
      state.unavailableEnd = item.end;
      state.unavailableWeekdays = [...(item.weekdays || [])];
      state.unavailableSlotIds = [...(item.slotIds || [])];
      state.unavailableCells = item.cells ? [...item.cells] : state.unavailableWeekdays.flatMap(day => state.unavailableSlotIds.map(slotId => ({
        day,
        slotId
      })));
      render();
    });
  });
}
