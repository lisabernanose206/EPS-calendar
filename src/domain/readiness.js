import { escapeHtml } from "../ui/format.js";
import { state } from "../app/state.js";
import { activitiesForFacility, classParts, classesForBlock, effectiveTeacherHoursForBlock, fullServiceSlotHours, optionBlockAvailableForTeachers, serviceAlerts, serviceClassRowsForTeacher, serviceClassTarget, serviceFreeActivityById, serviceFreeOptionById, serviceFreeOptionId, serviceFreeRowsForTeacher, serviceRowsForTeacher, serviceTargetForTeacher, serviceTotalForTeacher, teacherClassForBlock, teacherHoursForBlock, teacherIdsForBlock } from "./assignments.js";
import { validateCycles } from "./cycles.js";
import { yearRows } from "./dates.js";
import { isCollegeEstablishment } from "./settings.js";
import { cachedConstructionCheck } from "../services/planning-storage.js";
import { baseClassFromGroupedClass, blockWithCycleOverride, constructionCyclesForRule, constructionServiceClassIdForTotals, isAnnualConstructionRule, optionAnnualFactorForRule, serviceClassIdForBaseClass, serviceClassesForLevel, specialClassInstances } from "../services/settings-storage.js";
import { weekDisplayStart } from "../ui/date-picker.js";
import { compactClassName, hourStatus } from "../ui/format.js";

