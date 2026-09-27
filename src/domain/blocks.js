import { escapeHtml } from "../ui/format.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { blockCycleConflictMessage, blockCycleUnavailableMessage, classParts, parseYearCellKey } from "./assignments.js";
import { applyBlockToCycle, skeletonBlockForStorage } from "./construction.js";
import { dateKey, rowDateForWeek, schoolYearWeeks, yearRows } from "./dates.js";
import { asBlockLabel, asSessionTeacherLabel, eventExclusionsFor } from "./events.js";
import { cycleForWeek } from "./hours.js";
import { isCollegeEstablishment } from "./settings.js";
import { blockUnavailableMessage, unavailableTeachersForCell } from "./unavailability.js";
import { isAnnualConstructionRule, rebuildConstructionPlan, saveAsExclusions, saveAsSessions, saveBlockExclusions, saveEventExclusions, saveSportEvents } from "../services/settings-storage.js";
import { dateOnly } from "./dates.js";
import { showValidationPopup } from "../ui/feedback.js";
import { eventClassSummary } from "../ui/format.js";

export function blockForRuleStorage(block) {
  const {
    ruleId,
    cycleId,
    cycleName,
    weekLetter,
    ...storedBlock
  } = block;
  return storedBlock;
}
export function movingBlockGhostHtml() {
  if (!state.movingBuildBlock) return "";
  const block = movingBlockPayload();
  if (!block) return "";
  const x = Number(state.movingBuildBlock.x || 0);
  const y = Number(state.movingBuildBlock.y || 0);
  return `<div class="movingBlockGhost" id="movingBlockGhost" style="left:${x}px;top:${y}px;"><strong>${escapeHtml(block.title)}</strong><span>${escapeHtml((block.detail || ""))}</span></div>`;
}
export function movingBlockPayload() {
  if (!state.movingBuildBlock) return null;
  if (state.movingBuildBlock.type === "course") {
    const block = state.constructionPlan[state.movingBuildBlock.key]?.[state.movingBuildBlock.index];
    return block ? {
      title: block.schoolClass || "Cours",
      detail: [block.facilityLabel || "", block.activityLabel || ""].filter(Boolean).join(" · "),
      raw: block
    } : null;
  }
  if (state.movingBuildBlock.type === "event") {
    const event = state.sportEvents.find(item => item.id === state.movingBuildBlock.id);
    return event ? {
      title: event.name || "Evenement sportif",
      detail: eventClassSummary(event),
      raw: event
    } : null;
  }
  if (state.movingBuildBlock.type === "as") {
    const session = state.asSessions.find(item => item.id === state.movingBuildBlock.id);
    return session ? {
      title: asBlockLabel(session),
      detail: asSessionTeacherLabel(session),
      raw: session
    } : null;
  }
  return null;
}
export function moveConstructionBlock(sourceKey, index, targetKey) {
  const block = state.constructionPlan[sourceKey]?.[index];
  if (!block || sourceKey === targetKey) return false;
  const targetParts = parseYearCellKey(targetKey);
  const targetRow = yearRows().find(item => item.id === targetParts.rowId);
  const targetWeek = schoolYearWeeks().find(item => item.rank === targetParts.weekRank);
  if (!targetRow || !targetWeek) return false;
  if (targetRow.isAs) {
    showValidationPopup("Impossible de déplacer un cours sur un créneau AS");
    return false;
  }
  const classLevel = classParts(block.schoolClass).level;
  const targetCycle = cycleForWeek(targetWeek, classLevel);
  if (!targetCycle) {
    showValidationPopup(isCollegeEstablishment() ? "Aucune période pour cette classe sur la case cible" : "Aucun cycle pour cette classe sur la case cible");
    return false;
  }
  const nextWeekLetter = block.weekLetter && block.weekLetter !== "all" ? targetWeek.letter : "all";
  const storedBlock = blockForRuleStorage(block);
  const unavailableMessage = blockUnavailableMessage(targetRow, targetWeek, storedBlock);
  const cycleUnavailableMessage = blockCycleUnavailableMessage(targetRow.id, targetCycle.id, storedBlock, nextWeekLetter);
  const conflictMessage = unavailableMessage || cycleUnavailableMessage || blockCycleConflictMessage(targetRow.id, targetCycle.id, storedBlock, block.ruleId, nextWeekLetter);
  if (conflictMessage) {
    showValidationPopup(conflictMessage);
    return false;
  }
  const rule = state.constructionRules.find(item => item.id === block.ruleId);
  if (rule) {
    rule.rowId = targetRow.id;
    if (isAnnualConstructionRule(rule)) {
      rule.cycleId = "year";
      rule.scope = "year";
    } else {
      rule.cycleId = targetCycle.id;
    }
    rule.classLevel = classLevel;
    rule.weekLetter = nextWeekLetter;
    rule.block = isAnnualConstructionRule(rule) ? skeletonBlockForStorage(storedBlock) : storedBlock;
    delete state.blockExclusions[rule.id];
    saveBlockExclusions();
    rebuildConstructionPlan();
  } else {
    removeBlockFromSingleSlot(sourceKey, block);
    applyBlockToCycle(targetRow.id, targetCycle.id, storedBlock, nextWeekLetter);
  }
  showValidationPopup("Bloc deplace");
  return true;
}
export function moveSportEventBlock(eventId, targetKey) {
  const event = state.sportEvents.find(item => item.id === eventId);
  if (!event) return false;
  const targetParts = parseYearCellKey(targetKey);
  const targetRow = yearRows().find(item => item.id === targetParts.rowId);
  const targetWeek = schoolYearWeeks().find(item => item.rank === targetParts.weekRank);
  if (!targetRow || !targetWeek) return false;
  const targetDate = rowDateForWeek(targetRow, targetWeek);
  const durationDays = Math.max(0, Math.round((dateOnly(event.end) - dateOnly(event.start)) / 86400000));
  const nextEnd = new Date(targetDate);
  nextEnd.setDate(nextEnd.getDate() + durationDays);
  const nextEvent = {
    ...event,
    start: dateKey(targetDate),
    end: dateKey(nextEnd),
    halfDay: `slot-${targetRow.slot.id}`
  };
  const exclusions = eventExclusionsFor(nextEvent);
  state.sportEvents = state.sportEvents.map(item => item.id === eventId ? nextEvent : item);
  delete state.eventExclusions[eventId];
  if (exclusions.length) state.eventExclusions[eventId] = exclusions;
  saveSportEvents();
  saveEventExclusions();
  rebuildConstructionPlan();
  showValidationPopup("Evenement deplace");
  return true;
}
export function moveAsBlock(sessionId, targetKey) {
  const session = state.asSessions.find(item => item.id === sessionId);
  if (!session) return false;
  const targetParts = parseYearCellKey(targetKey);
  const targetRow = yearRows().find(item => item.id === targetParts.rowId);
  const targetWeek = schoolYearWeeks().find(item => item.rank === targetParts.weekRank);
  if (!targetRow || !targetWeek) return false;
  if (!targetRow.isAs) {
    showValidationPopup("Une AS doit rester sur un créneau AS");
    return false;
  }
  const blockedTeacherIds = unavailableTeachersForCell(targetRow, targetWeek, true);
  if ((session.teacherIds || []).some(teacherId => blockedTeacherIds.has(teacherId))) {
    showValidationPopup("Impossible de déplacer l'AS : un professeur est indisponible sur ce créneau");
    return false;
  }
  state.asSessions = state.asSessions.map(item => item.id === sessionId ? {
    ...item,
    weekdays: [targetRow.day],
    slotIds: [targetRow.slot.id]
  } : item);
  delete state.asExclusions[sessionId];
  saveAsSessions();
  saveAsExclusions();
  showValidationPopup("AS deplacee");
  return true;
}
export function moveSelectedBlockTo(targetKey) {
  if (!state.movingBuildBlock) return false;
  if (state.movingBuildBlock.type === "event") return moveSportEventBlock(state.movingBuildBlock.id, targetKey);
  if (state.movingBuildBlock.type === "as") return moveAsBlock(state.movingBuildBlock.id, targetKey);
  return moveConstructionBlock(state.movingBuildBlock.key, state.movingBuildBlock.index, targetKey);
}
export function startMovingBuildBlock(payload, x = 0, y = 0, suppressImmediateCellClick = false) {
  state.movingBuildBlock = {
    type: payload.type,
    key: payload.key,
    index: Number(payload.index),
    id: payload.id,
    x,
    y
  };
  if (suppressImmediateCellClick) {
    state.ignoreNextMoveCellClick = true;
    setTimeout(() => {
      state.ignoreNextMoveCellClick = false;
    }, 350);
  }
  state.activeBuildCell = null;
  state.editingBuildBlock = null;
  showValidationPopup("Bloc sélectionné : cliquez sur la case cible");
  render();
}
export function removeBlockFromCycle(rowId, blockIndex, block) {
  if (block.ruleId) {
    state.constructionRules = state.constructionRules.filter(rule => rule.id !== block.ruleId);
    delete state.blockExclusions[block.ruleId];
  } else {
    state.constructionRules = state.constructionRules.filter(rule => !(rule.rowId === rowId && rule.cycleId === block.cycleId));
  }
  saveBlockExclusions();
  rebuildConstructionPlan();
}
export function removeBlockFromSingleSlot(key, block) {
  if (!block.ruleId) return removeBlockFromCycle(parseYearCellKey(key).rowId, 0, block);
  state.constructionRules = state.constructionRules.filter(rule => rule.id !== block.ruleId);
  delete state.blockExclusions[block.ruleId];
  saveBlockExclusions();
  rebuildConstructionPlan();
}
export function removeConstructionBlock(key, index) {
  if (!state.constructionPlan[key]) return;
  const block = state.constructionPlan[key][index];
  if (!block) return;
  state.pendingBlockDelete = {
    key,
    index
  };
}
export function confirmBlockDeletion(scope) {
  if (!state.pendingBlockDelete) return;
  const {
    key,
    index
  } = state.pendingBlockDelete;
  const block = state.constructionPlan[key]?.[index];
  state.pendingBlockDelete = null;
  if (!block) return;
  if (scope === "cycle") removeBlockFromCycle(parseYearCellKey(key).rowId, index, block);
  if (scope === "slot") removeBlockFromSingleSlot(key, block);
  showValidationPopup(scope === "cycle" ? "Créneau supprimé du cycle" : "Créneau supprimé");
}
export function confirmSlotItemDeletion(label) {
  const firstConfirm = window.confirm(`Supprimer ${label} uniquement sur ce créneau ?`);
  if (!firstConfirm) return false;
  return window.confirm("Confirmer une deuxième fois la suppression sur ce créneau ?");
}
export function excludeEventFromSlot(eventId, key) {
  const event = state.sportEvents.find(item => item.id === eventId);
  if (!event || !confirmSlotItemDeletion(`l'evenement ${event.name || "sportif"}`)) return;
  const existing = state.eventExclusions[eventId] || [];
  if (!existing.includes(key)) state.eventExclusions[eventId] = [...existing, key];
  saveEventExclusions();
  showValidationPopup("Événement supprimé du créneau");
  render();
}
export function excludeAsFromSlot(sessionId, key) {
  const session = state.asSessions.find(item => item.id === sessionId);
  if (!session || !window.confirm(`Supprimer l'AS ${session.name || ""} uniquement sur ce créneau ?`.trim())) return;
  const existing = state.asExclusions[sessionId] || [];
  if (!existing.includes(key)) state.asExclusions[sessionId] = [...existing, key];
  saveAsExclusions();
  showValidationPopup("AS supprimée du créneau");
  render();
}
