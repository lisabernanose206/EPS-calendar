import { escapeHtml } from "../ui/format.js";
import { state } from "../app/state.js";
import { classCollectionHasOverlap, classesForBlock, teacherIdsForBlock, teacherLabelForBlock, yearCellKey } from "./assignments.js";
import { rowDateForWeek, yearRows } from "./dates.js";
import { applySportEventChange, confirmSportEventCleanup, eventExclusionsFor, teacherNamesFromIds } from "./events.js";
import { findCycleForRule, weeksForCycle } from "./hours.js";
import { clearConstructionCycleDetails } from "./optimizer.js";
import { saveConstructionPlan } from "../services/planning-storage.js";
import { isBlockExcluded, rebuildConstructionPlan, saveAcceptedConflicts, saveBlockExclusions, saveConstructionRules, saveFacilityUnavailability } from "../services/settings-storage.js";
import { dateOnly } from "./dates.js";

export function unavailableForCell(row, weekItem, includeAs = false) {
  if (row.isAs && !includeAs) return [];
  return state.facilityUnavailability.filter(item => unavailableMatchesCell(item, row, weekItem));
}
export function unavailableMatchesCell(item, row, weekItem) {
  if (!item || !row || !weekItem) return false;
  const rowDate = rowDateForWeek(row, weekItem);
  const matchesPeriod = item.periodMode === "cycles" && (item.cycleIds || []).length ? (item.cycleIds || []).some(cycleId => {
    const cycle = state.cycles.find(entry => entry.id === cycleId);
    return cycle && weeksForCycle(cycle).some(cycleWeek => cycleWeek.rank === weekItem.rank);
  }) : rowDate >= dateOnly(item.start) && rowDate <= dateOnly(item.end);
  const cells = item.cells || [];
  const matchesCell = cells.length ? cells.some(cell => cell.day === row.day && cell.slotId === row.slot.id) : (item.weekdays || []).includes(row.day) && (item.slotIds || []).includes(row.slot.id);
  return matchesPeriod && matchesCell;
}
export function unavailableCoversFacility(item, facilityId) {
  return (item.facilityIds || []).includes(facilityId);
}
export function unavailableFacilitiesForCell(row, weekItem) {
  return new Set(unavailableForCell(row, weekItem).flatMap(item => item.facilityIds || []));
}
export function unavailableClassesForCell(row, weekItem) {
  return new Set(unavailableForCell(row, weekItem).flatMap(item => item.classIds || []));
}
export function unavailableTeachersForCell(row, weekItem, includeAs = false) {
  return new Set(unavailableForCell(row, weekItem, includeAs).flatMap(item => item.teacherIds || []));
}
export function unavailableTeachersForCycleSpan(row, cycle, weekLetter = "all") {
  if (!row || !cycle) return new Set();
  return new Set(weeksForCycle(cycle).filter(weekItem => weekLetter === "all" || weekItem.letter === weekLetter).flatMap(weekItem => [...unavailableTeachersForCell(row, weekItem)]));
}
export function blockUnavailableMessage(row, weekItem, block) {
  if (!row || !weekItem || !block) return "";
  const unavailableItems = unavailableForCell(row, weekItem);
  const facilityBlocked = unavailableItems.find(item => unavailableCoversFacility(item, block.facilityId));
  if (facilityBlocked) return `${block.facilityLabel || "Cette installation"} est indisponible sur ce créneau.`;
  const blockedClass = classesForBlock(block).find(schoolClass => classCollectionHasOverlap(unavailableItems.flatMap(item => item.classIds || []), schoolClass));
  if (blockedClass) return `${blockedClass || "Cette classe"} est indisponible sur ce créneau.`;
  const teacherBlocked = unavailableItems.find(item => teacherIdsForBlock(block).some(teacherId => (item.teacherIds || []).includes(teacherId)));
  if (teacherBlocked) return `${teacherLabelForBlock(block) || "Ce professeur"} est indisponible sur ce créneau.`;
  return "";
}
export function ruleBlockedByUnavailable(rule, weekItem) {
  const row = yearRows().find(item => item.id === rule.rowId);
  if (!row || !rule.block) return false;
  return unavailableForCell(row, weekItem).some(item => {
    const facilityBlocked = unavailableCoversFacility(item, rule.block.facilityId);
    const classBlocked = classesForBlock(rule.block).some(schoolClass => classCollectionHasOverlap(item.classIds || [], schoolClass));
    const teacherBlocked = teacherIdsForBlock(rule.block).some(teacherId => (item.teacherIds || []).includes(teacherId));
    return facilityBlocked || classBlocked || teacherBlocked;
  });
}
export function purgeConstructionForUnavailableItems(items) {
  const unavailableItems = Array.isArray(items) ? items : [items].filter(Boolean);
  if (!unavailableItems.length) return false;
  const rows = yearRows();
  let changed = false;
  state.constructionRules.forEach(rule => {
    const row = rows.find(item => item.id === rule.rowId);
    const cycle = findCycleForRule(rule);
    if (!row || !cycle || !rule.block) return;
    weeksForCycle(cycle).forEach(weekItem => {
      if (rule.weekLetter && rule.weekLetter !== "all" && weekItem.letter !== rule.weekLetter) return;
      const key = yearCellKey(rule.rowId, weekItem.rank);
      if (isBlockExcluded(rule.id, key)) return;
      const shouldRemove = unavailableItems.some(item => {
        if (!unavailableMatchesCell(item, row, weekItem)) return false;
        const facilityBlocked = unavailableCoversFacility(item, rule.block.facilityId);
        const classBlocked = classesForBlock(rule.block).some(schoolClass => classCollectionHasOverlap(item.classIds || [], schoolClass));
        const teacherBlocked = teacherIdsForBlock(rule.block).some(teacherId => (item.teacherIds || []).includes(teacherId));
        return facilityBlocked || classBlocked || teacherBlocked;
      });
      if (!shouldRemove) return;
      const existing = state.blockExclusions[rule.id] || [];
      state.blockExclusions[rule.id] = [...existing, key];
      changed = true;
    });
  });
  return changed;
}
export function resetFacilityUnavailableForm() {
  state.editingUnavailableId = null;
  state.unavailableName = "Installation occupée";
  state.unavailableType = "facility";
  state.unavailableFacilityIds = [];
  state.unavailableClassIds = [];
  state.unavailableTeacherIds = [];
  state.unavailableClassLevelFilter = "";
  state.unavailablePeriodMode = "dates";
  state.unavailableCycleIds = [];
  state.unavailableStart = "2026-09-01";
  state.unavailableEnd = "2027-07-02";
  state.unavailableWeekdays = [];
  state.unavailableSlotIds = [];
  state.unavailableCells = [];
}
export function unavailableSelectedCycles() {
  return state.unavailableCycleIds.map(id => state.cycles.find(cycle => cycle.id === id)).filter(Boolean);
}
export function unavailableDateRange() {
  if (state.unavailablePeriodMode !== "cycles") return {
    start: state.unavailableStart,
    end: state.unavailableEnd
  };
  const selectedCycles = unavailableSelectedCycles();
  if (!selectedCycles.length) return {
    start: state.unavailableStart,
    end: state.unavailableEnd
  };
  const starts = selectedCycles.map(cycle => cycle.start).sort();
  const ends = selectedCycles.map(cycle => cycle.end).sort();
  return {
    start: starts[0],
    end: ends[ends.length - 1]
  };
}
export function unavailableCellSummary(item) {
  const cells = (item.cells || []).length ? item.cells : (item.weekdays || []).flatMap(day => (item.slotIds || []).map(slotId => ({
    day,
    slotId
  })));
  if (!cells.length) return "aucun";
  const morning = ["8", "10"];
  const afternoon = ["13", "15"];
  return state.days.map(day => {
    const daySlotIds = cells.filter(cell => cell.day === day).map(cell => cell.slotId);
    if (!daySlotIds.length) return "";
    const uniqueSlotIds = [...new Set(daySlotIds)];
    const hasSameSlots = expected => uniqueSlotIds.length === expected.length && expected.every(slotId => uniqueSlotIds.includes(slotId));
    if (hasSameSlots(state.slots.map(slot => slot.id))) return `${day} toute la journee`;
    if (hasSameSlots(morning)) return `${day} matin`;
    if (hasSameSlots(afternoon)) return `${day} apres-midi`;
    return uniqueSlotIds.map(slotId => `${day} ${state.slots.find(slot => slot.id === slotId)?.label || slotId}`).join(", ");
  }).filter(Boolean).join(", ");
}
export function unavailableTypeForItem(item) {
  if ((item.type || "") === "teacher" || (item.teacherIds || []).length) return "teacher";
  if ((item.type || "") === "class" || (item.classIds || []).length) return "class";
  return "facility";
}
export function unavailableTitle(item) {
  const type = unavailableTypeForItem(item);
  if (type === "teacher") return teacherNamesFromIds(item.teacherIds || []).join(", ") || "Prof indisponible";
  if (type === "class") return (item.classIds || []).join(", ") || "Classe indisponible";
  return (item.facilityIds || []).map(id => state.facilities.find(facility => facility.id === id)?.label || id).join(", ") || item.name;
}
export function renderUnavailableCard(item) {
  return `<article class="eventCard unavailableCard">
          <strong>${unavailableTitle(item)}</strong>
          ${(item.cycleIds || []).length ? `<span>Cycle(s) : ${(item.cycleIds || []).map(id => state.cycles.find(cycle => cycle.id === id)?.name || id).join(", ")}</span>` : ""}
          <span>${escapeHtml(item.start)} -> ${escapeHtml(item.end)} · ${(item.weekdays || []).join(", ")}</span>
          <span>${unavailableCellSummary(item)}</span>
          <button class="ghostButton" data-edit-unavailable="${escapeHtml(item.id)}">Modifier</button>
          <button class="ghostButton" data-delete-unavailable="${escapeHtml(item.id)}">Supprimer</button>
        </article>`;
}
export function renderUnavailableGroup(label, type) {
  const items = state.facilityUnavailability.filter(item => unavailableTypeForItem(item) === type);
  if (!items.length) return "";
  const isOpen = state.expandedUnavailableGroup === type;
  return `<section class="unavailableGroup">
          <button class="${isOpen ? "active" : ""}" data-toggle-unavailable-group="${type}">
            <span>${label}</span>
            <span>${escapeHtml(items.length)} · ${isOpen ? "Masquer" : "Afficher"}</span>
          </button>
          ${isOpen ? `<div class="unavailableGrid">${items.map(renderUnavailableCard).join("")}</div>` : ""}
        </section>`;
}
export function saveFacilityUnavailableFromForm() {
  const facilityLabel = state.unavailableFacilityIds.map(id => state.facilities.find(facility => facility.id === id)?.label || id).join(", ");
  const selectedCells = state.unavailableCells.length ? state.unavailableCells : state.unavailableWeekdays.flatMap(day => state.unavailableSlotIds.map(slotId => ({
    day,
    slotId
  })));
  const slotLabel = selectedCells.map(cell => `${cell.day} ${state.slots.find(slot => slot.id === cell.slotId)?.label || cell.slotId}`).join(", ");
  const period = unavailableDateRange();
  const generatedName = state.unavailableType === "class" ? `Classe indisponible : ${state.unavailableClassIds.join(", ")}` : state.unavailableType === "teacher" ? `Prof indisponible : ${teacherNamesFromIds(state.unavailableTeacherIds).join(", ")}` : `${facilityLabel} · ${slotLabel}`;
  const item = {
    id: state.editingUnavailableId || `unavailable-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: generatedName,
    type: state.unavailableType,
    facilityIds: state.unavailableType === "facility" ? [...state.unavailableFacilityIds] : [],
    classIds: state.unavailableType === "class" ? [...state.unavailableClassIds] : [],
    teacherIds: state.unavailableType === "teacher" ? [...state.unavailableTeacherIds] : [],
    periodMode: state.unavailablePeriodMode,
    cycleIds: state.unavailablePeriodMode === "cycles" ? [...state.unavailableCycleIds] : [],
    start: period.start,
    end: period.end,
    weekdays: [...new Set(selectedCells.map(cell => cell.day))],
    slotIds: [...new Set(selectedCells.map(cell => cell.slotId))],
    cells: [...selectedCells]
  };
  if (state.editingUnavailableId) state.facilityUnavailability = state.facilityUnavailability.map(entry => entry.id === state.editingUnavailableId ? item : entry);else state.facilityUnavailability.push(item);
  purgeConstructionForUnavailableItems([item]);
  saveBlockExclusions();
  saveFacilityUnavailability();
  rebuildConstructionPlan();
  resetFacilityUnavailableForm();
}
export function addSportEventWithCleanup(event) {
  const exclusions = eventExclusionsFor(event);
  if (!confirmSportEventCleanup(exclusions, false)) return;
  applySportEventChange(event, exclusions, false);
}
export function resetEventForm() {
  state.editingEventId = null;
  state.eventName = "";
  state.eventStart = "2026-10-05";
  state.eventEnd = "2026-10-09";
  state.eventHalfDay = "all";
  state.eventTeacherIds = [];
  state.eventClasses = [];
  state.eventClassLevelFilter = "";
}
export function saveSportEventFromForm() {
  const event = {
    id: state.editingEventId || `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    planningId: state.cloudConfig.planningId,
    name: state.eventName || "Événement sportif",
    start: state.eventStart,
    end: state.eventEnd,
    halfDay: state.eventHalfDay,
    teacherIds: [...state.eventTeacherIds],
    classes: [...state.eventClasses]
  };
  const exclusions = eventExclusionsFor(event);
  const isEditing = Boolean(state.editingEventId);
  if (!confirmSportEventCleanup(exclusions, isEditing)) return;
  applySportEventChange(event, exclusions, isEditing);
  resetEventForm();
}
export function clearPlanningParts(options) {
  if (options.constructionDetails) {
    clearConstructionCycleDetails(options.constructionDetailCycleIds || null);
  }
  if (options.construction) {
    state.constructionRules = [];
    state.constructionPlan = {};
    state.blockExclusions = {};
    state.acceptedConflicts = [];
    saveConstructionRules();
    saveBlockExclusions();
    saveAcceptedConflicts();
    saveConstructionPlan();
  }
  state.clearConstructionPanelOpen = false;
}
