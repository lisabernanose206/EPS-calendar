import { pageMemory } from "./page-memory.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { blockClassLabel, classParts, classesForBlock, constructionActivityById, normalizedOptionHours, parseYearCellKey, programActivityIdsForClasses, schoolClassLabel, serviceFreeActivityId, serviceFreeOptionById, teacherClassForBlock, teacherIdsForBlock, teacherLabelForBlock, yearCellKey } from "../domain/assignments.js";
import { cyclesForClassLevel } from "../domain/cycles.js";
import { schoolYearWeeks, yearRows } from "../domain/dates.js";
import { constructionCycleById, cycleForWeek, findCycleForRule, weeksForCycle } from "../domain/hours.js";
import { applyImportedClassLevels, classLevelsForEstablishmentType, defaultClassConfigForLevels, displayCycleName, normalizedEstablishmentType, normalizedImportedClassLevels, supportedCsvClassLevels } from "../domain/settings.js";
import { ruleBlockedByUnavailable } from "../domain/unavailability.js";
import { normalizePlanningItems, saveCloudNowIfPossible, saveCloudPatchNow, saveLocksToCloudNow, scheduleCloudSave } from "./cloud.js";
import { invalidateConstructionChecksCache, saveConstructionPlan } from "./planning-storage.js";
import { showValidationPopup } from "../ui/feedback.js";
import { compactClassName } from "../ui/format.js";

