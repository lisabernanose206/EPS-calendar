import { state } from "../app/state.js";
import { blockMatchesTeacherSelection, classesForBlock, classesOverlap, teacherIdsForBlock, yearCellKey } from "./assignments.js";
import { rowDateForWeek, schoolYearWeeks, yearRows } from "./dates.js";
import { findCycleForRule, weeksForCycle } from "./hours.js";
import { unavailableTeachersForCell } from "./unavailability.js";
import { saveCloudPatchNow } from "../services/cloud.js";
import { itemExcludedForCell, rebuildConstructionPlan, saveAsSessions, saveEventExclusions, saveSportEvents } from "../services/settings-storage.js";
import { dateOnly } from "../ui/date-picker.js";

export function halfDayForSlot(slotId) {
  if (slotId === "8" || slotId === "10") return "morning";
  if (slotId === "13" || slotId === "15") return "afternoon";
  const label = state.slots.find(slot => slot.id === slotId)?.label || "";
  const hour = Number((label.match(/^(\d{1,2})h/) || [])[1]);
  if (Number.isFinite(hour)) return hour < 12 ? "morning" : hour < 13 ? "midday" : "afternoon";
  return "midday";
}
export function halfDayLabel(value) {
  if (value === "morning") return "Matin";
  if (value === "afternoon") return "Après-midi";
  if ((value || "").startsWith("slot-")) return state.slots.find(slot => slot.id === value.replace("slot-", ""))?.label || "Créneau";
  return "Journée";
}
export function rowMatchesEventHalfDay(row, event) {
  const halfDay = event.halfDay || "all";
  if (halfDay.startsWith("slot-")) return row.slot.id === halfDay.replace("slot-", "");
  return halfDay === "all" || halfDayForSlot(row.slot.id) === halfDay;
}
export function eventStartSlotId(event) {
  const halfDay = event.halfDay || "all";
  if (halfDay.startsWith("slot-")) return halfDay.replace("slot-", "");
  if (halfDay === "afternoon") return state.slots.find(slot => halfDayForSlot(slot.id) === "afternoon")?.id || state.slots[0]?.id || "";
  return state.slots.find(slot => halfDayForSlot(slot.id) === "morning")?.id || state.slots[0]?.id || "";
}
export function eventPeriodLabel(event) {
  return (event.halfDay || "all") === "all" ? "Journée complète" : halfDayLabel(event.halfDay);
}
export function eventTeacherDots(event) {
  return `<div class="eventTeacherDots">${(event.teacherIds || []).map(teacherId => {
    const teacher = state.teachers.find(item => item.id === teacherId);
    return teacher ? `<span class="eventTeacherDot" title="${teacher.name}" style="background:${teacher.color};border-color:${teacher.border}"></span>` : "";
  }).join("")}</div>`;
}
export function eventSpanClass(event) {
  return (event.halfDay || "all") === "all" ? "eventSpanFull" : "eventSpanHalf";
}
export function eventsForPeriod(row, weekItem) {
  const rowDate = rowDateForWeek(row, weekItem);
  const key = yearCellKey(row.id, weekItem.rank);
  return state.sportEvents.filter(event => {
    const start = dateOnly(event.start);
    const end = dateOnly(event.end);
    return rowDate >= start && rowDate <= end && rowMatchesEventHalfDay(row, event) && !itemExcludedForCell(state.eventExclusions, event.id, key);
  });
}
export function rowDateInEvent(row, weekItem, event) {
  const rowDate = rowDateForWeek(row, weekItem);
  return rowDate >= dateOnly(event.start) && rowDate <= dateOnly(event.end);
}
export function eventTouchesBlock(event, block) {
  const eventTeacherIds = event.teacherIds || [];
  return teacherIdsForBlock(block).some(teacherId => eventTeacherIds.includes(teacherId)) || (event.classes || []).some(schoolClass => classesForBlock(block).some(blockClassItem => classesOverlap(schoolClass, blockClassItem)));
}
export function blockCancelledByEvent(row, weekItem, block) {
  return eventsForPeriod(row, weekItem).some(event => eventTouchesBlock(event, block));
}
export function visibleCourseBlocksForCell(row, weekItem, filterSelection = true) {
  const key = yearCellKey(row.id, weekItem.rank);
  return (state.constructionPlan[key] || []).filter(block => !blockCancelledByEvent(row, weekItem, block)).filter(block => !filterSelection || blockMatchesTeacherSelection(block));
}
export function eventsForCell(row, weekItem) {
  return eventsForPeriod(row, weekItem).filter(event => row.slot.id === eventStartSlotId(event));
}
export function eventForContinuation(row, weekItem) {
  return eventsForPeriod(row, weekItem).find(event => row.slot.id !== eventStartSlotId(event));
}
export function eventRowSpan(event, rows) {
  return rows.filter(row => rowMatchesEventHalfDay(row, event)).length;
}
export function canMergeEventCell(event, rows, weekItem) {
  return rows.filter(row => rowMatchesEventHalfDay(row, event)).every(row => {
    return !visibleCourseBlocksForCell(row, weekItem, false).length && !asSessionsForCell(row, weekItem).length;
  });
}
export function asSessionsForCell(row, weekItem) {
  if (!row.isAs) return [];
  const rowDate = rowDateForWeek(row, weekItem);
  const key = yearCellKey(row.id, weekItem.rank);
  const blockedTeacherIds = unavailableTeachersForCell(row, weekItem, true);
  return state.asSessions.filter(session => {
    const start = dateOnly(session.start);
    const end = dateOnly(session.end);
    const slotIds = Array.isArray(session.slotIds) ? session.slotIds : [];
    const teacherBlocked = (session.teacherIds || []).some(teacherId => blockedTeacherIds.has(teacherId));
    return rowDate >= start && rowDate <= end && session.weekdays.includes(row.day) && (!slotIds.length || slotIds.includes(row.slot.id)) && !teacherBlocked && !itemExcludedForCell(state.asExclusions, session.id, key);
  });
}
export function asSessionsForDay(rows, day, weekItem) {
  const seen = new Set();
  return rows.filter(row => row.day === day && row.isAs).flatMap(row => asSessionsForCell(row, weekItem)).filter(session => {
    if (seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
}
export function teacherNamesFromIds(ids) {
  return ids.map(id => state.teachers.find(teacher => teacher.id === id)?.name || id);
}
export function asSessionStyle(session) {
  const sessionTeachers = (session.teacherIds || []).map(teacherId => state.teachers.find(item => item.id === teacherId)).filter(Boolean);
  const shownTeachers = sessionTeachers.length ? sessionTeachers : [state.teachers[0]].filter(Boolean);
  const border = shownTeachers[0]?.border || "#9ca3af";
  const background = shownTeachers.length > 1 ? `linear-gradient(90deg, ${shownTeachers.map((teacher, index) => {
    const start = Math.round(index / shownTeachers.length * 100);
    const end = Math.round((index + 1) / shownTeachers.length * 100);
    return `${teacher.color} ${start}% ${end}%`;
  }).join(", ")})` : shownTeachers[0]?.color || "#e5e7eb";
  return `background:${background} !important;border-color:${border} !important`;
}
export function asSessionTeacherLabel(session) {
  return teacherNamesFromIds(session.teacherIds || []).join(" + ") || "Prof";
}
export function asBlockLabel(session) {
  return session.name && session.name !== "AS" ? `AS ${session.name}` : "AS";
}
export function eventExclusionsFor(event) {
  const exclusions = [];
  const rows = yearRows();
  const weeks = schoolYearWeeks();
  state.constructionRules.forEach(rule => {
    const row = rows.find(item => item.id === rule.rowId);
    if (!row || !eventTouchesBlock(event, rule.block) || !rowMatchesEventHalfDay(row, event)) return;
    const cycle = findCycleForRule(rule);
    if (!cycle) return;
    weeksForCycle(cycle).forEach(weekItem => {
      if (!rowDateInEvent(row, weekItem, event)) return;
      exclusions.push({
        key: yearCellKey(row.id, weekItem.rank),
        ruleId: rule.id
      });
    });
  });
  return exclusions;
}
export function confirmSportEventCleanup(exclusions, isEditing) {
  if (!exclusions.length) return true;
  const restoreNote = isEditing ? "Les créneaux de cycle qui ne sont plus concernés par la nouvelle version de l'événement seront rétablis automatiquement." : "La suppression concerne uniquement la durée et la demi-journée de l'événement.";
  const message = `${exclusions.length} créneau(x) déjà renseigné(s) concernent les profs ou classes sélectionnés pour cet événement. Confirmer leur suppression ?\n\n${restoreNote}`;
  return window.confirm(message);
}
export function applySportEventChange(event, exclusions, isEditing) {
  if (isEditing) state.sportEvents = state.sportEvents.map(item => item.id === event.id ? event : item);else state.sportEvents.push(event);
  delete state.eventExclusions[event.id];
  if (exclusions.length) state.eventExclusions[event.id] = exclusions;
  saveSportEvents(false);
  saveEventExclusions(false);
  saveCloudPatchNow(["sportEvents", "eventExclusions"]);
  rebuildConstructionPlan();
}
export function resetAsForm() {
  state.editingAsId = null;
  state.asName = "";
  state.asStart = "2026-09-14";
  state.asEnd = "2027-06-04";
  state.asWeekdays = [];
  state.asTeacherIds = [];
}
export function saveAsSessionFromForm() {
  const session = {
    id: state.editingAsId || `as-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    planningId: state.cloudConfig.planningId,
    name: state.asName || "AS",
    start: state.asStart,
    end: state.asEnd,
    weekdays: [...state.asWeekdays],
    slotIds: [],
    teacherIds: [...state.asTeacherIds]
  };
  if (state.editingAsId) state.asSessions = state.asSessions.map(item => item.id === state.editingAsId ? session : item);else state.asSessions.push(session);
  saveAsSessions();
  resetAsForm();
}
