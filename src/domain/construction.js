import { state } from "../app/state.js";
import { classParts } from "./assignments.js";
import { blockForRuleStorage } from "./blocks.js";
import { constructionCycleById, cycleForWeek } from "./hours.js";
import { constructionCycleForBlockById, constructionCycleForRuleById, constructionCyclesForRule, cyclesRepresentSameSlot, rebuildConstructionPlan } from "../services/settings-storage.js";

export function applyBlockToCycle(rowId, cycleId, block, weekLetter = "all") {
  const classLevel = classParts(block.schoolClass).level;
  const cycle = constructionCycleForBlockById(block, cycleId);
  if (!cycle) return;
  state.constructionRules.push({
    id: `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    rowId,
    cycleId: cycle.id,
    classLevel,
    weekLetter,
    block
  });
  rebuildConstructionPlan();
}
export function skeletonBlockForStorage(block) {
  const {
    facilityId,
    facilityLabel,
    activityId,
    activityLabel,
    ...storedBlock
  } = blockForRuleStorage(block);
  return storedBlock;
}
export function applyAnnualConstructionBlock(rowId, block, weekLetter = "all") {
  const classLevel = classParts(block.schoolClass).level;
  state.constructionRules.push({
    id: `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    rowId,
    cycleId: "year",
    scope: "year",
    classLevel,
    weekLetter,
    block: skeletonBlockForStorage(block),
    cycleOverrides: {}
  });
  rebuildConstructionPlan();
}
export function updateConstructionRule(ruleId, block, weekLetter = "all", weekItem = null) {
  const rule = state.constructionRules.find(item => item.id === ruleId);
  if (!rule) return;
  const classLevel = classParts(block.schoolClass).level;
  const targetCycle = weekItem ? cycleForWeek(weekItem, classLevel) : null;
  rule.block = block;
  rule.classLevel = classLevel;
  if (targetCycle) rule.cycleId = targetCycle.id;
  rule.weekLetter = weekLetter;
  rebuildConstructionPlan();
}
export function updateAnnualConstructionRule(ruleId, block, weekLetter = "all") {
  const rule = state.constructionRules.find(item => item.id === ruleId);
  if (!rule) return;
  rule.block = skeletonBlockForStorage(block);
  rule.classLevel = classParts(block.schoolClass).level;
  rule.cycleId = "year";
  rule.scope = "year";
  rule.weekLetter = weekLetter;
  if (!rule.cycleOverrides) rule.cycleOverrides = {};
  rebuildConstructionPlan();
}
export function updateConstructionRuleCycleDetails(ruleId, cycleId, block) {
  const rule = state.constructionRules.find(item => item.id === ruleId);
  if (!rule || !cycleId) return false;
  const targetCycle = constructionCycleForRuleById(rule, cycleId) || {
    id: cycleId,
    name: cycleId
  };
  const targetCycleId = targetCycle.id || cycleId;
  const nextOverrides = {
    ...(rule.cycleOverrides || {})
  };
  Object.keys(nextOverrides).forEach(overrideCycleId => {
    if (overrideCycleId === targetCycleId) return;
    const overrideCycle = constructionCycleForRuleById(rule, overrideCycleId) || constructionCycleById(overrideCycleId) || {
      id: overrideCycleId,
      name: overrideCycleId
    };
    if (cyclesRepresentSameSlot(overrideCycle, targetCycle)) delete nextOverrides[overrideCycleId];
  });
  rule.cycleOverrides = {
    ...nextOverrides,
    [targetCycleId]: {
      facilityId: block.facilityId || "",
      activityId: block.activityId || ""
    }
  };
  state.constructionOptimizationResult = null;
  rebuildConstructionPlan();
  return true;
}
export function constructionRuleAppliesToCycle(rule, cycle) {
  return constructionCyclesForRule(rule).some(item => item.id === cycle.id);
}
