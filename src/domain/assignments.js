import { state } from "../app/state.js";
import { ruleRowLabel } from "./conflict-summary.js";
import { detectConflicts } from "./conflicts.js";
import { schoolYearWeeks, yearRows } from "./dates.js";
import { classicConstructionCycles, cycleForWeek, weeksForCycle } from "./hours.js";
import { annualConstructionRules } from "./readiness.js";
import { cycleLabel, displayCycleName } from "./settings.js";
import { blockUnavailableMessage, unavailableClassesForCell, unavailableFacilitiesForCell, unavailableTeachersForCell } from "./unavailability.js";
import { isAdmin } from "../services/auth.js";
import { cloudReady, cloudSaveToRemote, cloudWriteAllowed, cloudWriteBlockedMessage, markLocalChangedForCloud } from "../services/cloud.js";
import { cachedConstructionCheck } from "../services/planning-storage.js";
import { activityProgramForClass, baseClassFromGroupedClass, blockWithCycleOverride, classNumbersForLevel, classesForLevel, constructionCycleForBlockById, constructionCycleForRuleById, constructionCyclesForRule, cyclesRepresentSameSlot, normalizeConstructionRuleClassReferences, normalizeSchoolClassId, normalizedOptionCycleIds, rebuildConstructionPlan, saveBlockExclusions, saveConstructionVersions, saveServiceAssignments, shadeColor, specialClassBaseIdFromSchoolId, specialClassFromSchoolId, specialClassGroupFromSchoolId, specialClassHoursForSchoolClass, specialClassSchoolId, specialClassTypeIdFromSchoolId } from "../services/settings-storage.js";
import { showValidationPopup } from "../ui/feedback.js";
import { compactClassName } from "../ui/format.js";