export function loadTeachers() {
  try {
    const saved = pageMemory.getItem("planningEpsTeachers2026");
    if (saved === null) return structuredClone(state.defaultTeachers);
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return structuredClone(state.defaultTeachers);
    return parsed.map((teacher, index) => {
      const paletteItem = state.teacherPalette.find(item => item.color === teacher.color) || state.teacherPalette[index % state.teacherPalette.length];
      return {
        ...teacher,
        color: paletteItem.color,
        border: paletteItem.border
      };
    });
  } catch {
    return structuredClone(state.defaultTeachers);
  }
}
export function saveTeachers() {
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsTeachers2026", JSON.stringify(state.teachers));
  saveCloudNowIfPossible(["teachers"]);
}
export function loadSchoolConstraints() {
  try {
    const saved = pageMemory.getItem("planningEpsSchoolConstraints2026");
    return normalizeSchoolConstraints(saved ? JSON.parse(saved) : {});
  } catch {
    return structuredClone(state.defaultSchoolConstraints);
  }
}
export function normalizeSchoolConstraints(value = {}) {
  const normalizeTime = value => {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "";
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };
  const parseTimeRange = label => {
    const match = String(label || "").match(/(\d{1,2})h?(?::?(\d{2}))?\s*-\s*(\d{1,2})h?(?::?(\d{2}))?/i);
    if (!match) return null;
    const start = normalizeTime(`${match[1]}:${match[2] || "00"}`);
    const end = normalizeTime(`${match[3]}:${match[4] || "00"}`);
    return start && end ? {
      start,
      end
    } : null;
  };
  const timeLabel = value => {
    const [hours, minutes] = value.split(":");
    return `${Number(hours)}h${minutes === "00" ? "" : minutes}`;
  };
  const hoursBetween = (start, end) => {
    const [startHours, startMinutes] = start.split(":").map(Number);
    const [endHours, endMinutes] = end.split(":").map(Number);
    const diff = (endHours * 60 + endMinutes - (startHours * 60 + startMinutes)) / 60;
    return diff > 0 ? Math.round(diff * 100) / 100 : 0;
  };
  const normalizeSlot = (slot, fallbackSlot, prefix = "") => {
    const parsed = parseTimeRange(slot.label) || parseTimeRange(fallbackSlot.label);
    const startTime = normalizeTime(slot.startTime) || parsed?.start || "08:00";
    const endTime = normalizeTime(slot.endTime) || parsed?.end || "09:00";
    const hours = hoursBetween(startTime, endTime);
    const label = `${prefix}${timeLabel(startTime)}-${timeLabel(endTime)}`;
    return {
      startTime,
      endTime,
      hours,
      label
    };
  };
  const savedSlots = Array.isArray(value.courseSlots) ? value.courseSlots : [];
  const baseSlots = savedSlots.length ? savedSlots : state.defaultCourseSlots;
  const courseSlots = baseSlots.map((slot, index) => {
    const fallbackSlot = state.defaultCourseSlots[index] || state.defaultCourseSlots[0];
    const normalizedSlot = normalizeSlot(slot, fallbackSlot);
    return {
      id: (slot.id || `slot-${Date.now()}-${index}`).trim(),
      ...normalizedSlot
    };
  });
  const legacyAsSlots = [{
    ...state.defaultAsSlots[0],
    label: value.asWeekdayLabel || state.defaultAsSlots[0].label
  }, {
    ...state.defaultAsSlots[1],
    label: value.asWednesdayLabel || state.defaultAsSlots[1].label
  }];
  const savedAsSlots = Array.isArray(value.asSlots) && value.asSlots.length ? value.asSlots : legacyAsSlots;
  const asSlots = savedAsSlots.map((slot, index) => {
    const daysList = Array.isArray(slot.days) && slot.days.length ? slot.days.filter(day => state.days.includes(day)) : [...state.defaultAsSlots[index % state.defaultAsSlots.length].days];
    const fallbackSlot = state.defaultAsSlots[index % state.defaultAsSlots.length];
    const normalizedSlot = normalizeSlot(slot, fallbackSlot, "AS ");
    return {
      id: (slot.id || `as-${Date.now()}-${index}`).trim(),
      ...normalizedSlot,
      days: daysList.length ? daysList : ["Mercredi"]
    };
  });
  const schoolZone = ["A", "B", "C"].includes(value.schoolZone) ? value.schoolZone : state.defaultSchoolConstraints.schoolZone;
  const establishmentType = normalizedEstablishmentType(value.establishmentType || state.defaultSchoolConstraints.establishmentType);
  return {
    establishmentName: (value.establishmentName || state.defaultSchoolConstraints.establishmentName).trim(),
    establishmentType,
    schoolZone,
    courseSlots,
    asSlots,
    asWeekdayLabel: asSlots.find(slot => slot.days.some(day => day !== "Mercredi"))?.label || state.defaultSchoolConstraints.asWeekdayLabel,
    asWednesdayLabel: asSlots.find(slot => slot.days.includes("Mercredi"))?.label || state.defaultSchoolConstraints.asWednesdayLabel
  };
}
export function saveSchoolConstraints() {
  pageMemory.setItem("planningEpsSchoolConstraints2026", JSON.stringify(state.schoolConstraints));
  scheduleCloudSave(["schoolConstraints"]);
}
export function syncSchoolSlots() {
  state.schoolConstraints = normalizeSchoolConstraints(state.schoolConstraints);
  state.classLevels = classLevelsForEstablishmentType(state.schoolConstraints.establishmentType);
  state.defaultClassConfig = defaultClassConfigForLevels();
  state.slots = state.schoolConstraints.courseSlots;
}
export function saveSchoolSlotsAndRender(message = "") {
  syncSchoolSlots();
  saveSchoolConstraints();
  if (message) showValidationPopup(message);
  render();
}
export function applyEstablishmentTypeChange(nextType) {
  const type = normalizedEstablishmentType(nextType);
  state.schoolConstraints = {
    ...state.schoolConstraints,
    establishmentType: type
  };
  syncSchoolSlots();
  state.classConfig = normalizeClassConfig(defaultClassConfigForLevels());
  state.classes = classesFromConfig();
  state.activityProgramByLevel = normalizeActivityProgramByLevel({});
  state.activityProgramByClass = normalizeActivityProgramByClass({});
  state.serviceHoursByLevel = normalizeLevelKeyedObject({}, state.defaultServiceHours, value => Math.max(0, Number(value) || 0));
  state.serviceAssignments = {};
  state.cyclesByLevel = {};
  state.constructionRules = [];
  state.constructionPlan = {};
  state.constructionVersions = [];
  state.blockExclusions = {};
  pruneClassReferences();
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsSchoolConstraints2026", JSON.stringify(state.schoolConstraints));
  pageMemory.setItem("planningEpsClassConfig2026", JSON.stringify(state.classConfig));
  pageMemory.setItem("planningEpsActivityProgramByLevel2026", JSON.stringify(state.activityProgramByLevel));
  pageMemory.setItem("planningEpsActivityProgramByClass2026", JSON.stringify(state.activityProgramByClass));
  pageMemory.setItem("planningEpsServiceHoursByLevel2026", JSON.stringify(state.serviceHoursByLevel));
  pageMemory.setItem("planningEpsServiceAssignments2026", JSON.stringify(state.serviceAssignments));
  pageMemory.setItem("planningEpsCyclesByLevel2026", JSON.stringify(state.cyclesByLevel));
  pageMemory.setItem("planningEpsConstructionRules2026", JSON.stringify(state.constructionRules));
  pageMemory.setItem("planningEpsConstruction2026", JSON.stringify(state.constructionPlan));
  pageMemory.setItem("planningEpsConstructionVersions2026", JSON.stringify(state.constructionVersions));
  pageMemory.setItem("planningEpsBlockExclusions2026", JSON.stringify(state.blockExclusions));
  saveCloudNowIfPossible(["schoolConstraints", "classConfig", "activityProgramByLevel", "activityProgramByClass", "serviceHoursByLevel", "serviceAssignments", "cyclesByLevel", "constructionRules", "constructionPlan", "constructionVersions", "blockExclusions", "facilityUnavailability", "sportEvents"]);
}
export function makeSlotId(prefix, existingIds) {
  let index = existingIds.length + 1;
  let id = `${prefix}-${index}`;
  while (existingIds.includes(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  return id;
}
export function generatedClassLabels(mode, count) {
  return Array.from({
    length: Math.max(0, Number(count) || 0)
  }, (_, index) => mode === "letter" ? String.fromCharCode(65 + index) : String(index + 1));
}
export function simplifyClassImportValue(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
export function cleanImportedClassLabel(label) {
  return String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
}
export function canonicalClassLevel(level) {
  const value = String(level || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/^(cap\s*1|cap1|1cap|1ere\s*annee\s*de\s*cap)$/.test(value)) return "CAP1";
  if (/^(cap\s*2|cap2|2cap|2eme\s*annee\s*de\s*cap)$/.test(value)) return "CAP2";
  if (/^(bts\s*1|bts1|1bts)$/.test(value)) return "BTS1";
  if (/^(bts\s*2|bts2|2bts)$/.test(value)) return "BTS2";
  if (/^(2de|2nde|seconde|secondes?)$/.test(value)) return "2de";
  if (/^(1ere|1re|premiere|premieres?)$/.test(value)) return "1ere";
  if (/^(tle|terminale|terminales?)$/.test(value)) return "Tle";
  const match = value.match(/^([3-6])\s*(?:eme|e)?$/);
  return match ? `${match[1]}e` : "";
}
export function normalizeSchoolClassId(schoolClass) {
  const value = String(schoolClass || "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  if (value.startsWith("special::")) {
    const parts = value.slice("special::".length).split("::");
    const id = parts[0] || "";
    const tail = parts.slice(1);
    const maybeGroup = tail[tail.length - 1] || "";
    const group = state.classGroups.some(item => item.id === maybeGroup.toUpperCase()) ? maybeGroup.toUpperCase() : "whole";
    const baseParts = group === "whole" ? tail : tail.slice(0, -1);
    const baseClassId = normalizeSchoolClassId(baseParts.join("::"));
    return specialClassSchoolId(id, baseClassId, group);
  }
  const normalized = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  const lyceeMatch = normalized.match(/^(cap1|cap2|bts1|bts2|2de|2nde|seconde|1ere|1re|premiere|tle|terminale)([a-z0-9]+?)(whole|a|b)?$/i);
  if (lyceeMatch) {
    const level = canonicalClassLevel(lyceeMatch[1]);
    const rawNumber = lyceeMatch[2];
    const number = classNumbersForLevel(level).find(label => simplifyClassImportValue(label) === simplifyClassImportValue(rawNumber)) || rawNumber;
    const group = lyceeMatch[3] ? lyceeMatch[3].toUpperCase() : "whole";
    return schoolClassLabel(level, number, group === "WHOLE" ? "whole" : group);
  }
  const match = normalized.match(/^([3-6])(?:eme|e)([a-z0-9]+?)(whole|a|b)?$/i);
  if (!match) return value;
  const level = `${match[1]}e`;
  const rawNumber = match[2];
  const number = classNumbersForLevel(level).find(label => simplifyClassImportValue(label) === simplifyClassImportValue(rawNumber)) || rawNumber;
  const group = match[3] ? match[3].toUpperCase() : "whole";
  return schoolClassLabel(level, number, group === "WHOLE" ? "whole" : group);
}
export function normalizeLevelKeyedObject(source, defaults = {}, normalizeValue = value => value) {
  const output = {
    ...defaults
  };
  Object.entries(source || {}).forEach(([key, value]) => {
    const level = canonicalClassLevel(key);
    if (state.classLevels.includes(level)) output[level] = normalizeValue(value, level);
  });
  return Object.fromEntries(state.classLevels.map(level => [level, output[level]]));
}
export function specialClassSlug(label) {
  return String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "classe-specifique";
}
export function normalizeClassConfig(config) {
  const canonicalConfig = normalizeLevelKeyedObject(config || {});
  const normalized = Object.fromEntries(state.classLevels.map(level => {
    const item = canonicalConfig[level] || state.defaultClassConfig[level];
    const mode = item.mode === "letter" ? "letter" : "number";
    const labels = Array.isArray(item.labels) ? item.labels.map(label => String(label).trim()).filter(Boolean) : generatedClassLabels(mode, 7);
    return [level, {
      mode,
      labels
    }];
  }));
  const importedLevels = normalizedImportedClassLevels(config);
  if (importedLevels.length) normalized.importedLevels = importedLevels;
  const seen = new Set();
  normalized.specialClasses = (Array.isArray(config?.specialClasses) ? config.specialClasses : []).map(item => {
    const label = String(item?.label || "").trim();
    if (!label) return null;
    let id = String(item?.id || specialClassSlug(label)).trim() || specialClassSlug(label);
    let suffix = 2;
    while (seen.has(id)) {
      id = `${specialClassSlug(label)}-${suffix}`;
      suffix += 1;
    }
    seen.add(id);
    const standardClassSet = new Set(classesFromStandardConfig(normalized));
    const baseClassIds = [...new Set([...(Array.isArray(item?.baseClassIds) ? item.baseClassIds : []), item?.baseClassId || ""].map(normalizeSchoolClassId).filter(schoolClass => standardClassSet.has(schoolClass)))];
    const hoursByClass = Object.fromEntries(Object.entries(item?.hoursByClass || {}).map(([schoolClass, hours]) => [normalizeSchoolClassId(schoolClass), hours]).filter(([schoolClass]) => standardClassSet.has(schoolClass)).map(([schoolClass, hours]) => [schoolClass, Math.max(0, Number(hours) || 0)]));
    return {
      id,
      label,
      baseClassIds,
      hours: Math.max(0, Number(item?.hours) || 0),
      hoursByClass
    };
  }).filter(Boolean);
  return normalized;
}
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const content = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ";" || char === "," || char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}
export function importedClassFromText(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const simple = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const compact = simple.replace(/[^a-z0-9]+/g, "");
  const patterns = [{
    level: "6e",
    regex: /(?:^|\b)6\s*(?:eme|e)?\s*([a-z0-9]+)\b/i
  }, {
    level: "5e",
    regex: /(?:^|\b)5\s*(?:eme|e)?\s*([a-z0-9]+)\b/i
  }, {
    level: "4e",
    regex: /(?:^|\b)4\s*(?:eme|e)?\s*([a-z0-9]+)\b/i
  }, {
    level: "3e",
    regex: /(?:^|\b)3\s*(?:eme|e)?\s*([a-z0-9]+)\b/i
  }, {
    level: "CAP1",
    regex: /(?:^|\b)(?:cap\s*1|1\s*cap)\s*([a-z0-9]+)\b/i
  }, {
    level: "CAP2",
    regex: /(?:^|\b)(?:cap\s*2|2\s*cap)\s*([a-z0-9]+)\b/i
  }, {
    level: "2de",
    regex: /(?:^|\b)(?:2\s*(?:de|nde|nd)?|seconde)\s*([a-z0-9]+)\b/i
  }, {
    level: "1ere",
    regex: /(?:^|\b)(?:1\s*(?:ere|re)?|premiere)\s*([a-z0-9]+)\b/i
  }, {
    level: "Tle",
    regex: /(?:^|\b)(?:t\s*(?:le)?|terminale)\s*([a-z0-9]+)\b/i
  }, {
    level: "BTS1",
    regex: /(?:^|\b)(?:bts\s*1|1\s*bts)\s*([a-z0-9]+)\b/i
  }, {
    level: "BTS2",
    regex: /(?:^|\b)(?:bts\s*2|2\s*bts)\s*([a-z0-9]+)\b/i
  }];
  for (const pattern of patterns) {
    if (!state.classLevels.includes(pattern.level)) continue;
    const match = simple.match(pattern.regex) || compact.match(new RegExp(`^${simplifyClassImportValue(pattern.level)}(.+)$`, "i"));
    const label = cleanImportedClassLabel(match?.[1] || "");
    if (label) return {
      level: pattern.level,
      label
    };
  }
  if (state.classLevels.includes("1ere")) {
    const firstMatch = compact.match(/^1([a-z]{1,5}\d+[a-z0-9]*)$/i);
    if (firstMatch) return {
      level: "1ere",
      label: cleanImportedClassLabel(firstMatch[1])
    };
  }
  if (state.classLevels.includes("Tle")) {
    const terminaleMatch = compact.match(/^t([a-z]{0,5}\d+[a-z0-9]*)$/i);
    if (terminaleMatch) return {
      level: "Tle",
      label: cleanImportedClassLabel(terminaleMatch[1])
    };
  }
  return null;
}
export function csvImportHeaderKey(value) {
  return simplifyClassImportValue(value);
}
export function classLevelFromImportText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const direct = canonicalClassLevel(raw);
  if (direct) return direct;
  const simple = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/(^|[^a-z0-9])(?:cap\s*1|1\s*cap)([^a-z0-9]|$)/i.test(simple)) return "CAP1";
  if (/(^|[^a-z0-9])(?:cap\s*2|2\s*cap)([^a-z0-9]|$)/i.test(simple)) return "CAP2";
  if (/(^|[^a-z0-9])(?:bts\s*1|1\s*bts)([^a-z0-9]|$)/i.test(simple)) return "BTS1";
  if (/(^|[^a-z0-9])(?:bts\s*2|2\s*bts)([^a-z0-9]|$)/i.test(simple)) return "BTS2";
  if (/(^|[^a-z0-9])(?:2\s*(?:de|nde)|seconde)s?([^a-z0-9]|$)/i.test(simple)) return "2de";
  if (/(^|[^a-z0-9])(?:1\s*(?:ere|re)|premiere)s?([^a-z0-9]|$)/i.test(simple)) return "1ere";
  if (/(^|[^a-z0-9])(?:t\s*le|tle|terminale)s?([^a-z0-9]|$)/i.test(simple)) return "Tle";
  const collegeMatch = simple.match(/(^|[^a-z0-9])([3-6])\s*(?:eme|e)?([^a-z0-9]|$)/i);
  return collegeMatch ? `${collegeMatch[2]}e` : "";
}
export function importedClassFromFields(nameValue, levelValue = "") {
  const name = String(nameValue || "").trim();
  const explicitLevel = classLevelFromImportText(levelValue);
  const parsedFromName = importedClassFromText(name);
  const level = explicitLevel || parsedFromName?.level || classLevelFromImportText(name);
  if (!level) return null;
  if (parsedFromName && !explicitLevel) return parsedFromName;
  let labelSource = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(?:classe|division|groupe|niveau)\b/ig, " ").replace(/\b(?:cap\s*[12]|bts\s*[12]|2\s*(?:de|nde)|seconde|1\s*(?:ere|re)|premiere|t\s*le|tle|terminale|[3-6]\s*(?:eme|e)?)s?\b/ig, " ");
  if (explicitLevel === "CAP1") labelSource = labelSource.replace(/^\s*(?:cap\s*1|1\s*cap|1)\s*/i, "");
  if (explicitLevel === "CAP2") labelSource = labelSource.replace(/^\s*(?:cap\s*2|2\s*cap|2)\s*/i, "");
  if (explicitLevel === "BTS1") labelSource = labelSource.replace(/^\s*(?:bts\s*1|1\s*bts|1)\s*/i, "");
  if (explicitLevel === "BTS2") labelSource = labelSource.replace(/^\s*(?:bts\s*2|2\s*bts|2)\s*/i, "");
  if (explicitLevel === "2de") labelSource = labelSource.replace(/^\s*(?:2\s*(?:de|nde)?|seconde)\s*/i, "");
  if (explicitLevel === "1ere") labelSource = labelSource.replace(/^\s*(?:1\s*(?:ere|re)?|premiere)\s*/i, "");
  if (explicitLevel === "Tle") labelSource = labelSource.replace(/^\s*(?:t\s*(?:le)?|terminale)\s*/i, "");
  const collegeLevel = explicitLevel.match(/^([3-6])e$/);
  if (collegeLevel) labelSource = labelSource.replace(new RegExp(`^\\s*${collegeLevel[1]}\\s*(?:eme|e)?\\s*`, "i"), "");
  const label = cleanImportedClassLabel(labelSource);
  if (!label) return null;
  return {
    level,
    label
  };
}
export function addImportedClass(found, parsed) {
  if (!parsed || !found[parsed.level]) return;
  found[parsed.level].add(parsed.label);
}
export function findClassImportHeader(rows) {
  const nameKeys = new Set(["nom", "classe", "classes", "nomclasse", "nomdelaclasse", "libelle", "libelleclasse", "division", "divisions", "code", "codeclasse"]);
  const levelKeys = new Set(["niveau", "niveaux", "niv", "niveauclasse"]);
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
    const keys = (rows[rowIndex] || []).map(csvImportHeaderKey);
    const levelIndex = keys.findIndex(key => levelKeys.has(key));
    const nameIndex = keys.findIndex(key => nameKeys.has(key));
    if (nameIndex >= 0 || levelIndex >= 0) return {
      rowIndex,
      nameIndex,
      levelIndex
    };
  }
  return null;
}
export function establishmentTypeForImportedLevels(found) {
  const levels = Object.entries(found).filter(([, labels]) => labels.size).map(([level]) => level);
  const hasCollege = levels.some(level => state.classLevelsByEstablishmentType["collège"].includes(level));
  const hasLycee = levels.some(level => state.classLevelsByEstablishmentType["lycée"].includes(level));
  if (hasCollege && hasLycee) throw new Error("Le CSV contient des niveaux college et lycee. Importez un fichier par type d'etablissement.");
  return hasLycee ? "lycée" : "collège";
}
export function establishmentTypeForImportedLevelsSafe(found) {
  const levels = Object.entries(found).filter(([, labels]) => labels.size).map(([level]) => level);
  const hasCollege = levels.some(level => ["6e", "5e", "4e", "3e"].includes(level));
  const hasLycee = levels.some(level => ["CAP1", "CAP2", "2de", "1ere", "Tle", "BTS1", "BTS2"].includes(level));
  if (hasCollege && hasLycee) throw new Error("Le CSV contient des niveaux college et lycee. Importez un fichier par type d'etablissement.");
  return normalizedEstablishmentType(hasLycee ? "lycee" : "college");
}
export function importClassesFromCsvText(text) {
  const allLevels = [...state.classLevelsByEstablishmentType["collège"], ...supportedCsvClassLevels()];
  const found = Object.fromEntries(allLevels.map(level => [level, new Set()]));
  const rows = parseCsvRows(text).filter(row => row.some(cell => String(cell || "").trim()));
  const header = findClassImportHeader(rows);
  if (header) {
    rows.slice(header.rowIndex + 1).forEach(row => {
      const nameValue = header.nameIndex >= 0 ? row[header.nameIndex] : row.find((cell, index) => index !== header.levelIndex && String(cell || "").trim());
      const levelValue = header.levelIndex >= 0 ? row[header.levelIndex] : "";
      addImportedClass(found, importedClassFromFields(nameValue, levelValue));
    });
  } else {
    rows.forEach(row => {
      row.forEach((cell, index) => {
        const level = classLevelFromImportText(cell);
        if (!level) return;
        row.forEach((candidate, candidateIndex) => {
          if (candidateIndex !== index) addImportedClass(found, importedClassFromFields(candidate, cell));
        });
      });
    });
  }
  if (!header) rows.flat().forEach(cell => addImportedClass(found, importedClassFromText(cell)));
  const total = Object.values(found).reduce((sum, labels) => sum + labels.size, 0);
  if (!total) throw new Error("Aucune classe reconnue dans le CSV. Vérifiez que le type d'établissement choisi correspond au fichier.");
  const importedType = establishmentTypeForImportedLevelsSafe(found);
  const importedLevels = allLevels.filter(level => found[level]?.size);
  const importedTypeChanged = normalizedEstablishmentType(state.schoolConstraints.establishmentType) !== importedType;
  if (importedTypeChanged) {
    state.schoolConstraints = {
      ...state.schoolConstraints,
      establishmentType: importedType
    };
    syncSchoolSlots();
    state.activityProgramByLevel = normalizeActivityProgramByLevel({});
    state.serviceHoursByLevel = normalizeLevelKeyedObject({}, state.defaultServiceHours, value => Math.max(0, Number(value) || 0));
  }
  state.classLevels = importedLevels;
  state.defaultClassConfig = defaultClassConfigForLevels();
  const nextConfig = Object.fromEntries(state.classLevels.map(level => {
    const labels = [...found[level]].sort((a, b) => a.localeCompare(b, "fr", {
      numeric: true
    }));
    const mode = labels.length && labels.every(label => /^[A-Z]$/.test(label)) ? "letter" : "number";
    return [level, {
      mode,
      labels
    }];
  }));
  nextConfig.importedLevels = importedLevels;
  nextConfig.specialClasses = [];
  state.classConfig = normalizeClassConfig(nextConfig);
  state.specialClassDraftName = "";
  state.specialClassDraftBaseIds = [];
  pageMemory.setItem("planningEpsSchoolConstraints2026", JSON.stringify(state.schoolConstraints));
  pageMemory.setItem("planningEpsActivityProgramByLevel2026", JSON.stringify(state.activityProgramByLevel));
  pageMemory.setItem("planningEpsServiceHoursByLevel2026", JSON.stringify(state.serviceHoursByLevel));
  saveClassConfig();
  if (importedTypeChanged) saveCloudNowIfPossible(["schoolConstraints", "activityProgramByLevel", "serviceHoursByLevel"]);
  return total;
}
export function loadClassConfig() {
  try {
    const saved = pageMemory.getItem("planningEpsClassConfig2026");
    const rawConfig = saved ? JSON.parse(saved) : state.defaultClassConfig;
    applyImportedClassLevels(rawConfig);
    return normalizeClassConfig(rawConfig);
  } catch {
    return normalizeClassConfig(state.defaultClassConfig);
  }
}
export function classesForLevel(level) {
  return (state.classConfig[level]?.labels || []).map(label => schoolClassLabel(level, label));
}
export function classNumbersForLevel(level) {
  return state.classConfig[level]?.labels || [];
}
export function classesFromStandardConfig(config = state.classConfig) {
  return state.classLevels.flatMap(level => (config[level]?.labels || []).map(label => schoolClassLabel(level, label)));
}
export function specialClasses() {
  return Array.isArray(state.classConfig.specialClasses) ? state.classConfig.specialClasses : [];
}
export function specialClassSchoolId(id, baseClassId = "", group = "whole") {
  const normalizedGroup = state.classGroups.some(item => item.id === String(group || "").toUpperCase()) ? String(group || "").toUpperCase() : "whole";
  return `special::${id}${baseClassId ? `::${baseClassId}` : ""}${normalizedGroup !== "whole" ? `::${normalizedGroup}` : ""}`;
}
export function specialClassFromSchoolId(schoolClass) {
  const id = specialClassTypeIdFromSchoolId(schoolClass);
  return specialClasses().find(item => item.id === id) || null;
}
export function specialClassTypeIdFromSchoolId(schoolClass) {
  return String(schoolClass || "").startsWith("special::") ? String(schoolClass).slice("special::".length).split("::")[0] : "";
}
export function specialClassBaseIdFromSchoolId(schoolClass) {
  if (!String(schoolClass || "").startsWith("special::")) return "";
  const parts = String(schoolClass).slice("special::".length).split("::").slice(1);
  const maybeGroup = parts[parts.length - 1] || "";
  return state.classGroups.some(item => item.id === maybeGroup.toUpperCase()) ? parts.slice(0, -1).join("::") : parts.join("::");
}
export function specialClassGroupFromSchoolId(schoolClass) {
  if (!String(schoolClass || "").startsWith("special::")) return "whole";
  const parts = String(schoolClass).slice("special::".length).split("::").slice(1);
  const maybeGroup = parts[parts.length - 1] || "";
  return state.classGroups.some(item => item.id === maybeGroup.toUpperCase()) ? maybeGroup.toUpperCase() : "whole";
}
export function specialClassBaseLabel(item) {
  const baseClassIds = specialClassBaseIds(item);
  return baseClassIds.length ? baseClassIds.map(compactClassName).join(", ") : "Non rattachee";
}
export function specialClassBaseIds(item) {
  const standardClassSet = new Set(classesFromStandardConfig());
  return [...new Set([...(Array.isArray(item?.baseClassIds) ? item.baseClassIds : []), item?.baseClassId || ""].filter(schoolClass => standardClassSet.has(schoolClass)))];
}
export function specialClassInstances() {
  const levelRank = Object.fromEntries(state.classLevels.map((level, index) => [level, index]));
  return specialClasses().flatMap(item => {
    const baseClassIds = specialClassBaseIds(item);
    const targets = baseClassIds.length ? baseClassIds : [""];
    return targets.map(baseClassId => ({
      item,
      baseClassId,
      schoolClass: specialClassSchoolId(item.id, baseClassId)
    }));
  }).sort((a, b) => {
    const aParts = classParts(a.baseClassId);
    const bParts = classParts(b.baseClassId);
    const levelDiff = (levelRank[aParts.level] ?? 99) - (levelRank[bParts.level] ?? 99);
    if (levelDiff) return levelDiff;
    return compactClassName(a.baseClassId).localeCompare(compactClassName(b.baseClassId), "fr", {
      numeric: true
    });
  });
}
export function specialClassHoursForSchoolClass(schoolClass) {
  const item = specialClassFromSchoolId(schoolClass);
  if (!item) return 0;
  const baseClassId = specialClassBaseIdFromSchoolId(schoolClass);
  if (baseClassId && item.hoursByClass && item.hoursByClass[baseClassId] !== undefined) return Number(item.hoursByClass[baseClassId]) || 0;
  return Number(item.hours || 0);
}
export function specialClassInstanceForBaseClass(baseClassId) {
  return specialClassInstances().find(instance => instance.baseClassId === baseClassId) || null;
}
export function serviceClassIdForBaseClass(baseClassId) {
  return specialClassInstanceForBaseClass(baseClassId)?.schoolClass || baseClassId;
}
export function serviceClassesForLevel(level) {
  return classesForLevel(level).map(serviceClassIdForBaseClass);
}
export function halfGroupBaseClass(schoolClass) {
  const parts = classParts(schoolClass);
  if (parts.special) return specialClassSchoolId(parts.specialId || parts.number, parts.baseClassId || "");
  if (!parts.level || !parts.number) return schoolClass;
  return schoolClassLabel(parts.level, parts.number);
}
export function constructionServiceClassIdForTotals(schoolClass) {
  return serviceClassIdForBaseClass(halfGroupBaseClass(schoolClass));
}
export function constructionClassChoicesForLevel(level) {
  return serviceClassesForLevel(level);
}
export function classesFromConfig() {
  return [...classesFromStandardConfig(), ...specialClassInstances().map(instance => instance.schoolClass)];
}
export function validClassSet() {
  return new Set(state.classes);
}
export function baseClassFromGroupedClass(schoolClass) {
  const parts = classParts(schoolClass);
  if (parts.special) return specialClassSchoolId(parts.specialId || parts.number, parts.baseClassId || "");
  return parts.level && parts.number ? schoolClassLabel(parts.level, parts.number) : schoolClass;
}
export function normalizeBlockClassReferences(block) {
  if (!block || typeof block !== "object") return block;
  const teacherClasses = block.teacherClasses && typeof block.teacherClasses === "object" ? Object.fromEntries(Object.entries(block.teacherClasses).map(([teacherId, schoolClass]) => [teacherId, normalizeSchoolClassId(schoolClass)])) : block.teacherClasses;
  return {
    ...block,
    schoolClass: normalizeSchoolClassId(block.schoolClass),
    teacherClasses
  };
}
export function normalizeConstructionRuleClassReferences(rule) {
  if (!rule || typeof rule !== "object") return rule;
  const cycleOverrides = rule.cycleOverrides && typeof rule.cycleOverrides === "object" ? Object.fromEntries(Object.entries(rule.cycleOverrides).map(([cycleId, override]) => [cycleId, normalizeBlockClassReferences(override)])) : rule.cycleOverrides;
  return {
    ...rule,
    block: normalizeBlockClassReferences(rule.block),
    cycleOverrides
  };
}
export function pruneClassReferences() {
  const valid = validClassSet();
  state.constructionRules = state.constructionRules.map(normalizeConstructionRuleClassReferences);
  state.constructionPlan = Object.fromEntries(Object.entries(state.constructionPlan).map(([key, items]) => [key, (items || []).map(item => normalizeBlockClassReferences(item))]));
  state.serviceAssignments = Object.fromEntries(Object.entries(state.serviceAssignments).map(([teacherId, rows]) => [teacherId, Array.isArray(rows) ? rows.map(row => ({
    ...row,
    classId: normalizeSchoolClassId(row.classId)
  })).filter(row => !row.classId || valid.has(row.classId)) : []]));
  state.unavailableClassIds = state.unavailableClassIds.map(normalizeSchoolClassId).filter(schoolClass => valid.has(schoolClass) || valid.has(baseClassFromGroupedClass(schoolClass)));
  state.facilityUnavailability = state.facilityUnavailability.map(item => ({
    ...item,
    classIds: (item.classIds || []).map(normalizeSchoolClassId).filter(schoolClass => valid.has(schoolClass) || valid.has(baseClassFromGroupedClass(schoolClass)))
  }));
  state.sportEvents = state.sportEvents.map(event => ({
    ...event,
    classes: (event.classes || []).map(normalizeSchoolClassId).filter(schoolClass => valid.has(schoolClass) || valid.has(baseClassFromGroupedClass(schoolClass)))
  }));
  state.constructionRules = state.constructionRules.filter(rule => rule.block?.optionBlock || valid.has(baseClassFromGroupedClass(rule.block?.schoolClass || "")));
  state.constructionPlan = Object.fromEntries(Object.entries(state.constructionPlan).map(([key, items]) => [key, (items || []).filter(item => item.optionBlock || valid.has(baseClassFromGroupedClass(item.schoolClass || "")))]));
}
export function saveClassConfig() {
  state.classes = classesFromConfig();
  pruneClassReferences();
  state.activityProgramByClass = normalizeActivityProgramByClass(state.activityProgramByClass);
  state.sportEvents = normalizePlanningItems(state.sportEvents);
  pageMemory.setItem("planningEpsClassConfig2026", JSON.stringify(state.classConfig));
  pageMemory.setItem("planningEpsActivityProgramByClass2026", JSON.stringify(state.activityProgramByClass));
  pageMemory.setItem("planningEpsServiceAssignments2026", JSON.stringify(state.serviceAssignments));
  pageMemory.setItem("planningEpsFacilityUnavailability2026", JSON.stringify(state.facilityUnavailability));
  pageMemory.setItem("planningEpsSportEvents2026", JSON.stringify(state.sportEvents));
  pageMemory.setItem("planningEpsConstructionRules2026", JSON.stringify(state.constructionRules));
  pageMemory.setItem("planningEpsConstruction2026", JSON.stringify(state.constructionPlan));
  saveCloudNowIfPossible(["classConfig", "activityProgramByClass", "serviceAssignments", "facilityUnavailability", "sportEvents", "constructionRules", "constructionPlan"]);
}
export function loadServiceHoursByLevel() {
  try {
    const saved = pageMemory.getItem("planningEpsServiceHoursByLevel2026");
    return normalizeLevelKeyedObject(saved ? JSON.parse(saved) : {}, state.defaultServiceHours, value => Math.max(0, Number(value) || 0));
  } catch {
    return {
      ...state.defaultServiceHours
    };
  }
}
export function saveServiceHoursByLevel(immediateCloud = true) {
  invalidateConstructionChecksCache();
  state.serviceHoursByLevel = normalizeLevelKeyedObject(state.serviceHoursByLevel, state.defaultServiceHours, value => Math.max(0, Number(value) || 0));
  pageMemory.setItem("planningEpsServiceHoursByLevel2026", JSON.stringify(state.serviceHoursByLevel));
  if (immediateCloud) saveCloudNowIfPossible(["serviceHoursByLevel"]);else scheduleCloudSave(["serviceHoursByLevel"]);
}
export function normalizeServiceAssignments(assignments) {
  return Object.fromEntries(Object.entries(assignments || {}).map(([teacherId, rows]) => [teacherId, Array.isArray(rows) ? rows.map(row => ({
    ...row,
    classId: normalizeSchoolClassId(row.classId)
  })) : []]));
}
export function loadServiceAssignments() {
  try {
    const saved = pageMemory.getItem("planningEpsServiceAssignments2026");
    return normalizeServiceAssignments(saved ? JSON.parse(saved) : {});
  } catch {
    return {};
  }
}
export function saveServiceAssignments(immediateCloud = true) {
  invalidateConstructionChecksCache();
  state.serviceAssignments = normalizeServiceAssignments(state.serviceAssignments);
  pageMemory.setItem("planningEpsServiceAssignments2026", JSON.stringify(state.serviceAssignments));
  if (immediateCloud) saveCloudNowIfPossible(["serviceAssignments"]);else scheduleCloudSave(["serviceAssignments"]);
}
export function shadeColor(hex, amount) {
  const raw = hex.replace("#", "");
  const num = parseInt(raw.length === 3 ? raw.split("").map(char => char + char).join("") : raw, 16);
  const clamp = value => Math.max(0, Math.min(255, value));
  const r = clamp((num >> 16) + amount);
  const g = clamp((num >> 8 & 255) + amount);
  const b = clamp((num & 255) + amount);
  return `#${[r, g, b].map(value => value.toString(16).padStart(2, "0")).join("")}`;
}
export function loadConstructionRules() {
  try {
    const saved = pageMemory.getItem("planningEpsConstructionRules2026");
    if (saved) return JSON.parse(saved);
    const legacy = pageMemory.getItem("planningEpsConstruction2026");
    if (!legacy) return [];
    const legacyPlan = JSON.parse(legacy);
    const seen = new Set();
    const migrated = [];
    Object.entries(legacyPlan).forEach(([key, items]) => {
      const {
        rowId,
        weekRank
      } = parseYearCellKey(key);
      const weekItem = schoolYearWeeks().find(item => item.rank === weekRank);
      const cycle = weekItem ? cycleForWeek(weekItem) : null;
      if (!cycle || !Array.isArray(items)) return;
      items.forEach(item => {
        const teacherIds = item.teacherIds || [item.teacherId].filter(Boolean);
        const signature = `${rowId}|${item.cycleId || cycle.id}|${teacherIds.join("+")}|${item.schoolClass}|${item.facilityId}`;
        if (seen.has(signature)) return;
        seen.add(signature);
        migrated.push({
          id: item.ruleId || `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          rowId,
          cycleId: item.cycleId || cycle.id,
          block: {
            teacherIds,
            teacherNames: item.teacherNames || item.teacherName,
            teacherId: item.teacherId,
            teacherName: item.teacherName,
            coTeacherHours: item.coTeacherHours || {},
            color: item.color,
            border: item.border,
            schoolClass: item.schoolClass,
            facilityId: item.facilityId,
            facilityLabel: item.facilityLabel
          }
        });
      });
    });
    return migrated;
  } catch {
    return [];
  }
}
export function saveConstructionRules(immediateCloud = true) {
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsConstructionRules2026", JSON.stringify(state.constructionRules));
  if (immediateCloud) saveCloudNowIfPossible(["constructionRules"]);
}
export function loadConstructionWorkspaceMode() {
  try {
    const saved = pageMemory.getItem("planningEpsConstructionWorkspaceMode2026");
    return ["manual", "optimized"].includes(saved) ? saved : "manual";
  } catch {
    return "manual";
  }
}
export function saveConstructionWorkspaceMode() {
  pageMemory.setItem("planningEpsConstructionWorkspaceMode2026", state.constructionWorkspaceMode);
  scheduleCloudSave(["constructionWorkspaceMode"]);
}
export function loadConstructionVersions() {
  try {
    const saved = pageMemory.getItem("planningEpsConstructionVersions2026");
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
export function saveConstructionVersions() {
  pageMemory.setItem("planningEpsConstructionVersions2026", JSON.stringify(state.constructionVersions));
  scheduleCloudSave(["constructionVersions"]);
}
export function defaultConstructionLocks() {
  return {
    blocks: false,
    cycleDetails: {}
  };
}
export function normalizeConstructionLocks(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    blocks: Boolean(source.blocks),
    cycleDetails: source.cycleDetails && typeof source.cycleDetails === "object" ? Object.fromEntries(Object.entries(source.cycleDetails).map(([key, locked]) => [key, Boolean(locked)])) : {}
  };
}
export function loadConstructionLocks() {
  try {
    const saved = pageMemory.getItem("planningEpsConstructionLocks2026");
    return normalizeConstructionLocks(saved ? JSON.parse(saved) : defaultConstructionLocks());
  } catch {
    return defaultConstructionLocks();
  }
}
export function saveConstructionLocks() {
  state.constructionLocks = normalizeConstructionLocks(state.constructionLocks);
  pageMemory.setItem("planningEpsConstructionLocks2026", JSON.stringify(state.constructionLocks));
  saveLocksToCloudNow(["constructionLocks"]);
}
export function constructionBuildLocked(mode = state.constructionBuildMode, cycleId = state.activeConstructionCycleId) {
  if (mode === "blocks") return Boolean(state.constructionLocks.blocks);
  if (mode === "cycleDetails") return Boolean(state.constructionLocks.cycleDetails?.[cycleId]);
  return false;
}
export function normalizeConstructionRuleSettings(items) {
  const source = Array.isArray(items) ? items : state.defaultConstructionRuleSettings;
  const defaultIds = new Set(state.defaultConstructionRuleSettings.map(item => item.id));
  const canonicalConstructionRuleId = id => {
    const value = String(id || "");
    if (value === "service-théorique" || value === "service-th\u00c3\u00a9orique") return "service-theorique";
    return value;
  };
  const normalized = source.map(item => ({
    ...item,
    id: canonicalConstructionRuleId(item?.id)
  })).filter(item => defaultIds.has(item?.id)).map(item => ({
    id: String(item?.id || `rule-setting-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    category: state.defaultConstructionRuleSettings.find(rule => rule.id === item?.id)?.category || String(item?.category || "Regle personnalisée").trim() || "Regle personnalisée",
    title: String(item?.title || "").trim(),
    detail: String(item?.detail || "").trim()
  })).filter(item => item.title || item.detail);
  const existingIds = new Set(normalized.map(item => item.id));
  const missingDefaults = state.defaultConstructionRuleSettings.filter(item => !existingIds.has(item.id)).map(item => ({
    ...item
  }));
  return [...normalized, ...missingDefaults];
}
export function loadConstructionRuleSettings() {
  try {
    const saved = pageMemory.getItem("planningEpsConstructionRuleSettings2026");
    return normalizeConstructionRuleSettings(saved ? JSON.parse(saved) : state.defaultConstructionRuleSettings);
  } catch {
    return normalizeConstructionRuleSettings(state.defaultConstructionRuleSettings);
  }
}
export function saveConstructionRuleSettings() {
  state.constructionRuleSettings = normalizeConstructionRuleSettings(state.constructionRuleSettings);
  pageMemory.setItem("planningEpsConstructionRuleSettings2026", JSON.stringify(state.constructionRuleSettings));
  saveCloudNowIfPossible(["constructionRuleSettings"]);
}
export function resetConstructionRuleSettings() {
  state.constructionRuleSettings = normalizeConstructionRuleSettings(state.defaultConstructionRuleSettings);
  saveConstructionRuleSettings();
}
export function loadBlockExclusions() {
  try {
    const saved = pageMemory.getItem("planningEpsBlockExclusions2026");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}
export function saveBlockExclusions() {
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsBlockExclusions2026", JSON.stringify(state.blockExclusions));
  saveCloudNowIfPossible(["blockExclusions"]);
}
export function normalizeAcceptedConflicts(items) {
  return Array.isArray(items) ? items.filter(item => item?.key).map(item => ({
    key: String(item.key),
    title: String(item.title || ""),
    label: String(item.label || ""),
    detail: String(item.detail || ""),
    acceptedAt: item.acceptedAt || new Date().toISOString()
  })) : [];
}
export function loadAcceptedConflicts() {
  try {
    const saved = pageMemory.getItem("planningEpsAcceptedConflicts2026");
    return normalizeAcceptedConflicts(saved ? JSON.parse(saved) : []);
  } catch {
    return [];
  }
}
export function saveAcceptedConflicts() {
  state.acceptedConflicts = normalizeAcceptedConflicts(state.acceptedConflicts);
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsAcceptedConflicts2026", JSON.stringify(state.acceptedConflicts));
  saveCloudNowIfPossible(["acceptedConflicts"]);
}
export function isBlockExcluded(ruleId, key) {
  return Array.isArray(state.blockExclusions[ruleId]) && state.blockExclusions[ruleId].includes(key);
}
export function isAnnualConstructionRule(rule) {
  return rule?.scope === "year" || rule?.cycleId === "year";
}
export function constructionCyclesForRule(rule) {
  if (!rule) return [];
  if (!isAnnualConstructionRule(rule)) return [findCycleForRule(rule)].filter(Boolean);
  if (rule.block?.optionBlock) {
    const optionCycles = state.cycles.slice(0, 4);
    const selectedIds = Array.isArray(rule.block.optionCycleIds) ? rule.block.optionCycleIds : [];
    return selectedIds.length ? optionCycles.filter(cycle => selectedIds.includes(cycle.id)) : optionCycles;
  }
  const level = rule.classLevel || classParts(rule.block?.schoolClass || "").level || "";
  const scopedCycles = cyclesForClassLevel(level);
  return (scopedCycles.length ? scopedCycles : state.cycles).slice(0, 4);
}
export function constructionCycleForRuleById(rule, cycleId) {
  const ruleCycles = constructionCyclesForRule(rule);
  const genericCycle = constructionCycleById(cycleId) || (cycleId ? {
    id: cycleId,
    name: cycleId
  } : null);
  return ruleCycles.find(cycle => cycle.id === cycleId) || ruleCycles.find(cycle => cyclesRepresentSameSlot(cycle, genericCycle)) || genericCycle || ruleCycles[0] || null;
}
export function constructionCycleForBlockById(block, cycleId) {
  const level = classParts(block?.schoolClass || "").level || "";
  const levelCycles = cyclesForClassLevel(level);
  const genericCycle = constructionCycleById(cycleId) || (cycleId ? {
    id: cycleId,
    name: cycleId
  } : null);
  return levelCycles.find(cycle => cycle.id === cycleId) || levelCycles.find(cycle => cyclesRepresentSameSlot(cycle, genericCycle)) || constructionCycleById(cycleId) || levelCycles[0] || null;
}
export function cycleOrdinal(cycle) {
  const matches = String(cycle?.id || cycle?.name || "").match(/\d+/g);
  return matches?.length ? Number(matches[matches.length - 1]) : null;
}
export function cyclesRepresentSameSlot(firstCycle, secondCycle) {
  if (!firstCycle || !secondCycle) return false;
  if (firstCycle.id === secondCycle.id) return true;
  const firstOrdinal = cycleOrdinal(firstCycle);
  const secondOrdinal = cycleOrdinal(secondCycle);
  return firstOrdinal !== null && firstOrdinal === secondOrdinal;
}
export function optionCycleChoices() {
  return state.cycles.slice(0, 4);
}
export function allOptionCycleIds() {
  return optionCycleChoices().map(cycle => cycle.id);
}
export function normalizedOptionCycleIds(ids = state.blockOptionCycleIds) {
  const validIds = new Set(allOptionCycleIds());
  const selected = (Array.isArray(ids) ? ids : []).filter(id => validIds.has(id));
  return selected.length ? selected : allOptionCycleIds();
}
export function optionAnnualFactorForRule(rule) {
  if (!rule?.block?.optionBlock) return 1;
  const totalCycles = optionCycleChoices().length || 1;
  const selectedCycles = constructionCyclesForRule(rule).length || totalCycles;
  return selectedCycles / totalCycles;
}
export function cycleOverrideForRule(rule, cycleId) {
  const overrides = rule?.cycleOverrides && typeof rule.cycleOverrides === "object" ? rule.cycleOverrides : {};
  const targetCycle = constructionCycleForRuleById(rule, cycleId) || constructionCycleById(cycleId) || {
    id: cycleId,
    name: cycleId
  };
  if (targetCycle?.id && overrides[targetCycle.id]) return overrides[targetCycle.id];
  if (overrides[cycleId]) return overrides[cycleId];
  const fallbackEntry = Object.entries(overrides).find(([overrideCycleId]) => {
    const overrideCycle = constructionCycleForRuleById(rule, overrideCycleId) || constructionCycleById(overrideCycleId) || {
      id: overrideCycleId,
      name: overrideCycleId
    };
    return cyclesRepresentSameSlot(overrideCycle, targetCycle);
  });
  return fallbackEntry?.[1] || {};
}
export function blockWithCycleOverride(rule, cycle) {
  const override = cycleOverrideForRule(rule, cycle.id);
  const facilityId = override.facilityId !== undefined ? override.facilityId : rule.block?.facilityId || "";
  const activityId = override.activityId !== undefined ? override.activityId : rule.block?.activityId || "";
  const optionId = rule.block?.optionId || override.optionId || "";
  const option = optionId ? serviceFreeOptionById(optionId) : null;
  const optionHours = option ? normalizedOptionHours(optionId, rule.block?.optionHours || override.optionHours || option.hours) : 0;
  const facility = state.facilities.find(item => item.id === facilityId);
  const activity = constructionActivityById(activityId);
  return {
    ...rule.block,
    facilityId: facility?.id || "",
    facilityLabel: facility?.label || "",
    activityId: activity?.id || (option ? serviceFreeActivityId(option.label) : ""),
    activityLabel: activity?.label || option?.label || "",
    optionBlock: Boolean(rule.block?.optionBlock || option),
    optionId: option?.id || "",
    optionTeacherId: option?.teacherId || "",
    optionRowId: option?.rowId || "",
    optionLabel: option?.label || "",
    optionHours
  };
}
export function buildConstructionPlanFromRules() {
  const plan = {};
  state.constructionRules.forEach(rule => {
    constructionCyclesForRule(rule).forEach(cycle => {
      weeksForCycle(cycle).forEach(weekItem => {
        if (rule.weekLetter && rule.weekLetter !== "all" && weekItem.letter !== rule.weekLetter) return;
        if (ruleBlockedByUnavailable(rule, weekItem)) return;
        const key = yearCellKey(rule.rowId, weekItem.rank);
        if (isBlockExcluded(rule.id, key)) return;
        if (isRuleExcluded(rule.id, key)) return;
        if (!plan[key]) plan[key] = [];
        plan[key].push({
          ...blockWithCycleOverride(rule, cycle),
          ruleId: rule.id,
          cycleId: cycle.id,
          cycleName: displayCycleName(cycle),
          weekLetter: rule.weekLetter || "all"
        });
      });
    });
  });
  return plan;
}
export function constructionRuleActiveKeys(rule) {
  const keys = [];
  constructionCyclesForRule(rule).forEach(cycle => {
    weeksForCycle(cycle).forEach(weekItem => {
      if (rule.weekLetter && rule.weekLetter !== "all" && weekItem.letter !== rule.weekLetter) return;
      keys.push(yearCellKey(rule.rowId, weekItem.rank));
    });
  });
  return [...new Set(keys)];
}
export function constructionRuleVisibleKeys(rule) {
  return constructionRuleActiveKeys(rule).filter(key => !isBlockExcluded(rule.id, key) && !isRuleExcluded(rule.id, key));
}
export function normalizedConstructionRuleSignature(rule) {
  if (!isAnnualConstructionRule(rule) || !rule?.block || rule.block.optionBlock) return "";
  const teacherClassPairs = teacherIdsForBlock(rule.block).map(teacherId => {
    const rawClass = teacherClassForBlock(rule.block, teacherId);
    const schoolClass = rawClass ? serviceClassIdForBaseClass(rawClass) : "";
    return teacherId && schoolClass ? `${teacherId}:${schoolClass}` : "";
  }).filter(Boolean).sort().join("|");
  if (!teacherClassPairs) return "";
  return `${rule.rowId}::${rule.weekLetter || "all"}::${teacherClassPairs}`;
}
export function mergeCycleOverrides(targetRule, sourceRule) {
  targetRule.cycleOverrides = {
    ...(sourceRule.cycleOverrides || {}),
    ...(targetRule.cycleOverrides || {})
  };
}
export function hiddenConstructionRuleReport(rule, reason) {
  const row = yearRows().find(item => item.id === rule.rowId);
  const exclusionCount = Array.isArray(state.blockExclusions[rule.id]) ? state.blockExclusions[rule.id].length : 0;
  return {
    id: rule.id,
    reason,
    day: row?.day || "",
    slot: row?.slot?.label || "",
    rhythm: rule.weekLetter && rule.weekLetter !== "all" ? `Semaine ${rule.weekLetter}` : "Toutes les semaines",
    teachers: teacherLabelForBlock(rule.block),
    classes: blockClassLabel(rule.block),
    hiddenSlots: exclusionCount
  };
}
export function saveHiddenConstructionReport(items) {
  if (!items.length) return;
  pageMemory.setItem("planningEpsHiddenConstructionBlocksReport2026", JSON.stringify({
    savedAt: new Date().toISOString(),
    items
  }));
}
export function loadHiddenConstructionReport() {
  try {
    const saved = pageMemory.getItem("planningEpsHiddenConstructionBlocksReport2026");
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}
export function pruneHiddenAndDuplicateConstructionRules() {
  const duplicateBySignature = new Map();
  const removedIds = new Set();
  const reportItems = [];
  state.constructionRules.forEach(rule => {
    if (!rule?.id) return;
    const activeKeys = constructionRuleActiveKeys(rule);
    if (isAnnualConstructionRule(rule) && Array.isArray(state.blockExclusions[rule.id]) && state.blockExclusions[rule.id].length) {
      removedIds.add(rule.id);
      reportItems.push(hiddenConstructionRuleReport(rule, "Bloc annuel masqué par une suppression de créneau"));
      return;
    }
    if (activeKeys.length && !constructionRuleVisibleKeys(rule).length) {
      removedIds.add(rule.id);
      reportItems.push(hiddenConstructionRuleReport(rule, "Bloc entierement invisible"));
      return;
    }
    const signature = normalizedConstructionRuleSignature(rule);
    if (!signature) return;
    const existing = duplicateBySignature.get(signature);
    if (!existing) {
      duplicateBySignature.set(signature, rule);
      return;
    }
    mergeCycleOverrides(existing, rule);
    removedIds.add(rule.id);
    reportItems.push(hiddenConstructionRuleReport(rule, "Doublon annuel equivalent apres fusion des classes specifiques"));
  });
  if (!removedIds.size) return false;
  state.constructionRules = state.constructionRules.filter(rule => !removedIds.has(rule.id));
  removedIds.forEach(ruleId => delete state.blockExclusions[ruleId]);
  saveHiddenConstructionReport(reportItems);
  return true;
}
export function refreshConstructionPlanFromRulesLocalOnly() {
  pruneHiddenAndDuplicateConstructionRules();
  state.constructionPlan = buildConstructionPlanFromRules();
  pageMemory.setItem("planningEpsConstructionRules2026", JSON.stringify(state.constructionRules));
  pageMemory.setItem("planningEpsConstruction2026", JSON.stringify(state.constructionPlan));
  pageMemory.setItem("planningEpsBlockExclusions2026", JSON.stringify(state.blockExclusions));
  invalidateConstructionChecksCache();
}
export function rebuildConstructionPlan() {
  pruneHiddenAndDuplicateConstructionRules();
  state.constructionPlan = buildConstructionPlanFromRules();
  saveConstructionRules(false);
  saveConstructionPlan(false);
  pageMemory.setItem("planningEpsBlockExclusions2026", JSON.stringify(state.blockExclusions));
  saveCloudNowIfPossible(["constructionRules", "constructionPlan", "blockExclusions"]);
}
export function loadSportEvents() {
  try {
    const saved = pageMemory.getItem("planningEpsSportEvents2026");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}
export function saveSportEvents(immediateCloud = true) {
  state.sportEvents = normalizePlanningItems(state.sportEvents);
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsSportEvents2026", JSON.stringify(state.sportEvents));
  if (immediateCloud) saveCloudPatchNow(["sportEvents"]);
}
export function loadAsSessions() {
  try {
    const saved = pageMemory.getItem("planningEpsAsSessions2026");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}
export function saveAsSessions() {
  invalidateConstructionChecksCache();
  state.asSessions = normalizePlanningItems(state.asSessions);
  pageMemory.setItem("planningEpsAsSessions2026", JSON.stringify(state.asSessions));
  saveCloudPatchNow(["asSessions"]);
}
export function inferredFacilityLocationType(facility) {
  const label = String(facility?.label || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/cour|stade|terrain|basket|football|athletisme|piste|exterieur|plein air/.test(label)) return "outdoor";
  if (/salle|gymnase|dojo|boxe|badminton|piscine|interieur/.test(label)) return "indoor";
  return facility?.type === "internal" ? "outdoor" : "indoor";
}
export function normalizeFacility(facility) {
  const type = facility?.type === "internal" ? "internal" : "external";
  const locationType = facility?.locationType === "outdoor" || facility?.locationType === "indoor" ? facility.locationType : inferredFacilityLocationType({
    ...facility,
    type
  });
  return {
    ...facility,
    type,
    locationType
  };
}
export function normalizeFacilities(items) {
  return (Array.isArray(items) ? items : state.defaultFacilities).map(normalizeFacility);
}
export function facilityTypeLabel(type) {
  return type === "external" ? "Externe à l’établissement" : "Interne à l’établissement";
}
export function facilityLocationTypeLabel(locationType) {
  return locationType === "outdoor" ? "En extérieur" : "En intérieur";
}
export function loadFacilities() {
  try {
    const saved = pageMemory.getItem("planningEpsFacilities2026");
    const parsed = saved ? JSON.parse(saved) : null;
    if (!Array.isArray(parsed)) return normalizeFacilities(state.defaultFacilities);
    return normalizeFacilities(parsed);
  } catch {
    return normalizeFacilities(state.defaultFacilities);
  }
}
export function saveFacilities() {
  invalidateConstructionChecksCache();
  state.facilities = normalizeFacilities(state.facilities);
  pageMemory.setItem("planningEpsFacilities2026", JSON.stringify(state.facilities));
  saveCloudNowIfPossible(["facilities", "facilityActivities"]);
}
export function syncConstructionFacilityLabel(facilityId, label) {
  const updateBlock = block => {
    if (!block || block.facilityId !== facilityId) return block;
    return {
      ...block,
      facilityLabel: label
    };
  };
  state.constructionRules = state.constructionRules.map(rule => ({
    ...rule,
    block: updateBlock(rule.block),
    cycleOverrides: rule.cycleOverrides && typeof rule.cycleOverrides === "object" ? Object.fromEntries(Object.entries(rule.cycleOverrides).map(([cycleId, override]) => [cycleId, updateBlock(override)])) : rule.cycleOverrides
  }));
  state.constructionPlan = Object.fromEntries(Object.entries(state.constructionPlan).map(([key, items]) => [key, (items || []).map(updateBlock)]));
}
export function loadActivities() {
  try {
    const saved = pageMemory.getItem("planningEpsActivities2026");
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
export function saveActivities() {
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsActivities2026", JSON.stringify(state.activities));
  saveCloudNowIfPossible(["activities", "facilityActivities", "activityProgramByLevel", "constructionRules"]);
}
export function loadFacilityActivities() {
  try {
    const saved = pageMemory.getItem("planningEpsFacilityActivities2026");
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
export function pruneFacilityActivities() {
  const facilityIds = new Set(state.facilities.map(facility => facility.id));
  const activityIds = new Set(state.activities.map(activity => activity.id));
  state.facilityActivities = Object.fromEntries(Object.entries(state.facilityActivities).filter(([facilityId]) => facilityIds.has(facilityId)).map(([facilityId, ids]) => [facilityId, Array.isArray(ids) ? ids.filter(id => activityIds.has(id)) : []]));
  state.activityProgramByLevel = normalizeActivityProgramByLevel(state.activityProgramByLevel);
  state.activityProgramByClass = normalizeActivityProgramByClass(state.activityProgramByClass);
}
export function normalizeActivityProgramByLevel(program) {
  const activityIds = new Set(state.activities.map(activity => activity.id));
  const canonicalProgram = normalizeLevelKeyedObject(program || {});
  return Object.fromEntries(state.classLevels.map(level => {
    const ids = Array.isArray(canonicalProgram?.[level]) ? canonicalProgram[level] : [];
    return [level, ids.filter((id, index) => activityIds.has(id) && ids.indexOf(id) === index)];
  }));
}
export function normalizeActivityProgramByClass(program) {
  const activityIds = new Set(state.activities.map(activity => activity.id));
  const validClasses = new Set(classesFromConfig());
  return Object.fromEntries(Object.entries(program || {}).map(([schoolClass, ids]) => [baseClassFromGroupedClass(normalizeSchoolClassId(schoolClass)), Array.isArray(ids) ? ids : []]).filter(([schoolClass]) => validClasses.has(schoolClass)).map(([schoolClass, ids]) => [schoolClass, ids.filter((id, index) => activityIds.has(id) && ids.indexOf(id) === index)]).filter(([, ids]) => ids.length));
}
export function activityProgramForClass(schoolClass) {
  const normalizedClass = normalizeSchoolClassId(schoolClass);
  const baseClass = baseClassFromGroupedClass(normalizedClass);
  const classProgram = state.activityProgramByClass[baseClass] || state.activityProgramByClass[normalizedClass] || [];
  if (classProgram.length) return classProgram;
  return state.activityProgramByLevel[classParts(baseClass || normalizedClass).level] || [];
}
export function activityProgramForRule(rule) {
  const classItems = classesForBlock(rule?.block).filter(Boolean);
  if (classItems.length) return programActivityIdsForClasses(classItems);
  const level = rule?.classLevel || classParts(rule?.block?.schoolClass || "").level || "";
  return state.activityProgramByLevel[level] || [];
}
export function loadActivityProgramByLevel() {
  try {
    const saved = pageMemory.getItem("planningEpsActivityProgramByLevel2026");
    return normalizeActivityProgramByLevel(saved ? JSON.parse(saved) : {});
  } catch {
    return normalizeActivityProgramByLevel({});
  }
}
export function loadActivityProgramByClass() {
  try {
    const saved = pageMemory.getItem("planningEpsActivityProgramByClass2026");
    return normalizeActivityProgramByClass(saved ? JSON.parse(saved) : {});
  } catch {
    return normalizeActivityProgramByClass({});
  }
}
export function saveActivityProgramByLevel() {
  invalidateConstructionChecksCache();
  state.activityProgramByLevel = normalizeActivityProgramByLevel(state.activityProgramByLevel);
  pageMemory.setItem("planningEpsActivityProgramByLevel2026", JSON.stringify(state.activityProgramByLevel));
  saveCloudNowIfPossible(["activityProgramByLevel"]);
}
export function saveActivityProgramByClass() {
  invalidateConstructionChecksCache();
  state.activityProgramByClass = normalizeActivityProgramByClass(state.activityProgramByClass);
  pageMemory.setItem("planningEpsActivityProgramByClass2026", JSON.stringify(state.activityProgramByClass));
  saveCloudNowIfPossible(["activityProgramByClass"]);
}
export function saveFacilityActivities(immediateCloud = true) {
  invalidateConstructionChecksCache();
  pruneFacilityActivities();
  pageMemory.setItem("planningEpsFacilityActivities2026", JSON.stringify(state.facilityActivities));
  if (immediateCloud) saveCloudNowIfPossible(["facilityActivities"]);else scheduleCloudSave(["facilityActivities"]);
}
export function loadFacilityUnavailability() {
  try {
    const saved = pageMemory.getItem("planningEpsFacilityUnavailability2026");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}
export function saveFacilityUnavailability() {
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsFacilityUnavailability2026", JSON.stringify(state.facilityUnavailability));
  saveCloudNowIfPossible(["facilityUnavailability"]);
}
export function loadEventExclusions() {
  try {
    const saved = pageMemory.getItem("planningEpsEventExclusions2026");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}
export function saveEventExclusions(immediateCloud = true) {
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsEventExclusions2026", JSON.stringify(state.eventExclusions));
  if (immediateCloud) saveCloudPatchNow(["eventExclusions"]);
}
export function loadAsExclusions() {
  try {
    const saved = pageMemory.getItem("planningEpsAsExclusions2026");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}
export function saveAsExclusions() {
  invalidateConstructionChecksCache();
  pageMemory.setItem("planningEpsAsExclusions2026", JSON.stringify(state.asExclusions));
  saveCloudPatchNow(["asExclusions"]);
}
export function itemExcludedForCell(exclusions, itemId, key) {
  return Array.isArray(exclusions[itemId]) && exclusions[itemId].includes(key);
}
export function isRuleExcluded(ruleId, key) {
  return Object.values(state.eventExclusions).some(items => Array.isArray(items) && items.some(item => item.ruleId === ruleId && item.key === key));
}
