import { state } from "../app/state.js";
import { classParts, schoolClassLabel } from "../domain/assignments.js";
import { classesForLevel, specialClassBaseLabel, specialClassFromSchoolId, specialClassInstanceForBaseClass } from "../services/settings-storage.js";

export function compactClassName(schoolClass) {
  const {
    level,
    number,
    group,
    special,
    label,
    baseClassId
  } = classParts(schoolClass);
  if (special) {
    const item = specialClassFromSchoolId(schoolClass);
    const baseLabel = baseClassId ? compactClassName(baseClassId) : specialClassBaseLabel(item);
    const suffix = group === "whole" ? "" : ` ${group}`;
    return baseClassId ? `${baseLabel} ${label || "Specifique"}${suffix}` : `${label || "Classe spec."}${suffix}${baseLabel !== "Non rattachee" ? ` (${baseLabel})` : ""}`;
  }
  if (!level || !number) return (schoolClass || "").replace("eme ", "e").replace("eme", "e").replace(/\s+/g, "");
  return `${level.replace("eme", "e")}${number}${group === "whole" ? "" : group}`;
}
export function classSelectionButtonLabel(schoolClass) {
  const parts = classParts(schoolClass);
  if (!parts.level || !parts.number) return compactClassName(schoolClass);
  const baseClass = schoolClassLabel(parts.level, parts.number);
  const specialInstance = specialClassInstanceForBaseClass(baseClass);
  if (!specialInstance) return compactClassName(schoolClass);
  const typedLabel = compactClassName(specialInstance.schoolClass);
  return parts.group === "whole" ? typedLabel : `${typedLabel} ${parts.group}`;
}
export function constructionClassChoiceLabel(schoolClass) {
  const parts = classParts(schoolClass);
  if (parts.special || !parts.level || !parts.number || parts.group === "whole") return classSelectionButtonLabel(schoolClass);
  return `${compactClassName(schoolClassLabel(parts.level, parts.number))} demi groupe ${parts.group}`;
}
export function classSelectionButtonClass(schoolClass) {
  const parts = classParts(schoolClass);
  if (!parts.level || !parts.number) return "";
  return specialClassInstanceForBaseClass(schoolClassLabel(parts.level, parts.number)) ? " specificClassChoice" : "";
}
export function eventClassSummary(event) {
  const selectedClasses = [...new Set(event.classes || [])];
  if (!selectedClasses.length) return "Classes";
  const labels = [];
  state.classLevels.forEach(level => {
    const wholeLevelClasses = classesForLevel(level);
    if (wholeLevelClasses.every(schoolClass => selectedClasses.includes(schoolClass))) labels.push(level);
  });
  selectedClasses.forEach(schoolClass => {
    const {
      level
    } = classParts(schoolClass);
    const wholeLevelClasses = classesForLevel(level);
    if (state.classLevels.includes(level) && wholeLevelClasses.every(item => selectedClasses.includes(item))) return;
    labels.push(compactClassName(schoolClass));
  });
  return labels.join(", ");
}
export function eventShortName(name) {
  const words = (name || "EV").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "EV";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map(word => word[0]).join("").slice(0, 5).toUpperCase();
}
export function facilityShortLabel(facilityId, fallbackLabel = "") {
  const stopWords = new Set(["salle", "de", "du", "des", "la", "le", "les", "l", "d", "municipal", "municipale", "interne", "externe"]);
  const simplify = value => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
  const baseToken = facility => {
    const words = simplify(facility.label || facility.id).split(/\s+/).filter(Boolean);
    return words.find(word => !stopWords.has(word)) || words[0] || simplify(facility.id) || "inst";
  };
  const tokenForDisplay = facility => {
    const words = (facility.label || facility.id || "").replace(/[-_]/g, " ").split(/\s+/).filter(Boolean);
    return words.find(word => !stopWords.has(simplify(word))) || words[0] || facility.id || fallbackLabel || "Inst";
  };
  const current = state.facilities.find(facility => facility.id === facilityId) || {
    id: facilityId,
    label: fallbackLabel
  };
  const currentBase = baseToken(current);
  const currentDisplay = tokenForDisplay(current);
  const otherBases = state.facilities.filter(facility => facility.id !== current.id).map(baseToken);
  let length = 1;
  while (length < currentBase.length && otherBases.some(base => base.slice(0, length) === currentBase.slice(0, length))) length += 1;
  const shortLabel = currentDisplay.slice(0, Math.max(1, length));
  return shortLabel ? shortLabel[0].toUpperCase() + shortLabel.slice(1) : "";
}
export function serviceFreeShortLabel(label = "") {
  const normalized = String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().replace(/\s+/g, " ");
  if (normalized === "soutien piscine") return "SP";
  if (normalized === "devoirs faits" || normalized === "devoir faits") return "DF";
  const stopWords = new Set(["de", "du", "des", "la", "le", "les", "l", "d"]);
  const words = normalized.split(" ").filter(word => word && !stopWords.has(word));
  if (!words.length) return "SL";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(word => word[0]).join("").slice(0, 4).toUpperCase();
}
export function groupedHeaderCells(weeks, labelForWeek, classForWeek) {
  const groups = [];
  weeks.forEach(weekItem => {
    const label = labelForWeek(weekItem);
    const className = classForWeek(weekItem);
    const last = groups[groups.length - 1];
    if (last && last.label === label && last.className === className) last.span += 1;else groups.push({
      label,
      className,
      span: 1
    });
  });
  return groups.map(group => `<th class="${escapeHtml(group.className)}" colspan="${escapeHtml(group.span)}">${escapeHtml(group.label)}</th>`).join("");
}
export function hourStatus(diff) {
  if (diff < -0.25) return {
    label: "À compléter",
    className: "statusLow"
  };
  if (diff > 0.25) return {
    label: "Au-dessus",
    className: "statusHigh"
  };
  return {
    label: "Équilibré",
    className: "statusOk"
  };
}
export function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
