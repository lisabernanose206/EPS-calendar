import { state } from "../app/state.js";
import { activitiesForFacility, blockClassLabel, blockCycleUnavailableMessage, blocksCanShareFacility, classParts, classesForBlock, classesOverlap, constructionActivityById, swimmingActivityIds, teacherIdsForBlock } from "./assignments.js";
import { constructionRuleAppliesToCycle } from "./construction.js";
import { classicConstructionCycles, weeksForCycle } from "./hours.js";
import { cycleLabel, displayCycleName } from "./settings.js";
import { activityProgramForClass, activityProgramForRule, blockWithCycleOverride, rebuildConstructionPlan } from "../services/settings-storage.js";
import { compactClassName } from "../ui/format.js";

export function constructionRuleSettingEnabled(id) {
  return state.constructionRuleSettings.some(rule => rule.id === id);
}
export function rulesShareCycleWeeks(firstRule, secondRule, cycle) {
  const firstLetter = firstRule.weekLetter || "all";
  const secondLetter = secondRule.weekLetter || "all";
  return weeksForCycle(cycle).some(weekItem => (firstLetter === "all" || firstLetter === weekItem.letter) && (secondLetter === "all" || secondLetter === weekItem.letter));
}
export function optimizedCandidateBlock(rule, facility, activity) {
  return {
    ...rule.block,
    facilityId: facility?.id || "",
    facilityLabel: facility?.label || "",
    activityId: activity?.id || "",
    activityLabel: activity?.label || ""
  };
}
export function optimizedCycleCandidates(rule, cycle) {
  if (!rule?.block || rule.block.optionBlock) return [];
  const enforceActivityLinks = constructionRuleSettingEnabled("facility-activity-link");
  const enforceUnavailableFacilities = constructionRuleSettingEnabled("facility-unavailable");
  const enforceProgram = constructionRuleSettingEnabled("class-activity-program");
  const programActivityIds = enforceProgram ? activityProgramForRule(rule) : [];
  return state.facilities.flatMap(facility => {
    const linkedActivities = activitiesForFacility(facility.id);
    const activityChoices = enforceActivityLinks ? linkedActivities.length ? linkedActivities : [null] : state.activities;
    return activityChoices.filter(activity => !enforceProgram || !programActivityIds.length || activity && programActivityIds.includes(activity.id)).map(activity => optimizedCandidateBlock(rule, facility, activity)).filter(block => !enforceUnavailableFacilities || !blockCycleUnavailableMessage(rule.rowId, cycle.id, block, rule.weekLetter || "all"));
  });
}
export function optimizedRuleClassKeys(rule) {
  return classesForBlock(rule.block).filter(Boolean);
}
export function optimizedCycleActivityLimitForClass(schoolClass) {
  return classParts(schoolClass).level === "6e" && constructionRuleSettingEnabled("sixth-grade-dual-activity-swimming") ? 2 : 1;
}
export function optimizedSwimmingActivityIds() {
  return swimmingActivityIds();
}
export function optimizedCycleIsSixthSwimmingCycle(cycle) {
  return classicConstructionCycles().slice(0, 3).some(item => item.id === cycle.id);
}
export function optimizedCandidateViolatesClassCycleActivity(rule, cycle, block, usage) {
  if (!block.activityId) return false;
  const enforceSingleActivity = constructionRuleSettingEnabled("class-single-activity-per-cycle");
  const enforceSixthProgram = constructionRuleSettingEnabled("sixth-grade-dual-activity-swimming");
  if (!enforceSingleActivity && !enforceSixthProgram) return false;
  return optimizedRuleClassKeys(rule).some(schoolClass => {
    const key = `${schoolClass}::${cycle.id}`;
    const existing = usage.classCycleActivities.get(key) || new Set();
    const isSixth = classParts(schoolClass).level === "6e" && enforceSixthProgram;
    if (isSixth && existing.size === 1 && existing.has(block.activityId)) return true;
    if (existing.has(block.activityId)) return false;
    return existing.size >= optimizedCycleActivityLimitForClass(schoolClass);
  });
}
export function optimizedSwimmingPenalty(rule, cycle, block, usage) {
  if (!constructionRuleSettingEnabled("sixth-grade-dual-activity-swimming")) return 0;
  const swimmingIds = optimizedSwimmingActivityIds();
  if (!swimmingIds.length) return 0;
  return optimizedRuleClassKeys(rule).reduce((sum, schoolClass) => {
    if (classParts(schoolClass).level !== "6e") return sum;
    const isSwimming = swimmingIds.includes(block.activityId);
    const classCycleKey = `${schoolClass}::${cycle.id}`;
    const currentActivities = usage.classCycleActivities.get(classCycleKey) || new Set();
    const hasSwimmingThisCycle = [...currentActivities].some(activityId => swimmingIds.includes(activityId));
    const firstThreeCycle = optimizedCycleIsSixthSwimmingCycle(cycle);
    if (firstThreeCycle && !hasSwimmingThisCycle && !isSwimming) return sum + 5000;
    if (firstThreeCycle && hasSwimmingThisCycle && isSwimming) return sum + 600;
    if (!firstThreeCycle && isSwimming) return sum + 900;
    if (currentActivities.size === 1 && currentActivities.has(block.activityId)) return sum + 450;
    return sum;
  }, 0);
}
export function optimizedSeasonalLocationPenalty(cycle, block) {
  if (!constructionRuleSettingEnabled("seasonal-location-preference")) return 0;
  const cyclesList = classicConstructionCycles();
  if (cyclesList.length < 2) return 0;
  const cycleIndex = cyclesList.findIndex(item => item.id === cycle.id);
  if (cycleIndex < 0) return 0;
  const locationType = state.facilities.find(facility => facility.id === block.facilityId)?.locationType || "";
  if (!locationType) return 0;
  const edgeCycle = cycleIndex === 0 || cycleIndex === cyclesList.length - 1;
  const preferredLocationType = edgeCycle ? "outdoor" : "indoor";
  return locationType === preferredLocationType ? 0 : 320;
}
export function optimizedAnnualProgramPenalty(rule, block, usage) {
  if (!constructionRuleSettingEnabled("class-activity-program") || !block.activityId) return 0;
  return optimizedRuleClassKeys(rule).reduce((sum, schoolClass) => {
    const programActivityIds = activityProgramForClass(schoolClass);
    if (!programActivityIds.includes(block.activityId)) return sum;
    const doneActivityIds = usage.classYearActivities.get(schoolClass) || new Set();
    return sum + (doneActivityIds.has(block.activityId) ? 520 : 0);
  }, 0);
}
export function optimizedRuleNeedsSixthSwimming(rule, cycle, usage) {
  if (!constructionRuleSettingEnabled("sixth-grade-dual-activity-swimming") || !optimizedCycleIsSixthSwimmingCycle(cycle)) return false;
  const swimmingIds = optimizedSwimmingActivityIds();
  if (!swimmingIds.length) return false;
  return optimizedRuleClassKeys(rule).some(schoolClass => {
    if (classParts(schoolClass).level !== "6e") return false;
    const classCycleKey = `${schoolClass}::${cycle.id}`;
    const currentActivities = usage.classCycleActivities.get(classCycleKey) || new Set();
    return ![...currentActivities].some(activityId => swimmingIds.includes(activityId));
  });
}
export function optimizedCandidateHasSwimming(candidates) {
  const swimmingIds = optimizedSwimmingActivityIds();
  return candidates.some(block => swimmingIds.includes(block.activityId));
}
export function optimizedRuleProgramMissingCount(rule, usage) {
  if (!constructionRuleSettingEnabled("class-activity-program")) return 0;
  return optimizedRuleClassKeys(rule).reduce((sum, schoolClass) => {
    const programActivityIds = activityProgramForClass(schoolClass);
    if (!programActivityIds.length) return sum;
    const doneActivityIds = usage.classYearActivities.get(schoolClass) || new Set();
    return sum + programActivityIds.filter(activityId => !doneActivityIds.has(activityId)).length;
  }, 0);
}
export function optimizedRulePriority(rule, cycle, candidates, usage) {
  const swimmingNeed = optimizedRuleNeedsSixthSwimming(rule, cycle, usage) && optimizedCandidateHasSwimming(candidates) ? 10000 : 0;
  const programNeed = optimizedRuleProgramMissingCount(rule, usage) * 120;
  return swimmingNeed + programNeed - candidates.length;
}
export function optimizedAnnualProgramViolations() {
  if (!constructionRuleSettingEnabled("class-activity-program")) return [];
  return state.classes.flatMap(schoolClass => {
    const programActivityIds = activityProgramForClass(schoolClass);
    if (!programActivityIds.length) return [];
    const doneActivityIds = new Set();
    classicConstructionCycles().forEach(cycle => {
      state.constructionRules.forEach(rule => {
        if (!constructionRuleAppliesToCycle(rule, cycle) || rule.block?.optionBlock) return;
        if (!classesForBlock(rule.block).some(item => classesOverlap(item, schoolClass))) return;
        const block = blockWithCycleOverride(rule, cycle);
        if (block.activityId) doneActivityIds.add(block.activityId);
      });
    });
    const missingActivities = programActivityIds.filter(activityId => !doneActivityIds.has(activityId)).map(activityId => constructionActivityById(activityId)?.label || activityId);
    return missingActivities.length ? [`${compactClassName(schoolClass)} : ${missingActivities.join(", ")} non faite(s)`] : [];
  });
}
export function optimizedSixthProgramViolations() {
  if (!constructionRuleSettingEnabled("sixth-grade-dual-activity-swimming")) return [];
  const swimmingIds = optimizedSwimmingActivityIds();
  const sixthClasses = state.classes.filter(schoolClass => classParts(schoolClass).level === "6e");
  const cyclesToCheck = classicConstructionCycles();
  return sixthClasses.flatMap(schoolClass => cyclesToCheck.flatMap((cycle, cycleIndex) => {
    const activityIds = new Set();
    state.constructionRules.forEach(rule => {
      if (!constructionRuleAppliesToCycle(rule, cycle) || rule.block?.optionBlock) return;
      if (!classesForBlock(rule.block).some(item => classesOverlap(item, schoolClass))) return;
      const block = blockWithCycleOverride(rule, cycle);
      if (block.activityId) activityIds.add(block.activityId);
    });
    const issues = [];
    if (activityIds.size !== 2) issues.push(`${compactClassName(schoolClass)} ${displayCycleName(cycle) || `${cycleLabel(true)} ${cycleIndex + 1}`} : ${activityIds.size || 0} activité(s) au lieu de 2`);
    if (cycleIndex < 3 && ![...activityIds].some(activityId => swimmingIds.includes(activityId))) {
      issues.push(`${compactClassName(schoolClass)} ${displayCycleName(cycle) || `${cycleLabel(true)} ${cycleIndex + 1}`} : natation manquante`);
    }
    return issues;
  }));
}
export function optimizedAssignmentHasConflict(rule, cycle, block, assignments) {
  if (!constructionRuleSettingEnabled("facility-single-place")) return false;
  return assignments.some(assignment => {
    if (assignment.rule.rowId !== rule.rowId) return false;
    if (!rulesShareCycleWeeks(assignment.rule, rule, cycle)) return false;
    if (!assignment.block.facilityId || assignment.block.facilityId !== block.facilityId) return false;
    return !blocksCanShareFacility(assignment.block, block);
  });
}
export function optimizedUnresolvedReason(rule, cycle, candidates, assignments, usage) {
  if (!candidates.length) {
    const programActivityIds = constructionRuleSettingEnabled("class-activity-program") ? activityProgramForRule(rule) : [];
    if (constructionRuleSettingEnabled("class-activity-program") && programActivityIds.length) return "Aucune installation ne propose une activité du programme compatible.";
    if (constructionRuleSettingEnabled("facility-unavailable")) return "Aucune installation/activité compatible ou disponible sur ce créneau.";
    return "Aucun couple installation/activité compatible.";
  }
  const withoutConflicts = candidates.filter(block => !optimizedAssignmentHasConflict(rule, cycle, block, assignments));
  if (!withoutConflicts.length) return "Toutes les installations compatibles sont déjà occupées sur ce créneau.";
  const withoutActivityLimit = withoutConflicts.filter(block => !optimizedCandidateViolatesClassCycleActivity(rule, cycle, block, usage));
  if (!withoutActivityLimit.length) {
    const hasSixth = optimizedRuleClassKeys(rule).some(schoolClass => classParts(schoolClass).level === "6e");
    return hasSixth ? "La classe de 6e a déjà atteint ses deux activités distinctes sur ce cycle." : "La classe a déjà une activité affectée sur ce cycle.";
  }
  return "Aucune affectation n'a respecte toutes les contraintes actives.";
}
export function optimizedCandidateScore(rule, cycle, block, usage) {
  const rowFacilityKey = `${rule.rowId}::${block.facilityId}`;
  const teacherIds = teacherIdsForBlock(rule.block);
  const teacherFacilityPenalty = teacherIds.reduce((sum, teacherId) => sum + (usage.teacherFacility.get(`${teacherId}::${block.facilityId}`) || 0), 0);
  const teacherActivityPenalty = teacherIds.reduce((sum, teacherId) => sum + (usage.teacherActivity.get(`${teacherId}::${block.activityId}`) || 0), 0);
  const level = rule.classLevel || classParts(rule.block?.schoolClass || "").level || "";
  const programPenalty = constructionRuleSettingEnabled("class-activity-program") && block.activityId ? (usage.levelActivity.get(`${level}::${block.activityId}`) || 0) * 70 : 0;
  const swimmingIds = optimizedSwimmingActivityIds();
  const scarceSwimmingBoost = optimizedRuleNeedsSixthSwimming(rule, cycle, usage) && swimmingIds.includes(block.activityId) ? -9000 : 0;
  return (usage.rowFacility.get(rowFacilityKey) || 0) * 50 + (usage.facility.get(block.facilityId) || 0) * 8 + (usage.activity.get(block.activityId) || 0) * 4 + teacherFacilityPenalty * 3 + teacherActivityPenalty * 2 + programPenalty + optimizedAnnualProgramPenalty(rule, block, usage) + optimizedSwimmingPenalty(rule, cycle, block, usage) + optimizedSeasonalLocationPenalty(cycle, block) + scarceSwimmingBoost;
}
export function bumpOptimizedUsage(rule, cycle, block, usage) {
  const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  const swimmingIds = optimizedSwimmingActivityIds();
  bump(usage.facility, block.facilityId);
  bump(usage.activity, block.activityId || "__none__");
  bump(usage.rowFacility, `${rule.rowId}::${block.facilityId}`);
  const level = rule.classLevel || classParts(rule.block?.schoolClass || "").level || "";
  if (level && block.activityId) bump(usage.levelActivity, `${level}::${block.activityId}`);
  if (block.activityId) {
    optimizedRuleClassKeys(rule).forEach(schoolClass => {
      const classCycleKey = `${schoolClass}::${cycle.id}`;
      if (!usage.classCycleActivities.has(classCycleKey)) usage.classCycleActivities.set(classCycleKey, new Set());
      usage.classCycleActivities.get(classCycleKey).add(block.activityId);
      if (!usage.classYearActivities.has(schoolClass)) usage.classYearActivities.set(schoolClass, new Set());
      usage.classYearActivities.get(schoolClass).add(block.activityId);
      if (classParts(schoolClass).level === "6e" && swimmingIds.includes(block.activityId)) {
        if (!usage.sixthSwimmingCycles.has(schoolClass)) usage.sixthSwimmingCycles.set(schoolClass, new Set());
        usage.sixthSwimmingCycles.get(schoolClass).add(cycle.id);
      }
    });
  }
  teacherIdsForBlock(rule.block).forEach(teacherId => {
    bump(usage.teacherFacility, `${teacherId}::${block.facilityId}`);
    bump(usage.teacherActivity, `${teacherId}::${block.activityId || "__none__"}`);
  });
}
export function cycleOverrideHasDetails(rule, cycleId) {
  const override = rule?.cycleOverrides?.[cycleId];
  return Boolean(override && (override.facilityId || override.activityId));
}
export function clearConstructionCycleDetails(cycleIds = null) {
  const selectedCycleIds = Array.isArray(cycleIds) ? new Set(cycleIds) : null;
  state.constructionRules = state.constructionRules.map(rule => {
    if (!rule.cycleOverrides || !Object.keys(rule.cycleOverrides).length) return rule;
    if (!selectedCycleIds) return {
      ...rule,
      cycleOverrides: {}
    };
    return {
      ...rule,
      cycleOverrides: Object.fromEntries(Object.entries(rule.cycleOverrides).filter(([cycleId]) => !selectedCycleIds.has(cycleId)))
    };
  });
  state.constructionOptimizationResult = null;
  rebuildConstructionPlan();
}
export function solveOptimizedCycleDetailsForCycle(cycle, usage) {
  const preservedAssignments = state.constructionRules.filter(rule => constructionRuleAppliesToCycle(rule, cycle) && rule?.block && !rule.block.optionBlock && cycleOverrideHasDetails(rule, cycle.id)).map(rule => ({
    rule,
    block: blockWithCycleOverride(rule, cycle)
  }));
  preservedAssignments.forEach(({
    rule,
    block
  }) => bumpOptimizedUsage(rule, cycle, block, usage));
  const rules = state.constructionRules.filter(rule => constructionRuleAppliesToCycle(rule, cycle) && rule?.block && !rule.block.optionBlock && !cycleOverrideHasDetails(rule, cycle.id)).map(rule => ({
    rule,
    candidates: optimizedCycleCandidates(rule, cycle)
  })).sort((first, second) => optimizedRulePriority(second.rule, cycle, second.candidates, usage) - optimizedRulePriority(first.rule, cycle, first.candidates, usage) || first.candidates.length - second.candidates.length);
  const assignments = [...preservedAssignments];
  const newAssignments = [];
  const unresolved = [];
  rules.forEach(({
    rule,
    candidates
  }) => {
    const viable = candidates.filter(block => !optimizedAssignmentHasConflict(rule, cycle, block, assignments)).filter(block => !optimizedCandidateViolatesClassCycleActivity(rule, cycle, block, usage)).sort((first, second) => optimizedCandidateScore(rule, cycle, first, usage) - optimizedCandidateScore(rule, cycle, second, usage));
    const selected = viable[0];
    if (!selected) {
      unresolved.push({
        rule,
        cycleId: cycle.id,
        reason: optimizedUnresolvedReason(rule, cycle, candidates, assignments, usage)
      });
      return;
    }
    assignments.push({
      rule,
      block: selected
    });
    newAssignments.push({
      rule,
      block: selected
    });
    bumpOptimizedUsage(rule, cycle, selected, usage);
  });
  return {
    assignments: newAssignments,
    preserved: preservedAssignments.length,
    unresolved
  };
}
export function optimizeConstructionCycleDetails() {
  if (!state.facilities.length || !state.activities.length) {
    const result = {
      saved: 0,
      unresolved: state.constructionRules.length,
      message: "Ajoutez d'abord des installations et des activités.",
      detail: "La construction optimisée a besoin de couples installation/activité pour proposer une solution."
    };
    state.constructionOptimizationResult = result;
    return result;
  }
  const usage = {
    facility: new Map(),
    activity: new Map(),
    levelActivity: new Map(),
    classCycleActivities: new Map(),
    classYearActivities: new Map(),
    sixthSwimmingCycles: new Map(),
    rowFacility: new Map(),
    teacherFacility: new Map(),
    teacherActivity: new Map()
  };
  let saved = 0;
  let preserved = 0;
  let unresolved = 0;
  const unresolvedBlocks = [];
  const cyclesToOptimize = classicConstructionCycles();
  cyclesToOptimize.forEach(cycle => {
    const result = solveOptimizedCycleDetailsForCycle(cycle, usage);
    preserved += result.preserved || 0;
    unresolved += result.unresolved.length;
    result.unresolved.forEach(({
      rule,
      cycleId,
      reason
    }) => {
      unresolvedBlocks.push({
        ruleId: rule.id,
        rowId: rule.rowId,
        cycleId,
        weekLetter: rule.weekLetter || "all",
        label: blockClassLabel(rule.block),
        reason
      });
    });
    result.assignments.forEach(({
      rule,
      block
    }) => {
      rule.cycleOverrides = {
        ...(rule.cycleOverrides || {}),
        [cycle.id]: {
          facilityId: block.facilityId || "",
          activityId: block.activityId || ""
        }
      };
      saved += 1;
    });
  });
  rebuildConstructionPlan();
  const annualProgramIssues = optimizedAnnualProgramViolations();
  const sixthProgramIssues = optimizedSixthProgramViolations();
  const unresolvedBlockIssues = unresolvedBlocks.map(issue => {
    const cycleName = classicConstructionCycles().find(cycle => cycle.id === issue.cycleId)?.name || "cycle";
    return `${issue.label || "Bloc"} ${cycleName} : ${issue.reason}`;
  });
  const detailIssues = [...unresolvedBlockIssues, ...annualProgramIssues, ...sixthProgramIssues];
  unresolved += annualProgramIssues.length + sixthProgramIssues.length;
  const checkDetail = detailIssues.length ? `${detailIssues.slice(0, 3).join(" ; ")}${detailIssues.length > 3 ? ` (+${detailIssues.length - 3})` : ""}` : "";
  const result = {
    saved,
    unresolved,
    message: unresolved ? `${saved} detail(s) optimise(s), ${preserved} conservé(s), ${unresolved} point(s) a verifier` : `${saved} detail(s) optimise(s), ${preserved} conservé(s)`
  };
  state.constructionOptimizationResult = {
    ...result,
    unresolvedBlocks,
    level: unresolved ? "warning" : "ready",
    detail: checkDetail || (saved ? "Les installations et activités manquantes ont été renseignées dans les cycles, sans modifier les blocs profs/classes ni les détails déjà saisis." : "Aucun détail n’a été ajouté. Les détails déjà saisis sont conservés ; vous pouvez vider les installations/activités pour repartir de zéro.")
  };
  return result;
}
