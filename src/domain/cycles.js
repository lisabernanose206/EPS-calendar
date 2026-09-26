import { state } from "../app/state.js";
import { displayCycleName } from "./settings.js";
import { isAdmin } from "../services/auth.js";
import { cloudSaveToRemote, cloudSourceReadyForWrite, markLocalChangedForCloud, scheduleCloudSave } from "../services/cloud.js";
import { rebuildConstructionPlan } from "../services/settings-storage.js";
import { dateOnly } from "../ui/date-picker.js";

export function defaultCycles(count = 5) {
  const startDates = ["2026-09-01", "2026-11-03", "2027-01-05", "2027-03-09", "2027-05-04"];
  const endDates = ["2026-10-16", "2026-12-18", "2027-02-19", "2027-04-23", "2027-07-02"];
  return Array.from({
    length: count
  }, (_, index) => ({
    id: `cycle-${index + 1}`,
    name: `Cycle ${index + 1}`,
    start: startDates[index] || "2026-09-01",
    end: endDates[index] || "2027-07-04"
  }));
}
export function loadCycles() {
  try {
    const saved = localStorage.getItem("planningEpsCycles2026");
    return saved ? JSON.parse(saved) : defaultCycles();
  } catch {
    return defaultCycles();
  }
}
export function loadCyclesByLevel() {
  try {
    const saved = localStorage.getItem("planningEpsCyclesByLevel2026");
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
export function saveCycles(saveCloudNow = false) {
  localStorage.setItem("planningEpsCycles2026", JSON.stringify(state.cycles));
  localStorage.setItem("planningEpsCyclesByLevel2026", JSON.stringify(state.cyclesByLevel));
  state.cycleSaveStatus = cloudSourceReadyForWrite() && isAdmin() ? "Cycles sauvegardes localement. Sauvegarde cloud en cours." : "Cycles sauvegardes localement.";
  if (saveCloudNow && isAdmin() && cloudSourceReadyForWrite()) {
    clearTimeout(state.cloudSaveTimer);
    markLocalChangedForCloud(["cycles", "cyclesByLevel"]);
    cloudSaveToRemote(false);
  } else {
    scheduleCloudSave(["cycles", "cyclesByLevel"]);
  }
}
export function setCycleCount(count) {
  const targetCycles = activeCycles();
  const safeCount = Math.max(1, Math.min(12, Number(count) || 1));
  const defaults = defaultCycles(safeCount);
  const nextCycles = Array.from({
    length: safeCount
  }, (_, index) => targetCycles[index] || cycleForScope(defaults[index], state.activeCycleScope));
  setActiveCycles(nextCycles);
  if (!activeCycles().some(cycle => cycle.id === state.activeCycleId)) state.activeCycleId = activeCycles()[0]?.id || "";
  saveCycles();
  rebuildConstructionPlan();
}
export function activeCycle() {
  return activeCycles().find(cycle => cycle.id === state.activeCycleId) || activeCycles()[0];
}
export function cycleForScope(cycle, scope) {
  if (scope === "default") return cycle;
  return {
    ...cycle,
    id: cycle.id.startsWith(`${scope}-`) ? cycle.id : `${scope}-${cycle.id}`,
    name: cycle.name
  };
}
export function ensureCyclesForLevel(level) {
  if (!state.classLevels.includes(level)) return state.cycles;
  if (!Array.isArray(state.cyclesByLevel[level]) || !state.cyclesByLevel[level].length) {
    state.cyclesByLevel[level] = state.cycles.map(cycle => cycleForScope(cycle, level));
  }
  return state.cyclesByLevel[level];
}
export function cyclesForScope(scope) {
  return scope === "default" ? state.cycles : ensureCyclesForLevel(scope);
}
export function activeCycles() {
  return cyclesForScope(state.activeCycleScope);
}
export function setActiveCycles(nextCycles) {
  if (state.activeCycleScope === "default") state.cycles = nextCycles;else state.cyclesByLevel[state.activeCycleScope] = nextCycles;
}
export function isWorkdayDate(value) {
  const day = dateOnly(value).getDay();
  return day >= 1 && day <= 5;
}
export function cycleDateRange(cycle) {
  return {
    start: dateOnly(cycle.start),
    end: dateOnly(cycle.end)
  };
}
export function cyclesOverlap(firstCycle, secondCycle) {
  const first = cycleDateRange(firstCycle);
  const second = cycleDateRange(secondCycle);
  return first.start <= second.end && second.start <= first.end;
}
export function validateCycle(cycle, cycleList = activeCycles()) {
  if (!cycle.start || !cycle.end) return `${displayCycleName(cycle)} : renseignéz une date de début et une date de fin.`;
  if (cycleDateRange(cycle).start > cycleDateRange(cycle).end) return `${displayCycleName(cycle)} : la date de fin doit être après la date de début.`;
  if (!isWorkdayDate(cycle.start) || !isWorkdayDate(cycle.end)) return `${displayCycleName(cycle)} : les dates doivent commencer et finir un jour travaille, du lundi au vendredi.`;
  const overlapping = cycleList.find(item => item.id !== cycle.id && cyclesOverlap(cycle, item));
  if (overlapping) return `${displayCycleName(cycle)} se superpose avec ${displayCycleName(overlapping)}.`;
  return "";
}
export function validateCycles(cycleList = activeCycles()) {
  return cycleList.map(cycle => validateCycle(cycle, cycleList)).filter(Boolean);
}
export function cyclesForClassLevel(level) {
  return state.classLevels.includes(level) && Array.isArray(state.cyclesByLevel[level]) && state.cyclesByLevel[level].length ? state.cyclesByLevel[level] : state.cycles;
}
export function allCycleSets() {
  return [{
    scope: "default",
    cycles: state.cycles
  }, ...state.classLevels.map(level => ({
    scope: level,
    cycles: cyclesForClassLevel(level)
  }))];
}
export function userCycleChoices() {
  const levelCycles = state.classLevels.filter(level => Array.isArray(state.cyclesByLevel[level]) && state.cyclesByLevel[level].length).flatMap(level => state.cyclesByLevel[level].map(cycle => ({
    ...cycle,
    scope: level,
    displayName: `${cycle.name.replace("Cycle ", "C")} · ${level}`
  })));
  levelCycles.forEach(item => {
    item.displayName = `${displayCycleName(item, true)} - ${item.scope}`;
  });
  return [...state.cycles.map(cycle => ({
    ...cycle,
    scope: "default",
    displayName: displayCycleName(cycle, true)
  })), ...levelCycles];
}