export function constructionVersionLabel(version) {
  const date = version?.savedAt ? new Date(version.savedAt) : null;
  const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }) : "";
  return [version?.name || "Version manuelle", dateLabel].filter(Boolean).join(" - ");
}
export function constructionVersionPartOptions() {
  return [{
    id: "blocks",
    label: "Blocs profs/classes"
  }, ...classicConstructionCycles().map((cycle, index) => ({
    id: `cycle:${cycle.id}`,
    label: displayCycleName(cycle) || `${cycleLabel()} ${index + 1}`
  }))];
}
export function normalizeConstructionVersionParts(parts) {
  const validIds = constructionVersionPartOptions().map(item => item.id);
  if (!Array.isArray(parts) || !parts.length) return [...validIds];
  const normalized = parts.filter((part, index) => validIds.includes(part) && parts.indexOf(part) === index);
  return normalized.length ? normalized : [...validIds];
}
export function constructionVersionPartsLabel(version) {
  const labels = new Map(constructionVersionPartOptions().map(item => [item.id, item.label]));
  return normalizeConstructionVersionParts(version?.parts).map(part => labels.get(part) || part.replace("cycle:", "Cycle ")).join(" + ");
}
export function saveCurrentConstructionVersion(name = "", parts = constructionVersionPartOptions().map(item => item.id)) {
  const savedAt = new Date().toISOString();
  const versionName = String(name || "").trim() || `Version ${state.constructionVersions.length + 1}`;
  const savedParts = normalizeConstructionVersionParts(parts);
  state.constructionVersions = [{
    id: `construction-version-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: versionName,
    mode: state.constructionWorkspaceMode,
    parts: savedParts,
    savedAt,
    constructionRules: JSON.parse(JSON.stringify(state.constructionRules)),
    blockExclusions: JSON.parse(JSON.stringify(state.blockExclusions))
  }, ...state.constructionVersions].slice(0, 12);
  saveConstructionVersions();
}
export function restoreConstructionVersion(versionId) {
  const version = state.constructionVersions.find(item => item.id === versionId);
  if (!version) return false;
  const parts = normalizeConstructionVersionParts(version.parts);
  const cycleIds = parts.filter(part => part.startsWith("cycle:")).map(part => part.slice(6));
  const savedRules = Array.isArray(version.constructionRules) ? JSON.parse(JSON.stringify(version.constructionRules)).map(normalizeConstructionRuleClassReferences) : [];
  const savedById = new Map(savedRules.map(rule => [rule.id, rule]));
  if (parts.includes("blocks")) {
    const currentOverridesById = new Map(state.constructionRules.map(rule => [rule.id, rule.cycleOverrides || {}]));
    state.constructionRules = savedRules.map(rule => {
      const savedOverrides = rule.cycleOverrides || {};
      const mergedOverrides = {
        ...(currentOverridesById.get(rule.id) || {})
      };
      cycleIds.forEach(cycleId => {
        if (savedOverrides[cycleId]) mergedOverrides[cycleId] = JSON.parse(JSON.stringify(savedOverrides[cycleId]));else delete mergedOverrides[cycleId];
      });
      return {
        ...rule,
        cycleOverrides: mergedOverrides
      };
    });
    if (version.blockExclusions && typeof version.blockExclusions === "object") {
      state.blockExclusions = JSON.parse(JSON.stringify(version.blockExclusions));
      saveBlockExclusions();
    }
  } else if (cycleIds.length) {
    state.constructionRules = state.constructionRules.map(rule => {
      const savedRule = savedById.get(rule.id);
      if (!savedRule) return rule;
      const savedOverrides = savedRule.cycleOverrides || {};
      const mergedOverrides = {
        ...(rule.cycleOverrides || {})
      };
      cycleIds.forEach(cycleId => {
        if (savedOverrides[cycleId]) mergedOverrides[cycleId] = JSON.parse(JSON.stringify(savedOverrides[cycleId]));else delete mergedOverrides[cycleId];
      });
      return {
        ...rule,
        cycleOverrides: mergedOverrides
      };
    });
  }
  rebuildConstructionPlan();
  return true;
}
export function promoteRestoredConstructionVersionToCloud() {
  clearTimeout(state.cloudSaveTimer);
  state.cloudSaveTimer = null;
  state.cloudSaveQueued = false;
  state.cloudSourceLoaded = true;
  markLocalChangedForCloud(["constructionRules", "constructionPlan", "blockExclusions"]);
  if (isAdmin() && cloudReady() && cloudWriteAllowed() && state.cloudConfig.autoSave) {
    state.cloudStatus = "Version restaurée : sauvegarde Supabase en cours...";
    cloudSaveToRemote(false);
  } else {
    state.cloudStatus = cloudReady() ? cloudWriteBlockedMessage() : "Version restaurée localement. Cloud non configuré.";
  }
}
export function conflictBelongsToBuildMode(conflict, buildMode) {
  if (buildMode === "blocks") return ["teacher", "class", "asTeacher"].includes(conflict.type);
  if (buildMode === "cycleDetails") return conflict.type === "facility";
  return true;
}
export function cycleDetailConflictCycleLabel(conflict) {
  const cycleNames = [...new Set((conflict.items || []).map(item => item.cycleName).filter(Boolean))];
  if (cycleNames.length === 1) return cycleNames[0];
  if (cycleNames.length > 1) return cycleNames.join(" / ");
  const cycle = cycleForWeek(conflict.weekItem);
  return cycle?.name || "";
}
export function cycleDetailConflictCycleKey(conflict) {
  const cycleIds = [...new Set((conflict.items || []).map(item => item.cycleId || "").filter(Boolean))].sort();
  if (cycleIds.length) return cycleIds.join("|");
  const cycle = cycleForWeek(conflict.weekItem);
  return cycle?.id || `week-${conflict.weekItem?.rank || ""}`;
}
export function cycleDetailConflictWeekType(conflict) {
  const letters = [...new Set((conflict.items || []).map(item => item.weekLetter || "all").filter(Boolean))].sort();
  return letters.length === 1 ? letters[0] : letters.join("+");
}
export function aggregateCycleDetailConflicts(conflicts) {
  const grouped = new Map();
  conflicts.filter(conflict => conflict.type === "facility").forEach(conflict => {
    const facility = conflict.facility || conflict.items?.[0]?.facilityId || conflict.items?.[0]?.facilityLabel || "";
    const key = [conflict.row?.id || "", facility, cycleDetailConflictCycleKey(conflict), cycleDetailConflictWeekType(conflict)].join("::");
    const existing = grouped.get(key);
    if (existing) {
      const itemKeys = new Set(existing.items.map(item => `${item.ruleId || ""}:${item.index ?? ""}:${teacherLabelForBlock(item)}:${blockClassLabel(item)}`));
      (conflict.items || []).forEach(item => {
        const itemKey = `${item.ruleId || ""}:${item.index ?? ""}:${teacherLabelForBlock(item)}:${blockClassLabel(item)}`;
        if (!itemKeys.has(itemKey)) {
          existing.items.push(item);
          itemKeys.add(itemKey);
        }
      });
      existing.weeks.push(conflict.weekItem);
      return;
    }
    grouped.set(key, {
      ...conflict,
      key,
      cycleLabel: cycleDetailConflictCycleLabel(conflict),
      weekType: cycleDetailConflictWeekType(conflict),
      weeks: [conflict.weekItem],
      items: [...(conflict.items || [])]
    });
  });
  return [...grouped.values()];
}
export function conflictItemIdentity(item) {
  return [item.ruleId || "", item.cycleId || "", item.weekLetter || "", teacherLabelForBlock(item), blockClassLabel(item), item.facilityId || item.facilityLabel || ""].join(":");
}
export function acceptedConflictKey(conflict, buildMode = state.constructionBuildMode) {
  const itemKey = (conflict.items || []).map(conflictItemIdentity).sort().join("|");
  const scopeKey = buildMode === "cycleDetails" ? [conflict.key, conflict.cycleLabel || "", conflict.weekType || ""].join(":") : conflict.key;
  return [buildMode || "all", conflict.type || "", scopeKey, conflict.facility || "", conflict.teacher || "", conflict.schoolClass || "", itemKey].join("::");
}
export function acceptedConflictKeys() {
  return new Set(state.acceptedConflicts.map(item => item.key));
}
export function filterAcceptedConflicts(conflicts, buildMode = state.constructionBuildMode) {
  const acceptedKeys = acceptedConflictKeys();
  return conflicts.filter(conflict => !acceptedKeys.has(acceptedConflictKey(conflict, buildMode)));
}
export function allConflictsForBuildMode(buildMode = "") {
  if (!buildMode) return detectConflicts();
  return cachedConstructionCheck(`allConflicts:${buildMode}`, () => {
    const conflicts = detectConflicts().filter(conflict => conflictBelongsToBuildMode(conflict, buildMode));
    return buildMode === "cycleDetails" ? aggregateCycleDetailConflicts(conflicts) : conflicts;
  });
}
export function conflictsForBuildMode(buildMode = "") {
  if (!buildMode) return detectConflicts();
  return cachedConstructionCheck(`conflicts:${buildMode}`, () => filterAcceptedConflicts(allConflictsForBuildMode(buildMode), buildMode));
}
export function conflictMap(buildMode = "") {
  const cacheKey = buildMode ? `conflictMap:${buildMode}` : "conflictMap";
  return cachedConstructionCheck(cacheKey, () => {
    if (!buildMode) {
      return new Set([...conflictMap("blocks"), ...conflictMap("cycleDetails")]);
    }
    if (buildMode === "cycleDetails") {
      const rawConflicts = detectConflicts().filter(conflict => conflictBelongsToBuildMode(conflict, buildMode));
      const activeConflicts = filterAcceptedConflicts(aggregateCycleDetailConflicts(rawConflicts), buildMode);
      return new Set(activeConflicts.flatMap(conflict => (conflict.weeks || [conflict.weekItem]).map(weekItem => yearCellKey(conflict.row.id, weekItem.rank))));
    }
    return new Set(conflictsForBuildMode(buildMode).map(conflict => conflict.key));
  });
}
export function builderCellKey(day, slotId) {
  return `${day}-${slotId}`;
}
export function yearCellKey(rowId, weekRank) {
  return `${rowId}::${weekRank}`;
}
export function parseYearCellKey(key) {
  const [rowId, weekRank] = key.split("::");
  return {
    rowId,
    weekRank: Number(weekRank)
  };
}
export function teacherIdsForBlock(block) {
  const ids = Array.isArray(block.teacherIds) && block.teacherIds.length ? block.teacherIds : [block.teacherId].filter(Boolean);
  return ids.filter((id, index) => ids.indexOf(id) === index);
}
export function teacherClassForBlock(block, teacherId) {
  if (teacherId && block?.teacherClasses?.[teacherId]) return block.teacherClasses[teacherId];
  const ids = teacherIdsForBlock(block);
  if (!teacherId || ids.length <= 1 || ids[0] === teacherId) return block?.schoolClass || "";
  return "";
}
export function classesForBlock(block) {
  const classItems = teacherIdsForBlock(block).map(teacherId => teacherClassForBlock(block, teacherId)).filter(Boolean);
  if (block?.schoolClass) classItems.push(block.schoolClass);
  return classItems.filter((schoolClass, index) => classItems.indexOf(schoolClass) === index);
}
export function blockClassLabel(block) {
  const classItems = classesForBlock(block);
  if (!classItems.length && block?.optionBlock) return block.optionLabel || block.activityLabel || "Option";
  if (!classItems.length) return block?.label || "Bloc";
  return classItems.map(compactClassName).join(" + ");
}
export function blockDetailLabel(block) {
  const details = [block?.facilityLabel || block?.type || "", block?.activityLabel || ""].filter(item => item && item !== blockClassLabel(block));
  return details.join(" · ");
}
export function teacherNamesForBlock(block) {
  return teacherIdsForBlock(block).map(id => state.teachers.find(teacher => teacher.id === id)?.name || id);
}
export function teacherLabelForBlock(block) {
  return block.teacherNames || teacherNamesForBlock(block).join(" + ") || block.teacherName || "Prof";
}
export function clampCourseHours(value, maxHours) {
  const max = Math.max(0.5, Number(maxHours) || 0.5);
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return max;
  return Math.min(max, Math.max(0.25, hours));
}
export function coTeacherHoursForBlock(block, teacherId, slotHours) {
  const ids = teacherIdsForBlock(block);
  if (!teacherId || ids.indexOf(teacherId) <= 0) return Number(slotHours) || 0;
  return Number(slotHours) || 0;
}
export function teacherHoursForBlock(block, teacherId, slotHours) {
  const ids = teacherIdsForBlock(block);
  if (!ids.includes(teacherId)) return 0;
  return ids.indexOf(teacherId) === 0 ? Number(slotHours) || 0 : coTeacherHoursForBlock(block, teacherId, slotHours);
}
export function effectiveTeacherHoursForBlock(block, teacherId, slotHours) {
  if (block?.optionBlock && block.optionId) {
    if (block.optionTeacherId && block.optionTeacherId !== teacherId) return 0;
    return normalizedOptionHours(block.optionId, block.optionHours, slotHours);
  }
  return teacherHoursForBlock(block, teacherId, slotHours);
}
export function fullServiceSlotHours(rowOrSlot) {
  const slot = rowOrSlot?.slot || rowOrSlot || {};
  const rawHours = Number(slot.hours) || 0;
  if (rawHours <= 1.25) return 1;
  return 2;
}
export function currentBlockSlotHours() {
  if (!state.activeBuildCell) return 2;
  const {
    rowId
  } = parseYearCellKey(state.activeBuildCell);
  return fullServiceSlotHours(yearRows().find(item => item.id === rowId));
}
export function secondaryTeacherLabel(block, slotHours) {
  const ids = teacherIdsForBlock(block);
  if (ids.length < 2) return "";
  const name = state.teachers.find(teacher => teacher.id === ids[1])?.name || "2e prof";
  return `${name} : créneau complet`;
}
export function blockTeacherStyle(block) {
  const blockTeachers = teacherIdsForBlock(block).map(id => state.teachers.find(teacher => teacher.id === id)).filter(Boolean);
  if (blockTeachers.length >= 2) {
    const first = blockTeachers[0];
    const second = blockTeachers[1];
    return `background:linear-gradient(90deg, ${first.color} 0 50%, ${second.color} 50% 100%);border-color:${first.border}`;
  }
  return `background:${block.color};border-color:${block.border}`;
}
export function transparentTeacherColor(color, alpha = 0.34) {
  const raw = (color || "#ffffff").replace("#", "");
  const normalized = raw.length === 3 ? raw.split("").map(char => char + char).join("") : raw.padEnd(6, "f").slice(0, 6);
  const value = parseInt(normalized, 16);
  if (!Number.isFinite(value)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${value >> 16 & 255},${value >> 8 & 255},${value & 255},${alpha})`;
}
export function availableTeacherIdsForConstructionCell(row, weekItem, key, cycle = null, weekLetter = "all") {
  if (!row || !weekItem || row.isAs) return [];
  const busyTeacherIds = new Set();
  const weekItems = cycle ? weeksForCycle(cycle).filter(item => weekLetter === "all" || item.letter === weekLetter) : [weekItem];
  weekItems.forEach(item => {
    const itemKey = yearCellKey(row.id, item.rank);
    (state.constructionPlan[itemKey] || []).forEach(block => {
      teacherIdsForBlock(block).forEach(teacherId => busyTeacherIds.add(teacherId));
    });
    unavailableTeachersForCell(row, item).forEach(teacherId => busyTeacherIds.add(teacherId));
  });
  return state.teachers.filter(teacher => !busyTeacherIds.has(teacher.id)).map(teacher => teacher.id);
}
export function availableTeacherCellStyle(row, weekItem, key, blocked, cycle = null, weekLetter = "all") {
  if (blocked) return "";
  const availableTeachers = availableTeacherIdsForConstructionCell(row, weekItem, key, cycle, weekLetter).map(teacherId => state.teachers.find(teacher => teacher.id === teacherId)).filter(Boolean);
  if (!availableTeachers.length) return "";
  const step = 100 / availableTeachers.length;
  const stops = availableTeachers.flatMap((teacher, index) => {
    const start = (index * step).toFixed(2);
    const end = ((index + 1) * step).toFixed(2);
    const color = transparentTeacherColor(teacher.color);
    return [`${color} ${start}%`, `${color} ${end}%`];
  });
  if (availableTeachers.length === 1) {
    return `--available-teacher-bg:linear-gradient(90deg, ${stops.join(", ")});`;
  }
  const boundaries = availableTeachers.slice(1).map((_, index) => ((index + 1) * step).toFixed(2));
  const dots = boundaries.map(() => "repeating-linear-gradient(to bottom, rgba(15,23,42,0.52) 0 2px, transparent 2px 6px)");
  return [`--available-teacher-bg:linear-gradient(90deg, ${stops.join(", ")});`, `--available-teacher-dots:${dots.join(", ")};`, `--available-teacher-dot-positions:${boundaries.map(boundary => `${boundary}% 0`).join(", ")};`, `--available-teacher-dot-repeats:${boundaries.map(() => "repeat-y").join(", ")};`, `--available-teacher-dot-sizes:${boundaries.map(() => "2px 6px").join(", ")};`].join("");
}
export function availableTeacherCellTitle(row, weekItem, key, cycle = null, weekLetter = "all") {
  const names = availableTeacherIdsForConstructionCell(row, weekItem, key, cycle, weekLetter).map(teacherId => state.teachers.find(teacher => teacher.id === teacherId)?.name).filter(Boolean);
  return names.length ? `Profs disponibles : ${names.join(", ")}` : "Aucun prof disponible";
}
export function blockAllowsSharedFacility(block) {
  return Boolean(block?.coIntervention);
}
export function blocksCanShareFacility(first, second) {
  if (!first?.facilityId || first.facilityId !== second?.facilityId) return false;
  if (!blockAllowsSharedFacility(first) && !blockAllowsSharedFacility(second)) return false;
  const sharedTeacher = teacherIdsForBlock(first).some(teacherId => teacherIdsForBlock(second).includes(teacherId));
  if (sharedTeacher) return false;
  if (classesForBlock(first).some(firstClass => classesForBlock(second).some(secondClass => classesOverlap(firstClass, secondClass)))) return false;
  return true;
}
export function teacherBorderForColor(color) {
  return state.teacherPalette.find(item => item.color === color)?.border || shadeColor(color, -80);
}
export function renderTeacherLegend(className = "", interactive = true) {
  if (!interactive) {
    return `<div class="teacherColorLegend ${className}">
            ${state.teachers.map(teacher => `<span class="legendItem" style="background:${teacher.color};border-color:${teacher.border}">${teacher.name}</span>`).join("")}
          </div>`;
  }
  const allSelected = allTeachersSelected();
  return `<div class="teacherColorLegend ${className}">
          <button class="legendItem ${allSelected ? "selected" : ""}" data-teacher="all" style="background:#d6b98c;border-color:#a6783e;color:#172033;">Tous</button>
          ${state.teachers.map(teacher => {
    const selected = state.selectedTeacherIds.includes(teacher.id);
    return `<button class="legendItem ${selected && !allSelected ? "selected" : ""} ${!selected ? "dimmed" : ""}" data-teacher="${teacher.id}" style="background:${teacher.color};border-color:${teacher.border}">${teacher.name}</button>`;
  }).join("")}
        </div>`;
}
export function availableTeacherPalette(currentTeacherId = "") {
  const usedColors = new Set(state.teachers.filter(teacher => teacher.id !== currentTeacherId).map(teacher => teacher.color));
  return state.teacherPalette.filter(item => !usedColors.has(item.color));
}
export function firstAvailableTeacherColor(currentTeacherId = "") {
  return availableTeacherPalette(currentTeacherId)[0]?.color || "";
}
export function syncConstructionRulesForTeacher(teacherId) {
  state.constructionRules = state.constructionRules.map(rule => {
    const ids = teacherIdsForBlock(rule.block);
    if (!ids.includes(teacherId)) return rule;
    const primaryTeacher = state.teachers.find(teacher => teacher.id === ids[0]);
    return {
      ...rule,
      block: {
        ...rule.block,
        color: primaryTeacher?.color || rule.block.color,
        border: primaryTeacher?.border || rule.block.border,
        teacherName: primaryTeacher?.name || rule.block.teacherName,
        teacherNames: teacherNamesForBlock({
          ...rule.block,
          teacherIds: ids
        }).join(" + ")
      }
    };
  });
}
export function blockConflictMessageForItems(items, candidate) {
  const facilityConflict = items.find(item => item.facilityId && candidate.facilityId && item.facilityId === candidate.facilityId && !blocksCanShareFacility(item, candidate));
  if (facilityConflict) return `Installation déjà occupée : ${candidate.facilityLabel}.`;
  const teacherConflict = items.find(item => teacherIdsForBlock(item).some(teacherId => teacherIdsForBlock(candidate).includes(teacherId) && teacherClassForBlock(item, teacherId) !== teacherClassForBlock(candidate, teacherId)));
  if (teacherConflict) return `Professeur déjà pris avec ${blockClassLabel(teacherConflict) || "une autre classe"}.`;
  const classConflict = items.find(item => classesForBlock(item).some(itemClass => classesForBlock(candidate).some(candidateClass => classesOverlap(itemClass, candidateClass))));
  if (classConflict) return `Classe déjà prise : ${blockClassLabel(candidate)}.`;
  return "";
}
export function blockCycleConflictMessage(rowId, cycleId, candidate, ignoredRuleId = "", weekLetter = "all", showWeekDetail = true) {
  const cycle = constructionCycleForBlockById(candidate, cycleId);
  if (!cycle) return "";
  for (const weekItem of weeksForCycle(cycle)) {
    if (weekLetter !== "all" && weekItem.letter !== weekLetter) continue;
    const key = yearCellKey(rowId, weekItem.rank);
    const items = (state.constructionPlan[key] || []).filter(item => !ignoredRuleId || item.ruleId !== ignoredRuleId);
    const message = blockConflictMessageForItems(items, candidate);
    if (message) return showWeekDetail ? `${message} Conflit sur la semaine ${weekItem.rank}${weekItem.letter}.` : `${message} Conflit sur ce cycle.`;
  }
  return "";
}
export function blockCycleUnavailableMessage(rowId, cycleId, candidate, weekLetter = "all") {
  const cycle = constructionCycleForBlockById(candidate, cycleId);
  const row = yearRows().find(item => item.id === rowId);
  if (!cycle || !row) return "";
  for (const weekItem of weeksForCycle(cycle)) {
    if (weekLetter !== "all" && weekItem.letter !== weekLetter) continue;
    const message = blockUnavailableMessage(row, weekItem, candidate);
    if (message) return `${message} Bloc impossible sur la semaine ${weekItem.rank}${weekItem.letter}.`;
  }
  return "";
}
export function allTeachersSelected() {
  return state.selectedTeacherIds.length === state.teachers.length;
}
export function teacherSelectionMatches(ids) {
  return state.selectedTeacherIds.length > 0 && (allTeachersSelected() || ids.some(id => state.selectedTeacherIds.includes(id)));
}
export function blockMatchesTeacherSelection(block) {
  return teacherSelectionMatches(teacherIdsForBlock(block));
}
export function eventMatchesTeacherSelection(event) {
  return teacherSelectionMatches(event.teacherIds || []);
}
export function asMatchesTeacherSelection(session) {
  return teacherSelectionMatches(session.teacherIds || []);
}
export function serviceRowsForTeacher(teacherId) {
  return Array.isArray(state.serviceAssignments[teacherId]) ? state.serviceAssignments[teacherId] : [];
}
export function serviceClassRowsForTeacher(teacherId) {
  return serviceRowsForTeacher(teacherId).filter(row => row.classId);
}
export function serviceFreeRowsForTeacher(teacherId) {
  return serviceRowsForTeacher(teacherId).filter(row => row.freeService);
}
export function serviceTotalForTeacher(teacherId) {
  return serviceRowsForTeacher(teacherId).reduce((sum, row) => sum + (Number(row.hours) || 0), 0);
}
export function serviceTargetForTeacher(teacher) {
  return Math.max(Number(teacher?.weeklyReference) || 0, serviceTotalForTeacher(teacher?.id));
}
export function serviceFreeActivityId(label) {
  const base = String(label || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service-libre";
  return `service-free::${base}`;
}
export function serviceFreeActivities() {
  const seen = new Set();
  return Object.values(state.serviceAssignments).flatMap(rows => Array.isArray(rows) ? rows : []).filter(row => row.freeService && String(row.label || "").trim()).map(row => {
    const label = String(row.label || "").trim();
    return {
      id: serviceFreeActivityId(label),
      label,
      freeService: true
    };
  }).filter(activity => {
    const key = activity.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function serviceFreeActivityById(activityId) {
  return serviceFreeActivities().find(activity => activity.id === activityId) || null;
}
export function constructionActivityById(activityId) {
  return state.activities.find(activity => activity.id === activityId) || serviceFreeActivityById(activityId);
}
export function serviceFreeOptionId(teacherId, rowId) {
  return `service-option::${teacherId}::${rowId}`;
}
export function serviceFreeOptionsForTeachers(teacherIds = []) {
  return teacherIds.flatMap(teacherId => serviceFreeRowsForTeacher(teacherId).map(row => ({
    id: serviceFreeOptionId(teacherId, row.id),
    teacherId,
    rowId: row.id,
    label: row.label,
    hours: Number(row.hours) || 0,
    teacherName: state.teachers.find(teacher => teacher.id === teacherId)?.name || teacherId
  })));
}
export function serviceFreeOptionById(optionId) {
  return serviceFreeOptionsForTeachers(state.teachers.map(teacher => teacher.id)).find(option => option.id === optionId) || null;
}
export function optionBlockAvailableForTeachers(teacherIds = state.blockTeacherIds) {
  return teacherIds.length > 0 && teacherIds.every(teacherId => serviceFreeRowsForTeacher(teacherId).length > 0);
}
export function optionBlockUnavailableReason(teacherIds = state.blockTeacherIds) {
  if (!teacherIds.length) return "Selectionnez d'abord un professeur pour voir ses options.";
  const missingTeachers = teacherIds.filter(teacherId => !serviceFreeRowsForTeacher(teacherId).length).map(teacherId => state.teachers.find(teacher => teacher.id === teacherId)?.name || teacherId);
  if (missingTeachers.length) return `${missingTeachers.join(" + ")} n'a pas d'option renseignée dans le service théorique.`;
  return "Option disponible.";
}
export function optionDurationMax(optionId, slotHours = currentBlockSlotHours()) {
  const option = serviceFreeOptionById(optionId);
  if (!option) return 0;
  return Number(option.hours) || 0;
}
export function normalizedOptionHours(optionId, value, slotHours = currentBlockSlotHours()) {
  const fallback = optionDurationMax(optionId, slotHours);
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return fallback || 0;
  return Math.max(0.25, hours);
}
export function serviceAssignmentFor(teacherId, schoolClass) {
  return serviceClassRowsForTeacher(teacherId).find(item => item.classId === schoolClass);
}
export function serviceClassTarget(schoolClass) {
  const parts = classParts(schoolClass);
  if (parts.special) return specialClassHoursForSchoolClass(schoolClass);
  const level = parts.level;
  const legalTarget = Number(state.defaultServiceHours[level] ?? 0);
  const configuredTarget = Number(state.serviceHoursByLevel[level] ?? legalTarget);
  return legalTarget ? Math.min(configuredTarget, legalTarget) : configuredTarget;
}
export function selectedServiceLevelForTeacher(teacherId) {
  return state.classLevels.includes(state.serviceLevelByTeacher[teacherId]) ? state.serviceLevelByTeacher[teacherId] : "";
}
export function selectedServiceClassForTeacher(teacherId) {
  return state.classes.includes(state.serviceClassByTeacher[teacherId]) ? state.serviceClassByTeacher[teacherId] : "";
}
export function serviceDraftKey(teacherId, schoolClass) {
  return `${teacherId}::${schoolClass}`;
}
export function serviceDraftValue(teacherId, schoolClass) {
  const key = serviceDraftKey(teacherId, schoolClass);
  if (state.serviceDraftHours[key] !== undefined) return state.serviceDraftHours[key];
  const assignment = serviceAssignmentFor(teacherId, schoolClass);
  if (assignment) return assignment.hours;
  const maxHours = serviceMaxAssignableHours(teacherId, schoolClass);
  return maxHours > 0 ? maxHours : "";
}
export function serviceClassTotals() {
  const totals = Object.fromEntries(state.classes.map(schoolClass => [schoolClass, 0]));
  Object.values(state.serviceAssignments).forEach(rows => {
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
      if (!state.classes.includes(row.classId)) return;
      totals[row.classId] += Number(row.hours) || 0;
    });
  });
  return totals;
}
export function serviceClassAssignedTotal(schoolClass, exceptTeacherId = "") {
  return Object.entries(state.serviceAssignments).reduce((sum, [teacherId, rows]) => {
    if (teacherId === exceptTeacherId || !Array.isArray(rows)) return sum;
    return sum + rows.filter(row => row.classId === schoolClass).reduce((rowSum, row) => rowSum + (Number(row.hours) || 0), 0);
  }, 0);
}
export function serviceMaxAssignableHours(teacherId, schoolClass) {
  const target = serviceClassTarget(schoolClass);
  const assignedElsewhere = serviceClassAssignedTotal(schoolClass, teacherId);
  return Math.max(0, Math.round((target - assignedElsewhere) * 10) / 10);
}
export function serviceClassHoursValid(teacherId, schoolClass, hours) {
  const value = Number(hours) || 0;
  return value > 0 && value <= serviceMaxAssignableHours(teacherId, schoolClass);
}
export function serviceFreeDraftForTeacher(teacherId) {
  return state.serviceFreeDrafts[teacherId] || {
    label: "",
    hours: ""
  };
}
export function syncServiceFreeDraft(teacherId) {
  const labelInput = document.querySelector(`[data-service-free-label="${teacherId}"]`);
  const hoursInput = document.querySelector(`[data-service-free-hours="${teacherId}"]`);
  const validateButton = document.querySelector(`[data-service-free-validate="${teacherId}"]`);
  const draft = {
    label: labelInput?.value || "",
    hours: hoursInput?.value || ""
  };
  state.serviceFreeDrafts = {
    ...state.serviceFreeDrafts,
    [teacherId]: draft
  };
  if (validateButton) validateButton.disabled = !(draft.label.trim() && Number(draft.hours) > 0);
}
export function setServiceFreeAssignment(teacherId, label, hours) {
  const value = Math.max(0, Number(hours) || 0);
  const cleanLabel = label.trim();
  if (!cleanLabel || value <= 0) return false;
  const currentRows = serviceRowsForTeacher(teacherId);
  const row = {
    id: `free-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    freeService: true,
    label: cleanLabel,
    hours: value
  };
  state.serviceAssignments = {
    ...state.serviceAssignments,
    [teacherId]: [...currentRows, row]
  };
  saveServiceAssignments(true);
  showValidationPopup("Service libre validé");
  return true;
}
export function removeServiceFreeAssignment(teacherId, rowId) {
  const currentRows = serviceRowsForTeacher(teacherId).filter(row => row.id !== rowId);
  state.serviceAssignments = {
    ...state.serviceAssignments,
    [teacherId]: currentRows
  };
  saveServiceAssignments(true);
}
export function serviceAlerts() {
  const totals = serviceClassTotals();
  return state.classes.map(schoolClass => ({
    schoolClass,
    total: totals[schoolClass],
    target: serviceClassTarget(schoolClass)
  })).filter(item => item.total > item.target);
}
export function setServiceAssignment(teacherId, schoolClass, hours) {
  const existing = serviceAssignmentFor(teacherId, schoolClass);
  const currentRows = serviceRowsForTeacher(teacherId).filter(row => row.classId !== schoolClass);
  const value = Math.max(0, Number(hours) || 0);
  const maxHours = serviceMaxAssignableHours(teacherId, schoolClass);
  if (value > maxHours) {
    showValidationPopup(`Maximum autorise : ${maxHours}h`);
    return false;
  }
  if (value > 0) currentRows.push({
    classId: schoolClass,
    hours: value
  });
  state.serviceAssignments = {
    ...state.serviceAssignments,
    [teacherId]: currentRows
  };
  saveServiceAssignments(true);
  const saved = true;
  if (value > 0) showValidationPopup("Service théorique validé");else if (existing) showValidationPopup("Service théorique supprimé");
  return saved;
}
export function removeServiceAssignment(teacherId, schoolClass) {
  const currentRows = serviceRowsForTeacher(teacherId).filter(row => row.classId !== schoolClass);
  state.serviceAssignments = {
    ...state.serviceAssignments,
    [teacherId]: currentRows
  };
  if (state.serviceClassByTeacher[teacherId] === schoolClass) state.serviceClassByTeacher = {
    ...state.serviceClassByTeacher,
    [teacherId]: ""
  };
  saveServiceAssignments(true);
}
export function serviceAllowsClassForTeacher(teacherId, schoolClass) {
  const rows = serviceRowsForTeacher(teacherId);
  if (!rows.length) return true;
  return rows.some(row => classesOverlap(row.classId, schoolClass));
}
export function serviceAllowsClassForTeachers(teacherIds, schoolClass) {
  if (!teacherIds.length || !schoolClass) return true;
  return teacherIds.every(teacherId => serviceAllowsClassForTeacher(teacherId, schoolClass));
}
export function serviceClassRestrictionMessage(teacherIds, schoolClass) {
  const restrictedTeachers = teacherIds.filter(teacherId => !serviceAllowsClassForTeacher(teacherId, schoolClass)).map(teacherId => state.teachers.find(teacher => teacher.id === teacherId)?.name || teacherId);
  return restrictedTeachers.length ? `${schoolClass} n'est pas affectée ? ${restrictedTeachers.join(", ")} dans le service théorique.` : "";
}
export function buildModalAvailability() {
  const occupied = {
    teacherIds: new Set(),
    facilityIds: new Set(),
    classes: new Set()
  };
  (state.constructionPlan[state.activeBuildCell] || []).forEach(item => {
    if (state.editingBuildBlock?.ruleId && item.ruleId === state.editingBuildBlock.ruleId) return;
    teacherIdsForBlock(item).forEach(teacherId => occupied.teacherIds.add(teacherId));
    if (item.facilityId) occupied.facilityIds.add(item.facilityId);
    if (item.schoolClass) occupied.classes.add(item.schoolClass);
  });
  const {
    rowId,
    weekRank
  } = parseYearCellKey(state.activeBuildCell);
  const row = yearRows().find(item => item.id === rowId);
  const weekItem = schoolYearWeeks().find(item => item.rank === weekRank);
  occupied.unavailableFacilityIds = row && weekItem ? unavailableFacilitiesForCell(row, weekItem) : new Set();
  occupied.unavailableClasses = row && weekItem ? unavailableClassesForCell(row, weekItem) : new Set();
  occupied.unavailableTeacherIds = row && weekItem ? unavailableTeachersForCell(row, weekItem) : new Set();
  return occupied;
}
export function allowedActivityIdsForFacility(facilityId) {
  if (!facilityId) return state.activities.map(activity => activity.id);
  return Array.isArray(state.facilityActivities[facilityId]) ? state.facilityActivities[facilityId] : [];
}
export function activitiesForFacility(facilityId) {
  return allowedActivityIdsForFacility(facilityId).map(activityId => state.activities.find(activity => activity.id === activityId)).filter(Boolean);
}
export function activityAllowedForFacility(facilityId, activityId) {
  if (!activityId) return true;
  if (serviceFreeActivityById(activityId)) return true;
  return allowedActivityIdsForFacility(facilityId).includes(activityId);
}
export function programActivityIdsForClasses(classItems = []) {
  const programLists = classItems.filter(Boolean).map(activityProgramForClass).filter(ids => ids.length);
  if (!programLists.length) return [];
  return programLists.reduce((allowedIds, ids) => allowedIds.filter(id => ids.includes(id)));
}
export function programActivityIdsForBlock(block) {
  return programActivityIdsForClasses(classesForBlock(block));
}
export function activityAllowedForBlockProgram(block, activityId) {
  if (!activityId) return true;
  if (serviceFreeActivityById(activityId)) return true;
  const programActivityIds = programActivityIdsForBlock(block);
  return !programActivityIds.length || programActivityIds.includes(activityId);
}
export function activityAllowedForBuildBlock(block, activityId = block?.activityId || "") {
  if (!activityId) return true;
  return activityAllowedForFacility(block?.facilityId || "", activityId) && activityAllowedForBlockProgram(block, activityId);
}
export function swimmingActivityIds() {
  const normalizedLabel = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const swimmingFacilityIds = state.facilities.filter(facility => /piscine|natation/i.test(normalizedLabel(facility.label))).map(facility => facility.id);
  const linkedSwimmingActivityIds = swimmingFacilityIds.flatMap(facilityId => state.facilityActivities[facilityId] || []);
  return [...new Set([...state.activities.filter(activity => /natation|piscine/i.test(normalizedLabel(activity.label))).map(activity => activity.id), ...linkedSwimmingActivityIds])];
}
export function otherCycleChoicesForRule(ruleId, currentCycle = null, includeCurrentCycle = false) {
  if (!ruleId) return [];
  const rule = state.constructionRules.find(item => item.id === ruleId);
  if (!rule) return [];
  return constructionCyclesForRule(rule).filter(cycle => includeCurrentCycle || !cyclesRepresentSameSlot(cycle, currentCycle)).map(cycle => ({
    cycle,
    block: blockWithCycleOverride(rule, cycle)
  })).map(({
    cycle,
    block
  }) => ({
    cycleName: displayCycleName(cycle) || cycle.id,
    facilityLabel: block.facilityLabel || "Installation a renseigner",
    activityLabel: block.activityLabel || "Activité à renseigner",
    missing: !block.facilityLabel && !block.activityLabel
  }));
}
export function renderOtherCycleChoicesForRule(ruleId, currentCycle = null, includeCurrentCycle = false) {
  const choices = otherCycleChoicesForRule(ruleId, currentCycle, includeCurrentCycle);
  if (!choices.length) return "";
  return `<div class="fixedBlockCycleChoices">${choices.map(choice => `
          <div class="fixedBlockCycleChoice ${choice.missing ? "missing" : ""}"><b>${choice.cycleName}</b><span>${choice.facilityLabel} · ${choice.activityLabel}</span></div>
        `).join("")}</div>`;
}
export function constructionRuleClassKeys(rule) {
  return classesForBlock(rule?.block || {}).map(schoolClass => baseClassFromGroupedClass(schoolClass) || schoolClass).filter((schoolClass, index, list) => schoolClass && list.indexOf(schoolClass) === index);
}
export function sameClassConstructionRule(firstRule, secondRule) {
  const firstKeys = constructionRuleClassKeys(firstRule);
  const secondKeys = constructionRuleClassKeys(secondRule);
  return firstKeys.some(key => secondKeys.includes(key));
}
export function otherSlotRulesForSameCycle(ruleId, currentCycle = null) {
  if (!ruleId || !currentCycle) return [];
  const currentRule = state.constructionRules.find(item => item.id === ruleId);
  if (!currentRule) return [];
  return annualConstructionRules().filter(rule => rule.id !== currentRule.id).filter(rule => !rule.block?.optionBlock).filter(rule => rule.rowId !== currentRule.rowId).filter(rule => sameClassConstructionRule(currentRule, rule)).filter(rule => constructionCyclesForRule(rule).some(cycle => cyclesRepresentSameSlot(cycle, currentCycle))).sort((first, second) => ruleRowLabel(first.rowId).localeCompare(ruleRowLabel(second.rowId), "fr"));
}
export function renderOtherSlotChoicesForSameCycle(ruleId, currentCycle = null) {
  const slotRules = otherSlotRulesForSameCycle(ruleId, currentCycle);
  if (!slotRules.length) return `<span>Aucun autre creneau pour cette classe sur ce cycle.</span>`;
  return slotRules.map(rule => {
    const cycleBlock = blockWithCycleOverride(rule, constructionCycleForRuleById(rule, currentCycle.id) || currentCycle);
    return `<div class="fixedBlockSlotGroup">
            <strong>${ruleRowLabel(rule.rowId)}</strong>
            <span>${teacherLabelForBlock(cycleBlock)} · ${blockClassLabel(cycleBlock)} · ${rule.weekLetter && rule.weekLetter !== "all" ? `Quinzaine ${rule.weekLetter}` : "Toutes les semaines"}</span>
            ${renderOtherCycleChoicesForRule(rule.id, currentCycle, true)}
          </div>`;
  }).join("");
}
export function renderFixedBlockContext(ruleId, currentCycle, block) {
  return `<div class="fixedBlockContextGrid">
          <div class="alertHelp"><strong>Bloc fixe</strong><span>${teacherLabelForBlock(block)} · ${blockClassLabel(block)} · ${block.weekLetter && block.weekLetter !== "all" ? `Quinzaine ${block.weekLetter}` : "Toutes les semaines"}</span>${renderOtherCycleChoicesForRule(ruleId, currentCycle)}</div>
          <div class="alertHelp"><strong>Autres creneaux du meme cycle</strong>${renderOtherSlotChoicesForSameCycle(ruleId, currentCycle)}</div>
        </div>`;
}
export function activitiesForFacilityAndBlockProgram(facilityId, block) {
  if (!facilityId) return state.activities.filter(activity => activityAllowedForBlockProgram(block, activity.id));
  const blockForFacility = {
    ...(block || {}),
    facilityId
  };
  return activitiesForFacility(facilityId).filter(activity => activityAllowedForBlockProgram(blockForFacility, activity.id));
}
export function facilityHasActivityForBlockProgram(facilityId, block) {
  return activitiesForFacilityAndBlockProgram(facilityId, block).length > 0;
}
export function clearInvalidBlockActivitySelection() {
  if (!state.blockActivityId) return;
  const block = currentBlock();
  if (!activityAllowedForBuildBlock(block, state.blockActivityId)) state.blockActivityId = "";
}
export function currentBlock() {
  const selectedTeachers = state.blockTeacherIds.map(id => state.teachers.find(item => item.id === id)).filter(Boolean);
  const primaryTeacher = selectedTeachers[0];
  const facility = state.facilities.find(item => item.id === state.blockFacilityId);
  const option = state.blockIsOption && state.blockOptionId ? serviceFreeOptionById(state.blockOptionId) : null;
  const optionHours = option ? normalizedOptionHours(option.id, state.blockOptionHours) : 0;
  const optionCycleIds = state.blockIsOption ? normalizedOptionCycleIds() : [];
  const activity = constructionActivityById(state.blockActivityId);
  const selectedTeacherClasses = Object.fromEntries(selectedTeachers.map(teacher => [teacher.id, state.blockTeacherClasses[teacher.id] || ""]).filter(([, schoolClass]) => schoolClass));
  const primaryClass = selectedTeachers.map(teacher => selectedTeacherClasses[teacher.id]).find(Boolean) || state.blockClass;
  return {
    teacherIds: selectedTeachers.map(teacher => teacher.id),
    teacherNames: selectedTeachers.map(teacher => teacher.name).join(" + "),
    teacherId: primaryTeacher?.id || "",
    teacherName: primaryTeacher?.name || "",
    coTeacherHours: {},
    color: primaryTeacher?.color || "#f8fafc",
    border: primaryTeacher?.border || "#cbd5e1",
    schoolClass: primaryClass,
    teacherClasses: selectedTeacherClasses,
    facilityId: facility?.id || "",
    facilityLabel: facility?.label || "",
    activityId: activity?.id || (option ? serviceFreeActivityId(option.label) : ""),
    activityLabel: activity?.label || option?.label || "",
    optionBlock: state.blockIsOption,
    optionId: option?.id || "",
    optionTeacherId: option?.teacherId || "",
    optionRowId: option?.rowId || "",
    optionLabel: option?.label || "",
    optionHours,
    optionCycleIds,
    coIntervention: state.blockCoIntervention
  };
}
export function classParts(schoolClass) {
  const normalizedClass = normalizeSchoolClassId(schoolClass);
  if (!normalizedClass) return {
    level: state.blockClassLevel || "",
    number: "",
    group: "whole"
  };
  if (String(normalizedClass).startsWith("special::")) {
    const item = specialClassFromSchoolId(normalizedClass);
    const id = specialClassTypeIdFromSchoolId(normalizedClass);
    const baseClassId = specialClassBaseIdFromSchoolId(normalizedClass);
    const group = specialClassGroupFromSchoolId(normalizedClass);
    return {
      level: "special",
      number: specialClassSchoolId(id, baseClassId),
      group,
      special: true,
      specialId: id,
      baseClassId,
      label: item?.label || id
    };
  }
  const levelPattern = state.classLevels.map(level => level.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|");
  const match = levelPattern ? normalizedClass.match(new RegExp(`^(${levelPattern})([a-z0-9]+?)(whole|A|B)?$`, "i")) : null;
  const level = match?.[1] || "";
  const number = match?.[2] || "";
  const group = match?.[3] ? match[3].toUpperCase() : "whole";
  return {
    level: state.classLevels.includes(level) ? level : "",
    number: classNumbersForLevel(level).includes(number) ? number : "",
    group: state.classGroups.some(item => item.id === group) ? group : "whole"
  };
}
export function schoolClassLabel(level, number, group = "whole") {
  return group === "whole" ? `${level}${number}` : `${level}${number}${group}`;
}
export function classesOverlap(firstClass, secondClass) {
  const first = classParts(firstClass);
  const second = classParts(secondClass);
  if (first.special || second.special) {
    return Boolean(first.special && second.special && first.number === second.number && (first.group === "whole" || second.group === "whole" || first.group === second.group));
  }
  if (!first.level || !second.level || first.level !== second.level || first.number !== second.number) return false;
  return first.group === "whole" || second.group === "whole" || first.group === second.group;
}
export function classSameBase(firstClass, secondClass) {
  const first = classParts(firstClass);
  const second = classParts(secondClass);
  if (first.special || second.special) return Boolean(first.special && second.special && first.number === second.number);
  return Boolean(first.level && second.level && first.level === second.level && first.number === second.number);
}
export function classGroupVariant(schoolClass, group = "whole") {
  const baseClass = baseClassFromGroupedClass(schoolClass);
  const parts = classParts(baseClass);
  const normalizedGroup = state.classGroups.some(item => item.id === String(group || "").toUpperCase()) ? String(group || "").toUpperCase() : "whole";
  if (parts.special) return specialClassSchoolId(parts.specialId || parts.number, parts.baseClassId || "", normalizedGroup);
  if (!parts.level || !parts.number) return baseClass;
  return schoolClassLabel(parts.level, parts.number, normalizedGroup);
}
export function classGroupVariants(schoolClass) {
  return state.classGroups.map(group => classGroupVariant(schoolClass, group.id));
}
export function toggleExclusiveClassSelection(selectedClasses, schoolClass) {
  if (selectedClasses.includes(schoolClass)) return selectedClasses.filter(item => item !== schoolClass);
  return [...selectedClasses.filter(item => !classSameBase(item, schoolClass)), schoolClass];
}
export function classBelongsToLevel(schoolClass, level) {
  return classParts(schoolClass).level === level;
}
export function toggleWholeLevelSelection(selectedClasses, level) {
  const levelClasses = classesForLevel(level);
  const allWholeClassesSelected = levelClasses.every(schoolClass => selectedClasses.includes(schoolClass));
  const outsideLevel = selectedClasses.filter(schoolClass => !classBelongsToLevel(schoolClass, level));
  return allWholeClassesSelected ? outsideLevel : [...outsideLevel, ...levelClasses];
}
export function classCollectionHasOverlap(classItems, schoolClass) {
  return [...classItems].some(item => classesOverlap(item, schoolClass));
}
export function updateBlockClass(part, value) {
  const current = classParts(state.blockClass);
  if (part === "level") {
    state.blockClassLevel = value;
    state.blockClass = "";
    return;
  }
  const nextLevel = current.level || state.blockClassLevel;
  const nextNumber = part === "number" ? value : current.number;
  const nextGroup = part === "group" ? value : current.group;
  if (!nextLevel || !nextNumber) return;
  state.blockClass = schoolClassLabel(nextLevel, nextNumber, nextGroup);
}
export function syncPrimaryBlockClassFromTeacherClasses() {
  state.blockClass = state.blockTeacherIds.map(teacherId => state.blockTeacherClasses[teacherId]).find(Boolean) || "";
  state.blockClassLevel = state.blockClass ? classParts(state.blockClass).level : "";
}
export function updateBlockTeacherClass(teacherId, part, value) {
  const current = classParts(state.blockTeacherClasses[teacherId] || "");
  if (part === "level") {
    state.blockTeacherClassLevels = {
      ...state.blockTeacherClassLevels,
      [teacherId]: value
    };
    state.blockTeacherClasses = {
      ...state.blockTeacherClasses,
      [teacherId]: ""
    };
    syncPrimaryBlockClassFromTeacherClasses();
    return;
  }
  const nextLevel = current.level || state.blockTeacherClassLevels[teacherId] || "";
  const nextNumber = part === "number" ? value : current.number;
  const nextGroup = part === "group" ? value : current.group;
  if (!nextLevel || !nextNumber) return;
  state.blockTeacherClasses = {
    ...state.blockTeacherClasses,
    [teacherId]: schoolClassLabel(nextLevel, nextNumber, nextGroup)
  };
  syncPrimaryBlockClassFromTeacherClasses();
}
export function setBlockTeacherClass(teacherId, schoolClass) {
  state.blockTeacherClasses = {
    ...state.blockTeacherClasses,
    [teacherId]: schoolClass
  };
  const baseClassId = specialClassBaseIdFromSchoolId(schoolClass);
  const displayLevel = classParts(baseClassId || schoolClass).level;
  state.blockTeacherClassLevels = {
    ...state.blockTeacherClassLevels,
    [teacherId]: displayLevel
  };
  syncPrimaryBlockClassFromTeacherClasses();
}
export function setBlockTeacherClassGroup(teacherId, group) {
  const current = state.blockTeacherClasses[teacherId] || "";
  if (!current) return;
  setBlockTeacherClass(teacherId, classGroupVariant(current, group));
}
export function updateSpecialBlockClass(id) {
  state.blockClassLevel = "special";
  state.blockClass = id.startsWith("special::") ? id : specialClassSchoolId(id);
}
export function toggleUnavailableClass(schoolClass) {
  state.unavailableClassIds = toggleExclusiveClassSelection(state.unavailableClassIds, schoolClass);
}
export function toggleUnavailableTeacher(teacherId) {
  state.unavailableTeacherIds = state.unavailableTeacherIds.includes(teacherId) ? state.unavailableTeacherIds.filter(item => item !== teacherId) : [...state.unavailableTeacherIds, teacherId];
}
export function selectedUnavailableClassNumbers() {
  return classNumbersForLevel(state.unavailableClassLevelFilter).filter(number => state.unavailableClassIds.includes(`${state.unavailableClassLevelFilter} ${number}`));
}
export function unavailableCellSelected(day, slotId) {
  return state.unavailableCells.some(cell => cell.day === day && cell.slotId === slotId);
}
export function toggleUnavailableGridCell(day, slotId) {
  if (unavailableCellSelected(day, slotId)) {
    state.unavailableCells = state.unavailableCells.filter(cell => !(cell.day === day && cell.slotId === slotId));
  } else {
    state.unavailableCells = [...state.unavailableCells, {
      day,
      slotId
    }];
  }
  state.unavailableWeekdays = [...new Set(state.unavailableCells.map(cell => cell.day))];
  state.unavailableSlotIds = [...new Set(state.unavailableCells.map(cell => cell.slotId))];
}
