import { escapeHtml } from "../ui/format.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { blockTeacherStyle, renderTeacherLegend, teacherIdsForBlock } from "../domain/assignments.js";
import { confirmBlockDeletion } from "../domain/blocks.js";
import { userCycleChoices } from "../domain/cycles.js";
import { displayedSchoolWeek, yearRows } from "../domain/dates.js";
import { weeksForCycle } from "../domain/hours.js";
import { annualConstructionRules } from "../domain/readiness.js";
import { cycleLabel, displayCycleName } from "../domain/settings.js";
import { unavailableCoversFacility, unavailableForCell } from "../domain/unavailability.js";
import { blockWithCycleOverride, constructionCyclesForRule, cyclesRepresentSameSlot } from "../services/settings-storage.js";
import { formatDate } from "../ui/date-picker.js";
import { compactClassName, facilityShortLabel } from "../ui/format.js";

export function cycleWeeksByLetter(cycle, letter) {
  return weeksForCycle(cycle).filter(weekItem => weekItem.letter === letter);
}
export function blocksForCycleLetter(row, cycle, letter, facilityId = "") {
  const seen = new Set();
  return annualConstructionRules().flatMap(rule => {
    if (rule.rowId !== row.id) return [];
    if (rule.weekLetter && rule.weekLetter !== "all" && rule.weekLetter !== letter) return [];
    if (cycle?.scope && cycle.scope !== "default" && rule.classLevel && rule.classLevel !== cycle.scope) return [];
    const ruleCycle = constructionCyclesForRule(rule).find(item => cyclesRepresentSameSlot(item, cycle));
    if (!ruleCycle) return [];
    const block = {
      ...blockWithCycleOverride(rule, ruleCycle),
      ruleId: rule.id,
      cycleId: ruleCycle.id,
      cycleName: displayCycleName(ruleCycle),
      weekLetter: rule.weekLetter || "all"
    };
    if (facilityId && block.facilityId !== facilityId) return [];
    return [block];
  }).filter(block => {
    const signature = `${block.ruleId || ""}|${block.cycleId || ""}|${letter || ""}|${teacherIdsForBlock(block).join("+")}|${block.schoolClass}|${block.facilityId}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
export function unavailableForCycleLetter(row, cycle, letter, facilityId = "") {
  const seen = new Set();
  return cycleWeeksByLetter(cycle, letter).flatMap(weekItem => unavailableForCell(row, weekItem)).filter(item => {
    if (facilityId && !unavailableCoversFacility(item, facilityId)) return false;
    if (!facilityId && !(item.facilityIds || []).length) return false;
    const signature = item.id || `${item.type}|${(item.facilityIds || []).join("+")}|${(item.classIds || []).join("+")}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
export function cycleLetterCellData(row, cycle, letter, facilityId = "") {
  const items = blocksForCycleLetter(row, cycle, letter, facilityId);
  const unavailableItems = unavailableForCycleLetter(row, cycle, letter, facilityId);
  const blockSignature = items.map(item => [item.ruleId || "", item.cycleId || "", teacherIdsForBlock(item).join("+"), item.schoolClass || "", item.facilityId || "", item.activityId || "", item.weekLetter || "all"].join("|")).sort().join(";");
  const unavailableSignature = unavailableItems.map(item => item.id || [item.type || "", (item.facilityIds || []).join("+"), (item.classIds || []).join("+"), item.name || ""].join("|")).sort().join(";");
  return {
    items,
    unavailableItems,
    signature: `${blockSignature}::${unavailableSignature}`
  };
}
export function renderCycleCellStack(items) {
  return `<div class="buildCellStack">
          ${items.map(item => `<div class="buildBlock" style="${blockTeacherStyle(item)}">
            <strong>${compactClassName(item.schoolClass) || "Classe"}</strong>
          </div>`).join("")}
        </div>`;
}
export function renderCycleLetterCell(row, cycle, letter, facilityId = "") {
  const data = cycleLetterCellData(row, cycle, letter, facilityId);
  return `<td class="${data.unavailableItems.length ? "cycleUnavailableCell" : ""}">${renderCycleCellStack(data.items)}</td>`;
}
export function renderCycleMergedCell(row, cycle, facilityId = "") {
  const weekA = cycleLetterCellData(row, cycle, "A", facilityId);
  const weekB = cycleLetterCellData(row, cycle, "B", facilityId);
  if (weekA.signature === weekB.signature) {
    return `<td class="${weekA.unavailableItems.length ? "cycleUnavailableCell" : ""}">${renderCycleCellStack(weekA.items)}</td>`;
  }
  return `<td class="cycleSummarySplitCell">
          <div class="cycleSummarySplit">
            ${[["A", weekA], ["B", weekB]].map(([letter, data]) => `<div class="cycleSummaryHalf ${data.unavailableItems.length ? "cycleUnavailableCell" : ""}">
              <div class="cycleSummaryHalfLabel">${letter}</div>
              ${renderCycleCellStack(data.items)}
            </div>`).join("")}
          </div>
        </td>`;
}
export function renderCycleTwoWeekTable(cycle) {
  const rows = yearRows().filter(row => !row.isAs);
  const cycleSlots = state.slots;
  const displayedFacilities = state.facilities;
  return `<div class="yearWrap"><table class="yearTable constructionTable cycleTwoWeekTable">
          <colgroup>
            <col class="cycleTimeCol" />
            ${state.days.flatMap(() => displayedFacilities.map(() => `<col class="cycleFacilityCol" />`)).join("")}
          </colgroup>
          <thead>
            <tr><th class="timeHead" rowspan="2">Créneau</th>${state.days.map(day => `<th colspan="${escapeHtml(displayedFacilities.length)}">${day}</th>`).join("")}</tr>
            <tr>${state.days.flatMap(() => displayedFacilities.map(facility => `<th class="weekTypeHead" title="${escapeHtml(facility.label)}">${facilityShortLabel(facility.id, facility.label)}</th>`)).join("")}</tr>
          </thead>
          <tbody>
            ${cycleSlots.map(slot => `<tr>
              <th class="timeHead">${escapeHtml(slot.label)}</th>
              ${state.days.flatMap(day => displayedFacilities.map(facility => {
    const row = rows.find(item => item.day === day && item.slot.id === slot.id);
    const nonWorkingCell = day === "Mercredi" && ["13", "15"].includes(slot.id);
    if (!row) return `<td class="${nonWorkingCell ? "holidayCell" : ""}"><div class="buildCellStack"></div></td>`;
    return renderCycleMergedCell(row, cycle, facility.id);
  })).join("")}
            </tr>`).join("")}
          </tbody>
        </table></div>`;
}
export function renderCycleView() {
  const displayedWeek = displayedSchoolWeek();
  const cycleChoices = userCycleChoices();
  const currentCycle = cycleChoices.find(cycle => weeksForCycle(cycle).some(weekItem => weekItem.rank === displayedWeek.rank)) || cycleChoices[0];
  const selectedCycle = cycleChoices.find(item => item.id === (state.activeHomeCycleId || currentCycle?.id)) || currentCycle;
  if (!selectedCycle) return `<section class="panel"><h2>Résumé ${cycleLabel(true)}</h2><p class="muted">Aucune ${cycleLabel(true)} définie.</p></section>`;
  return `<section class="panel">
          <div class="cycleSummaryHeader">
            <div>
              <h2>Résumé ${cycleLabel(true)}</h2>
              <p class="muted">${displayCycleName(selectedCycle)}${selectedCycle.scope && selectedCycle.scope !== "default" ? ` · ${selectedCycle.scope}` : ""} · du ${formatDate(selectedCycle.start)} au ${formatDate(selectedCycle.end)}</p>
            </div>
            <div class="cycleSummaryControl">
              <label>${cycleLabel()}</label>
              <select id="homeCycleSelect">
                ${cycleChoices.map(cycleItem => `<option value="${escapeHtml(cycleItem.id)}" ${cycleItem.id === selectedCycle.id ? "selected" : ""}>${escapeHtml(cycleItem.displayName)}</option>`).join("")}
              </select>
            </div>
            <div class="zoomControls">
              <button class="ghostButton" data-cycle-view-zoom="-">-</button>
              <button class="ghostButton" data-cycle-view-zoom-reset>${Math.round(state.cycleViewZoom * 100)}%</button>
              <button class="ghostButton" data-cycle-view-zoom="+">+</button>
            </div>
            <div class="yearActionsRight">
              <button class="ghostButton" data-print-format="A3">Exporter</button>
            </div>
          </div>
          ${renderTeacherLegend("homeTeacherLegend", false)}
          <div class="constructionZoomWrap cycleSummaryTableWrap" style="--table-zoom:${escapeHtml(state.cycleViewZoom)};--table-offset:150px;zoom:${escapeHtml(state.cycleViewZoom)}">${renderCycleTwoWeekTable(selectedCycle)}</div>
        </section>`;
}
export function bindCycleEvents() {
  document.querySelectorAll("[data-cycle-letter]").forEach(button => {
    button.addEventListener("click", () => {
      state.activeCycleLetter = button.dataset.cycleLetter;
      render();
    });
  });
  document.querySelectorAll("[data-cycle-teacher]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.cycleTeacher;
      if (id === "all") state.cycleTeacherIds = state.teachers.map(teacher => teacher.id);else if (state.cycleTeacherIds.length === state.teachers.length) state.cycleTeacherIds = [id];else if (state.cycleTeacherIds.includes(id)) state.cycleTeacherIds = state.cycleTeacherIds.filter(teacherId => teacherId !== id);else state.cycleTeacherIds = [...state.cycleTeacherIds, id];
      render();
    });
  });
  const homeCycleSelect = document.getElementById("homeCycleSelect");
  if (homeCycleSelect) {
    homeCycleSelect.addEventListener("change", () => {
      state.activeHomeCycleId = homeCycleSelect.value;
      render();
    });
  }
  const deleteWholeCycle = document.getElementById("deleteWholeCycle");
  if (deleteWholeCycle) {
    deleteWholeCycle.addEventListener("click", () => {
      confirmBlockDeletion("cycle");
      render();
    });
  }
  document.querySelectorAll("[data-cycle-facility]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.cycleFacility;
      if (id === "all") state.cycleFacilityIds = state.facilities.map(facility => facility.id);else if (state.cycleFacilityIds.length === state.facilities.length) state.cycleFacilityIds = [id];else if (state.cycleFacilityIds.includes(id)) state.cycleFacilityIds = state.cycleFacilityIds.filter(facilityId => facilityId !== id);else state.cycleFacilityIds = [...state.cycleFacilityIds, id];
      render();
    });
  });
}
