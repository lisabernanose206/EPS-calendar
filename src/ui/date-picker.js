import { escapeHtml } from "./format.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { activeCycles, saveCycles, validateCycles } from "../domain/cycles.js";
import { dateKey, dateRangeBlockedReason, dateFromMonthKey, monthKeyForDate, dateRangeLabel, shiftMonthKey } from "../domain/dates.js";
import { rebuildConstructionPlan } from "../services/settings-storage.js";
import { showValidationPopup } from "./feedback.js";

export function renderDateRangePicker(id, start, end, disabled = false) {
  const isOpen = state.activeDateRangePicker === id;
  const monthDate = dateFromMonthKey(isOpen ? state.dateRangeMonth : monthKeyForDate(start || state.schoolYear.start));
  const monthLabel = monthDate.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
  const firstDay = new Date(monthDate);
  const startOffset = (firstDay.getDay() || 7) - 1;
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const draftStart = isOpen ? state.dateRangeDraftStart : start;
  const draftEnd = isOpen ? state.dateRangeDraftEnd : end;
  const dayButtons = [...Array.from({
    length: startOffset
  }, () => `<span class="dateRangeDay blank"></span>`), ...Array.from({
    length: daysInMonth
  }, (_, index) => {
    const day = index + 1;
    const value = dateKey(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
    const selected = value === draftStart || value === draftEnd;
    const inRange = draftStart && draftEnd && value > draftStart && value < draftEnd;
    const blockedReason = dateRangeBlockedReason(value);
    return `<button type="button" class="dateRangeDay ${selected ? "selected" : ""} ${inRange ? "inRange" : ""} ${blockedReason ? "blocked" : ""}" data-date-range-day="${value}" ${blockedReason ? `disabled title="${blockedReason}"` : ""}>${day}</button>`;
  })].join("");
  return `<div class="dateRangeField">
          <button class="dateRangeButton" data-open-date-range="${id}" data-range-start="${start || ""}" data-range-end="${end || ""}" ${disabled ? "disabled" : ""}>${dateRangeLabel(start, end)}</button>
          ${isOpen ? `<div class="dateRangePicker">
            <div class="dateRangeHead">
              <button type="button" data-date-range-month="-">‹</button>
              <strong>${monthLabel}</strong>
              <button type="button" data-date-range-month="+">›</button>
            </div>
            <div class="dateRangeGrid">${["L", "M", "M", "J", "V", "S", "D"].map(day => `<span class="dateRangeWeekday">${day}</span>`).join("")}${dayButtons}</div>
            <span class="dateRangeHint ${state.dateRangeSelectionError ? "error" : ""}">${escapeHtml((state.dateRangeSelectionError || state.dateRangeDraftStart && !state.dateRangeDraftEnd ? "Choisissez la date de fin." : "Choisissez la date de début."))}</span>
            <div class="dateRangeActions">
              <button type="button" class="dateRangeValidate" data-validate-date-range="${id}" ${state.dateRangeDraftStart && state.dateRangeDraftEnd ? "" : "disabled"}>Valider les dates</button>
            </div>
          </div>` : ""}
        </div>`;
}
export function applyDateRangeSelection(id, start, end) {
  if (!start || !end) return;
  if (id === "event") {
    state.eventStart = start;
    state.eventEnd = end;
    return;
  }
  if (id === "as") {
    state.asStart = start;
    state.asEnd = end;
    return;
  }
  if (id === "unavailable") {
    state.unavailableStart = start;
    state.unavailableEnd = end;
    return;
  }
  if (id.startsWith("cycle:")) {
    const cycleId = id.replace("cycle:", "");
    const cycle = activeCycles().find(item => item.id === cycleId);
    if (!cycle) return;
    cycle.start = start;
    cycle.end = end;
    const cycleErrors = validateCycles(activeCycles());
    if (cycleErrors.length) {
      state.cycleSaveStatus = cycleErrors[0];
      return;
    }
    saveCycles();
    rebuildConstructionPlan();
  }
}

export function bindDatePickerEvents() {
  document.querySelectorAll("[data-open-date-range]").forEach(button => {
    button.addEventListener("click", () => {
      state.activeDateRangePicker = button.dataset.openDateRange;
      state.dateRangeDraftStart = button.dataset.rangeStart || "";
      state.dateRangeDraftEnd = button.dataset.rangeEnd || "";
      state.dateRangeSelectionError = "";
      state.dateRangeMonth = monthKeyForDate(state.dateRangeDraftStart || state.schoolYear.start);
      render();
    });
  });
  document.querySelectorAll("[data-date-range-month]").forEach(button => {
    button.addEventListener("click", () => {
      state.dateRangeMonth = shiftMonthKey(state.dateRangeMonth, button.dataset.dateRangeMonth === "+" ? 1 : -1);
      render();
    });
  });
  document.querySelectorAll("[data-date-range-day]").forEach(button => {
    button.addEventListener("click", () => {
      const value = button.dataset.dateRangeDay;
      if (button.disabled || dateRangeBlockedReason(value)) return;
      state.dateRangeSelectionError = "";
      if (!state.dateRangeDraftStart || state.dateRangeDraftEnd) {
        state.dateRangeDraftStart = value;
        state.dateRangeDraftEnd = "";
        render();
        return;
      }
      const start = value < state.dateRangeDraftStart ? value : state.dateRangeDraftStart;
      const end = value < state.dateRangeDraftStart ? state.dateRangeDraftStart : value;
      state.dateRangeDraftStart = start;
      state.dateRangeDraftEnd = end;
      render();
    });
  });
  document.querySelectorAll("[data-validate-date-range]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled || !state.dateRangeDraftStart || !state.dateRangeDraftEnd) return;
      applyDateRangeSelection(button.dataset.validateDateRange, state.dateRangeDraftStart, state.dateRangeDraftEnd);
      state.activeDateRangePicker = "";
      state.dateRangeDraftStart = "";
      state.dateRangeDraftEnd = "";
      state.dateRangeSelectionError = "";
      showValidationPopup("Dates validées");
      render();
    });
  });
}
