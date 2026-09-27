import { pageMemory } from "./page-memory.js";
import { state } from "../app/state.js";
import { schoolYearWeeks, yearRows } from "../domain/dates.js";
import { saveCloudNowIfPossible, scheduleCloudSave } from "./cloud.js";

export function defaultYearPlan() {
  const weeks = schoolYearWeeks();
  return Object.fromEntries(yearRows().map(row => [row.id, Object.fromEntries(weeks.map(weekItem => [weekItem.rank, weekItem.letter]))]));
}
export function loadYearPlan() {
  try {
    const saved = pageMemory.getItem("planningEpsYearPlan2026");
    return saved ? JSON.parse(saved) : defaultYearPlan();
  } catch {
    return defaultYearPlan();
  }
}
export function saveYearPlan() {
  pageMemory.setItem("planningEpsYearPlan2026", JSON.stringify(state.yearPlan));
  scheduleCloudSave(["yearPlan"]);
}
export function yearValue(rowId, weekRank) {
  if (!state.yearPlan[rowId]) state.yearPlan[rowId] = {};
  if (!state.yearPlan[rowId][weekRank]) state.yearPlan[rowId][weekRank] = schoolYearWeeks()[weekRank - 1].letter;
  return state.yearPlan[rowId][weekRank];
}
export function loadConstructionPlan() {
  try {
    const saved = pageMemory.getItem("planningEpsConstruction2026");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}
export function invalidateConstructionChecksCache() {
  state.constructionChecksRevision += 1;
  state.constructionChecksCache = {
    revision: state.constructionChecksRevision
  };
}
export function cachedConstructionCheck(key, compute) {
  if (state.constructionChecksCache.revision !== state.constructionChecksRevision) {
    state.constructionChecksCache = {
      revision: state.constructionChecksRevision
    };
  }
  if (!(key in state.constructionChecksCache)) state.constructionChecksCache[key] = compute();
  return state.constructionChecksCache[key];
}
export function saveConstructionPlan(immediateCloud = true) {
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsConstruction2026", JSON.stringify(state.constructionPlan));
  if (immediateCloud) saveCloudNowIfPossible(["constructionPlan"]);
}