export function constructionReadinessItems() {
  const items = [];
  const cycleErrors = validateCycles(state.cycles);
  const halfGroupIssues = constructionHalfGroupIssues();
  const hasServiceAssignments = state.teachers.some(teacher => serviceRowsForTeacher(teacher.id).length > 0);
  if (!adminStepComplete("establishment")) items.push({
    level: "blocking",
    title: "Créneaux à compléter",
    detail: "Renseignez les créneaux de cours et les horaires d'AS dans Établissement.",
    buildMode: "prerequisites",
    subMode: "establishment"
  });
  if (!state.teachers.length) items.push({
    level: "blocking",
    title: "Aucun professeur",
    detail: "Ajoutez au moins un professeur avant de construire des cours.",
    buildMode: "prerequisites",
    subMode: "team"
  });
  if (!state.classes.length) items.push({
    level: "blocking",
    title: "Aucune classe",
    detail: "Ajoutez au moins une classe dans l'onglet Classes.",
    buildMode: "prerequisites",
    subMode: "classes"
  });
  if (!state.facilities.length) items.push({
    level: "blocking",
    title: "Aucune installation",
    detail: "Ajoutez au moins une installation pour pouvoir placer un cours.",
    buildMode: "prerequisites",
    subMode: "facilitiesActivities"
  });
  if (!state.activities.length) items.push({
    level: "blocking",
    title: "Aucune activité",
    detail: "Ajoutez au moins une activité et reliez-la aux installations possibles.",
    buildMode: "prerequisites",
    subMode: "facilitiesActivities"
  });
  if (!adminStepComplete("program")) items.push({
    level: "blocking",
    title: "Programme incomplet",
    detail: "Affectez les activités attendues pour chaque niveau dans Programme.",
    buildMode: "prerequisites",
    subMode: "program"
  });
  if (!state.cycles.length) items.push({
    level: "blocking",
    title: isCollegeEstablishment() ? "Aucune période" : "Aucun cycle",
    detail: isCollegeEstablishment() ? "Définissez les périodes pour relier chaque cours à une période." : "Définissez les cycles pour relier chaque cours à une période.",
    buildMode: "yearPrerequisites",
    subMode: "cycles"
  });
  if (cycleErrors.length) items.push({
    level: "blocking",
    title: "Cycles ? corriger",
    detail: cycleErrors[0],
    buildMode: "yearPrerequisites",
    subMode: "cycles"
  });
  if (!hasServiceAssignments) items.push({
    level: "warning",
    title: "Service théorique non renseigné",
    detail: "Affectez les classes aux profs dans Service pour limiter les choix de classes en Construction.",
    buildMode: "yearPrerequisites",
    subMode: "hours"
  });
  if (!state.facilityUnavailability.length) items.push({
    level: "warning",
    title: "Aucune indisponibilit?",
    detail: "Renseignez les contraintes profs, classes ou installations si elles existent.",
    buildMode: "yearPrerequisites",
    subMode: "unavailable"
  });
  if (!state.asSessions.length) items.push({
    level: "warning",
    title: "Aucune AS",
    detail: "Ajoutez les AS si elles doivent apparaître dans le planning.",
    buildMode: "yearPrerequisites",
    subMode: "as"
  });
  if (!state.sportEvents.length) items.push({
    level: "warning",
    title: "Aucun événement sportif",
    detail: "Ajoutez les événements sportifs connus pour reserver les créneaux concernes.",
    buildMode: "yearPrerequisites",
    subMode: "events"
  });
  if (halfGroupIssues.length) items.push({
    level: "blocking",
    title: "Demi-groupe incomplet",
    detail: halfGroupIssues[0].detail,
    buildMode: "blocks"
  });
  return items.map(normalizeConstructionReadinessItem);
}
export function normalizeConstructionReadinessItem(item) {
  if (item.subMode === "establishment") return {
    ...item,
    title: "Cr&eacute;neaux &agrave; compl&eacute;ter",
    detail: "Renseignez les cr&eacute;neaux de cours et les horaires d'AS dans &Eacute;tablissement."
  };
  if (item.title === "Aucune installation") return item;
  if (item.subMode === "facilitiesActivities") return {
    ...item,
    title: "Aucune activit&eacute;",
    detail: "Ajoutez au moins une activit&eacute; et reliez-la aux installations possibles."
  };
  if (item.subMode === "program") return {
    ...item,
    title: "Programme incomplet",
    detail: "Affectez les activit&eacute;s attendues pour chaque niveau dans Programme."
  };
  if (item.subMode === "cycles" && item.title === "Aucun cycle") return {
    ...item,
    title: isCollegeEstablishment() ? "Aucune période" : "Aucun cycle",
    detail: isCollegeEstablishment() ? "Définissez les périodes pour relier chaque cours à une période." : "D&eacute;finissez les cycles pour relier chaque cours &agrave; une p&eacute;riode."
  };
  if (item.subMode === "cycles") return {
    ...item,
    title: "Cycles &agrave; corriger"
  };
  if (item.subMode === "hours") return {
    ...item,
    title: "Service th&eacute;orique non renseign&eacute;",
    detail: "Affectez les classes aux profs dans Service pour limiter les choix de classes en Construction."
  };
  if (item.subMode === "unavailable") return {
    ...item,
    title: "Aucune indisponibilit&eacute;",
    detail: "Renseignez les contraintes profs, classes ou installations si elles existent."
  };
  if (item.subMode === "as") return {
    ...item,
    title: "Aucune AS",
    detail: "Ajoutez les AS si elles doivent appara&icirc;tre dans le planning."
  };
  if (item.subMode === "events") return {
    ...item,
    title: "Aucun &eacute;v&eacute;nement sportif",
    detail: "Ajoutez les &eacute;v&eacute;nements sportifs connus pour r&eacute;server les cr&eacute;neaux concern&eacute;s."
  };
  return item;
}
export function constructionBlockingItems() {
  return constructionReadinessItems().filter(item => item.level === "blocking");
}
export function canAccessConstructionPlanning() {
  return adminStepComplete("establishment") && state.teachers.length > 0 && state.classes.length > 0 && state.facilities.length > 0 && state.activities.length > 0 && state.cycles.length > 0 && !validateCycles(state.cycles).length;
}
export function constructionTrimesterSections(weeks) {
  const sections = [{
    title: "Trimestre 1",
    detail: "septembre - decembre",
    months: [8, 9, 10, 11]
  }, {
    title: "Trimestre 2",
    detail: "janvier - mars",
    months: [0, 1, 2]
  }, {
    title: "Trimestre 3",
    detail: "avril - juillet",
    months: [3, 4, 5, 6]
  }];
  return sections.map(section => ({
    ...section,
    weeks: weeks.filter(weekItem => section.months.includes(weekDisplayStart(weekItem).getMonth()))
  })).filter(section => section.weeks.length);
}
export function roundHours(value) {
  return Math.round((Number(value) || 0) * 60) / 60;
}
export function roundConstructedHours(value) {
  return Math.round((Number(value) || 0) * 2) / 2;
}
export function formatHours(value) {
  const totalMinutes = Math.round((Number(value) || 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}
export function serviceStepComplete() {
  if (serviceAlerts().length) return false;
  return state.teachers.every(teacher => {
    const total = serviceTotalForTeacher(teacher.id);
    return total >= teacher.weeklyReference;
  });
}
export function annualConstructionRules() {
  return state.constructionRules.filter(rule => isAnnualConstructionRule(rule));
}
export function annualRuleHasTeacherClasses(rule) {
  const teacherIds = teacherIdsForBlock(rule.block);
  if (rule.block?.optionBlock) {
    return optionBlockAvailableForTeachers(teacherIds) && Boolean(rule.block.optionId && rule.block.optionHours > 0);
  }
  return teacherIds.length > 0 && teacherIds.every(teacherId => teacherClassForBlock(rule.block, teacherId));
}
export function constructionHalfGroupIssues() {
  const groupsByTeacherClass = new Map();
  annualConstructionRules().forEach(rule => {
    if (rule.block?.optionBlock) return;
    teacherIdsForBlock(rule.block).forEach(teacherId => {
      const schoolClass = teacherClassForBlock(rule.block, teacherId);
      const parts = classParts(schoolClass);
      if (!parts.special && (!parts.level || !parts.number) || !["A", "B"].includes(parts.group)) return;
      const baseClass = baseClassFromGroupedClass(schoolClass);
      const key = `${teacherId}::${baseClass}`;
      if (!groupsByTeacherClass.has(key)) {
        groupsByTeacherClass.set(key, {
          teacherId,
          baseClass,
          groups: new Set()
        });
      }
      groupsByTeacherClass.get(key).groups.add(parts.group);
    });
  });
  return [...groupsByTeacherClass.values()].filter(item => item.groups.size === 1).map(item => {
    const presentGroup = [...item.groups][0];
    const missingGroup = presentGroup === "A" ? "B" : "A";
    const teacherName = state.teachers.find(teacher => teacher.id === item.teacherId)?.name || item.teacherId;
    return {
      teacherId: item.teacherId,
      teacherName,
      baseClass: item.baseClass,
      presentGroup,
      missingGroup,
      detail: `${teacherName} a ${compactClassName(item.baseClass)} demi groupe ${presentGroup}, mais pas le demi groupe ${missingGroup}.`
    };
  });
}
export function annualConstructionTeacherHours() {
  const totals = Object.fromEntries(state.teachers.map(teacher => [teacher.id, 0]));
  annualConstructionRules().forEach(rule => {
    const row = yearRows().find(item => item.id === rule.rowId);
    if (!row?.slot) return;
    const slotHours = fullServiceSlotHours(row);
    const multiplier = (rule.weekLetter && rule.weekLetter !== "all" ? 0.5 : 1) * optionAnnualFactorForRule(rule);
    teacherIdsForBlock(rule.block).forEach(teacherId => {
      totals[teacherId] = (totals[teacherId] || 0) + effectiveTeacherHoursForBlock(rule.block, teacherId, slotHours) * multiplier;
    });
  });
  return Object.fromEntries(Object.entries(totals).map(([teacherId, total]) => [teacherId, roundConstructedHours(total)]));
}
export function annualConstructionClassHours() {
  const totals = Object.fromEntries(state.classes.map(schoolClass => [schoolClass, 0]));
  const countedClassSlots = new Set();
  annualConstructionRules().forEach(rule => {
    if (rule.block?.optionBlock) return;
    const row = yearRows().find(item => item.id === rule.rowId);
    if (!row?.slot) return;
    const slotHours = fullServiceSlotHours(row);
    const multiplier = rule.weekLetter && rule.weekLetter !== "all" ? 0.5 : 1;
    const blockClasses = [...new Set(classesForBlock(rule.block).map(constructionServiceClassIdForTotals).filter(Boolean))];
    blockClasses.forEach(schoolClass => {
      const countKey = `${rule.rowId}::${rule.weekLetter || "all"}::${schoolClass}`;
      if (countedClassSlots.has(countKey)) return;
      countedClassSlots.add(countKey);
      if (totals[schoolClass] === undefined) totals[schoolClass] = 0;
      totals[schoolClass] += slotHours * multiplier;
    });
  });
  return Object.fromEntries(Object.entries(totals).map(([schoolClass, total]) => [schoolClass, roundConstructedHours(total)]));
}
export function constructionSummaryClasses() {
  const classItems = state.classLevels.flatMap(serviceClassesForLevel);
  specialClassInstances().forEach(instance => {
    if (!instance.baseClassId) classItems.push(instance.schoolClass);
  });
  return [...new Set(classItems)];
}
export function constructionClassSummaryTotal(schoolClass, classTotals) {
  return classTotals[schoolClass] || 0;
}
export function annualConstructionTeacherClassHours() {
  const totals = Object.fromEntries(state.teachers.map(teacher => [teacher.id, {}]));
  const countedTeacherClassSlots = new Set();
  annualConstructionRules().forEach(rule => {
    if (rule.block?.optionBlock) return;
    const row = yearRows().find(item => item.id === rule.rowId);
    if (!row?.slot) return;
    const slotHours = fullServiceSlotHours(row);
    const multiplier = rule.weekLetter && rule.weekLetter !== "all" ? 0.5 : 1;
    const countedTeacherClasses = new Set();
    teacherIdsForBlock(rule.block).forEach(teacherId => {
      const rawClass = teacherClassForBlock(rule.block, teacherId);
      const schoolClass = rawClass ? constructionServiceClassIdForTotals(rawClass) : "";
      if (!schoolClass) return;
      const countKey = `${teacherId}::${schoolClass}`;
      if (countedTeacherClasses.has(countKey)) return;
      countedTeacherClasses.add(countKey);
      const slotCountKey = `${rule.rowId}::${rule.weekLetter || "all"}::${teacherId}::${schoolClass}`;
      if (countedTeacherClassSlots.has(slotCountKey)) return;
      countedTeacherClassSlots.add(slotCountKey);
      if (!totals[teacherId]) totals[teacherId] = {};
      totals[teacherId][schoolClass] = (totals[teacherId][schoolClass] || 0) + teacherHoursForBlock(rule.block, teacherId, slotHours) * multiplier;
    });
  });
  return Object.fromEntries(Object.entries(totals).map(([teacherId, classTotals]) => [teacherId, Object.fromEntries(Object.entries(classTotals).map(([schoolClass, total]) => [schoolClass, roundConstructedHours(total)]))]));
}
export function constructionTeacherClassSummaries(teacherId, teacherClassTotals) {
  const expectedRows = serviceClassRowsForTeacher(teacherId);
  const expectedByClass = {};
  expectedRows.forEach(row => {
    const schoolClass = row.classId ? serviceClassIdForBaseClass(row.classId) : "";
    if (!schoolClass) return;
    expectedByClass[schoolClass] = (expectedByClass[schoolClass] || 0) + (Number(row.hours) || 0);
  });
  const actualByClass = teacherClassTotals[teacherId] || {};
  return [...new Set([...Object.keys(expectedByClass), ...Object.keys(actualByClass)])].sort((a, b) => a.localeCompare(b, "fr")).map(schoolClass => {
    const total = actualByClass[schoolClass] || 0;
    const target = expectedByClass[schoolClass] || 0;
    const diff = roundConstructedHours(total - target);
    return {
      schoolClass,
      total,
      target,
      missing: Math.max(0, -diff),
      excess: Math.max(0, diff),
      ok: Math.abs(diff) < 0.01
    };
  });
}
export function annualConstructionTeacherOptionHours() {
  const totals = Object.fromEntries(state.teachers.map(teacher => [teacher.id, {}]));
  annualConstructionRules().forEach(rule => {
    if (!rule.block?.optionBlock) return;
    const row = yearRows().find(item => item.id === rule.rowId);
    if (!row?.slot) return;
    const slotHours = fullServiceSlotHours(row);
    const multiplier = (rule.weekLetter && rule.weekLetter !== "all" ? 0.5 : 1) * optionAnnualFactorForRule(rule);
    teacherIdsForBlock(rule.block).forEach(teacherId => {
      const optionId = rule.block.optionId || "";
      if (!optionId) return;
      if (!totals[teacherId]) totals[teacherId] = {};
      totals[teacherId][optionId] = (totals[teacherId][optionId] || 0) + effectiveTeacherHoursForBlock(rule.block, teacherId, slotHours) * multiplier;
    });
  });
  return Object.fromEntries(Object.entries(totals).map(([teacherId, optionTotals]) => [teacherId, Object.fromEntries(Object.entries(optionTotals).map(([optionId, total]) => [optionId, roundConstructedHours(total)]))]));
}
export function constructionTeacherOptionSummaries(teacherId, teacherOptionTotals) {
  const expectedRows = serviceFreeRowsForTeacher(teacherId);
  const expectedByOption = {};
  const labelsByOption = {};
  expectedRows.forEach(row => {
    const optionId = serviceFreeOptionId(teacherId, row.id);
    expectedByOption[optionId] = (expectedByOption[optionId] || 0) + (Number(row.hours) || 0);
    labelsByOption[optionId] = row.label || "Option";
  });
  const actualByOption = teacherOptionTotals[teacherId] || {};
  return [...new Set([...Object.keys(expectedByOption), ...Object.keys(actualByOption)])].sort((a, b) => (labelsByOption[a] || a).localeCompare(labelsByOption[b] || b, "fr")).map(optionId => {
    const option = serviceFreeOptionById(optionId);
    const total = actualByOption[optionId] || 0;
    const target = expectedByOption[optionId] || 0;
    const diff = roundConstructedHours(total - target);
    return {
      optionId,
      label: labelsByOption[optionId] || option?.label || "Option",
      total,
      target,
      missing: Math.max(0, -diff),
      excess: Math.max(0, diff),
      ok: Math.abs(diff) < 0.01
    };
  });
}
export function classHourTargetForConstruction(schoolClass) {
  return serviceClassTarget(schoolClass);
}
export function constructionClassesStepComplete() {
  const totals = annualConstructionClassHours();
  return constructionSummaryClasses().every(schoolClass => {
    const target = classHourTargetForConstruction(schoolClass);
    if (!target) return true;
    return Math.abs(constructionClassSummaryTotal(schoolClass, totals) - target) < 0.01;
  });
}
export function constructionBlocksStepComplete() {
  return cachedConstructionCheck("blocksComplete", () => {
    const rules = annualConstructionRules();
    if (!rules.length) return false;
    if (!rules.every(annualRuleHasTeacherClasses)) return false;
    if (constructionHalfGroupIssues().length) return false;
    const totals = annualConstructionTeacherHours();
    return state.teachers.every(teacher => (totals[teacher.id] || 0) >= serviceTargetForTeacher(teacher)) && constructionClassesStepComplete();
  });
}
export function constructionCycleDetailsStepComplete() {
  return cachedConstructionCheck("cycleDetailsComplete", () => {
    const rules = annualConstructionRules();
    if (!rules.length) return false;
    return rules.every(rule => constructionCyclesForRule(rule).every(cycle => {
      const block = blockWithCycleOverride(rule, cycle);
      if (block.optionBlock) return true;
      if (!block.facilityId && serviceFreeActivityById(block.activityId)) return true;
      if (!block.facilityId) return false;
      if (serviceFreeActivityById(block.activityId)) return true;
      return activitiesForFacility(block.facilityId).length ? Boolean(block.activityId) : true;
    }));
  });
}
export function adminStepComplete(buildMode) {
  if (buildMode === "prerequisites") {
    return ["establishment", "team", "classes", "facilitiesActivities"].every(adminStepComplete);
  }
  if (buildMode === "yearPrerequisites") {
    return ["unavailable", "cycles", "as", "events", "hours"].every(adminStepComplete);
  }
  if (buildMode === "rules") {
    return state.constructionRuleSettings.length > 0;
  }
  if (buildMode === "establishment") {
    return state.slots.length > 0 && state.slots.every(slot => slot.label && Number(slot.hours) > 0) && (state.schoolConstraints.asSlots || []).length > 0 && (state.schoolConstraints.asSlots || []).every(slot => slot.label && Number(slot.hours) > 0 && (slot.days || []).length);
  }
  if (buildMode === "team") return state.teachers.length > 0;
  if (buildMode === "classes") return state.classes.length > 0;
  if (buildMode === "facilities" || buildMode === "activities" || buildMode === "facilitiesActivities") return state.facilities.length > 0 && state.activities.length > 0;
  if (buildMode === "program") return state.activities.length > 0 && state.classLevels.every(level => (state.activityProgramByLevel[level] || []).length > 0);
  if (buildMode === "unavailable") return state.facilityUnavailability.length > 0;
  if (buildMode === "cycles") return state.cycles.length > 0 && !validateCycles(state.cycles).length;
  if (buildMode === "as") return state.asSessions.length > 0;
  if (buildMode === "events") return state.sportEvents.length > 0;
  if (buildMode === "hours") return serviceStepComplete();
  return false;
}
export function renderConstructionWarnings() {
  const items = constructionReadinessItems();
  if (!items.length) return `<div class="constructionWarningPanel constructionStatusPanel"><div class="constructionWarning ready"><strong>Paramétrage prêt</strong><span>Les éléments essentiels sont renseignés pour construire l'emploi du temps.</span></div></div>`;
  return `<div class="constructionWarningPanel constructionStatusPanel">${items.map(item => `<div class="constructionWarning ${item.level === "blocking" ? "blocking" : ""}" ${item.buildMode ? `data-warning-build-mode="${escapeHtml(item.buildMode)}" ${item.subMode ? `data-warning-sub-mode="${item.subMode}"` : ""} title="Ouvrir l'onglet concerne"` : ""}><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></div>`).join("")}</div>`;
}
export function renderConstructionLockedWarnings() {
  const items = constructionReadinessItems();
  if (!items.length) return "";
  return `<ul class="constructionLockedList">${items.map(item => `<li ${item.buildMode ? `data-warning-build-mode="${escapeHtml(item.buildMode)}" ${item.subMode ? `data-warning-sub-mode="${item.subMode}"` : ""} title="Ouvrir l'onglet concern&eacute;"` : ""}><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></li>`).join("")}</ul>`;
}
export function renderConstructionStatusRow(helpText = "") {
  const readiness = renderConstructionWarnings();
  const helpButton = helpText ? `<button class="constructionHelpButton ${state.constructionHelpOpen ? "active" : ""}" type="button" data-toggle-construction-help aria-label="Afficher l'aide de ce sous-onglet" title="Afficher l'aide">?</button>` : "";
  const helpPanel = helpText && state.constructionHelpOpen ? `<div class="constructionHelpText">${helpText}</div>` : "";
  return `<div class="constructionStatusBlock"><div class="constructionStatusRow">${readiness}${helpButton}</div>${helpPanel}</div>`;
}
export function renderConstructionServiceSummary() {
  if (state.constructionServiceSummaryHidden) {
    return `<div class="servicePanel compactServicePanel constructionServicePanel isCollapsed">
            <div class="hoursBalanceHeader">
              <h3>Service réel construit</h3>
              <button class="ghostButton" data-toggle-construction-service-summary>Afficher</button>
            </div>
          </div>`;
  }
  const teacherTotals = annualConstructionTeacherHours();
  const teacherClassTotals = annualConstructionTeacherClassHours();
  const teacherOptionTotals = annualConstructionTeacherOptionHours();
  const classTotals = annualConstructionClassHours();
  const classSummaries = constructionSummaryClasses().map(schoolClass => {
    const total = constructionClassSummaryTotal(schoolClass, classTotals);
    const target = classHourTargetForConstruction(schoolClass);
    const diff = roundConstructedHours(total - (target || 0));
    const missing = Math.max(0, -diff);
    const excess = Math.max(0, diff);
    const ok = !target || Math.abs(diff) < 0.01;
    return {
      schoolClass,
      total,
      target,
      missing,
      excess,
      ok
    };
  });
  return `<div class="servicePanel compactServicePanel constructionServicePanel">
          <div class="hoursBalanceHeader">
            <h3>Service réel construit</h3>
            <button class="ghostButton" data-toggle-construction-service-summary>Masquer</button>
          </div>
          <div class="hoursBalanceGrid">
            ${state.teachers.map(teacher => {
    const total = teacherTotals[teacher.id] || 0;
    const target = serviceTargetForTeacher(teacher);
    const overtimeHours = Math.max(0, roundConstructedHours(target - teacher.weeklyReference));
    const status = hourStatus(total - target);
    const progress = target ? Math.min(100, Math.round(total / target * 100)) : 0;
    const classDetails = constructionTeacherClassSummaries(teacher.id, teacherClassTotals);
    const optionDetails = constructionTeacherOptionSummaries(teacher.id, teacherOptionTotals);
    const serviceDetails = [...classDetails.map(item => ({
      ...item,
      label: compactClassName(item.schoolClass)
    })), ...optionDetails.map(item => ({
      ...item,
      label: item.label
    }))];
    return `<article class="hoursCard" style="background:${escapeHtml(teacher.color)};border-color:${escapeHtml(teacher.border)}">
                <div class="hoursCardTop"><strong>${escapeHtml(teacher.name)}</strong><span class="hoursStatus ${escapeHtml(status.className)}">${escapeHtml(status.label)}</span></div>
                <div class="hoursMain"><strong>${formatHours(total)}</strong><span class="muted">/ ${formatHours(target)}${overtimeHours ? ` <span class="hoursOvertime">${formatHours(overtimeHours)} HSA</span>` : ""}</span></div>
                <div class="hoursProgress"><span style="width:${progress}%"></span></div>
                <div class="classPills">
                  ${serviceDetails.length ? serviceDetails.map(item => {
      const detail = item.missing ? ` &middot; manque ${formatHours(item.missing)}` : item.excess ? ` &middot; trop ${formatHours(item.excess)}` : "";
      return `<span class="classPill ${item.ok ? "" : "needsValidation"}">${escapeHtml(item.label)} &middot; ${formatHours(item.total)} / ${formatHours(item.target)}${detail}</span>`;
    }).join("") : `<span class="classPill">Aucun service affecté</span>`}
                </div>
              </article>`;
  }).join("")}
          </div>
          <h3>Volumes par classe</h3>
          <div class="classPills">
            ${classSummaries.map(item => {
    const total = formatHours(item.total);
    const target = formatHours(item.target);
    const ok = item.ok;
    const schoolClass = item.schoolClass;
    return `<span class="classPill ${ok ? "" : "needsValidation"}">${compactClassName(schoolClass)} · ${total} / ${target}</span>`;
  }).join("")}
          </div>
        </div>`;
}
