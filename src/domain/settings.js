import { state } from "../app/state.js";

export function normalizedEstablishmentType(value) {
  const normalized = String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized === "lycee" ? "lycée" : "collège";
}
export function isCollegeEstablishment() {
  const normalized = String(state.schoolConstraints?.establishmentType || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized !== "lycee";
}
export function cycleLabel(lowercase = false, plural = false) {
  const label = isCollegeEstablishment() ? plural ? "P\u00e9riodes" : "P\u00e9riode" : plural ? "Cycles" : "Cycle";
  return lowercase ? label.toLowerCase() : label;
}
export function displayCycleName(cycleOrName, compact = false) {
  const rawName = typeof cycleOrName === "string" ? cycleOrName : cycleOrName?.name || "";
  if (!rawName) return "";
  const fullName = isCollegeEstablishment() ? rawName.replace(/Cycle/gi, "P\u00e9riode") : rawName;
  return compact ? fullName.replace(isCollegeEstablishment() ? "P\u00e9riode " : "Cycle ", isCollegeEstablishment() ? "P" : "C") : fullName;
}
export function classLevelsForEstablishmentType(type = state.schoolConstraints?.establishmentType) {
  return [...(state.classLevelsByEstablishmentType[normalizedEstablishmentType(type)] || state.classLevelsByEstablishmentType["collège"])];
}
export function defaultClassConfigForLevels(levels = state.classLevels) {
  return Object.fromEntries(levels.map(level => [level, {
    mode: "number",
    labels: [...state.classNumbers]
  }]));
}
export function supportedCsvClassLevels() {
  return ["CAP1", "CAP2", "2de", "1ere", "Tle", "BTS1", "BTS2"];
}
export function normalizedImportedClassLevels(config) {
  return [...new Set((Array.isArray(config?.importedLevels) ? config.importedLevels : []).map(level => String(level || "").trim()).filter(level => supportedCsvClassLevels().includes(level)))];
}
export function applyImportedClassLevels(config) {
  const importedLevels = normalizedImportedClassLevels(config);
  if (!importedLevels.length) return false;
  state.classLevels = importedLevels;
  state.defaultClassConfig = defaultClassConfigForLevels();
  return true;
}
