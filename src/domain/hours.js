import { state } from "../app/state.js";
import { classParts, classesForBlock, effectiveTeacherHoursForBlock, fullServiceSlotHours, teacherIdsForBlock, yearCellKey } from "./assignments.js";
import { allCycleSets, cyclesForClassLevel } from "./cycles.js";
import { dateKey, displayDateForSchoolWeek, holidayFor, rowDateForWeek, schoolVacations, schoolYearHolidays, schoolYearWeeks, vacationForCell, yearRows } from "./dates.js";
import { asSessionsForCell } from "./events.js";
import { annualConstructionRules } from "./readiness.js";
import { displayCycleName } from "./settings.js";
import { blockWithCycleOverride, constructionCyclesForRule } from "../services/settings-storage.js";
import { dateOnly } from "./dates.js";

export function weeksForCycle(cycle) {
  const start = dateOnly(cycle.start);
  const end = dateOnly(cycle.end);
  return schoolYearWeeks().filter(weekItem => weekItem.end >= start && weekItem.start <= end);
}
export function classicConstructionCycles() {
  return state.cycles.slice(0, 4);
}
export function activeConstructionCycle() {
  const choices = classicConstructionCycles();
  if (!choices.some(cycle => cycle.id === state.activeConstructionCycleId)) state.activeConstructionCycleId = choices[0]?.id || "";
  return choices.find(cycle => cycle.id === state.activeConstructionCycleId) || choices[0] || null;
}
export function representativeWeekForCycle(cycle, letter = "") {
  const cycleWeeks = weeksForCycle(cycle);
  if (!cycleWeeks.length) return null;
  const isRequestedLetter = weekItem => !["A", "B"].includes(letter) || weekItem.letter === letter;
  const usableWeeks = cycleWeeks.filter(weekItem => isRequestedLetter(weekItem) && state.days.every(day => {
    const rowDate = rowDateForWeek({
      day
    }, weekItem);
    const inVacation = schoolVacations().some(vacation => rowDate >= dateOnly(vacation.start) && rowDate <= dateOnly(vacation.end));
    const holiday = schoolYearHolidays().has(dateKey(rowDate));
    return !inVacation && !holiday;
  }));
  if (usableWeeks.length) return usableWeeks[0];
  if (letter === "A" || letter === "B") return cycleWeeks.find(weekItem => weekItem.letter === letter) || cycleWeeks[0];
  return cycleWeeks[0];
}
export function cycleForWeek(weekItem, classLevel = "") {
  return cyclesForClassLevel(classLevel).find(cycle => weeksForCycle(cycle).some(cycleWeek => cycleWeek.rank === weekItem.rank));
}
export function constructionCycleById(cycleId) {
  return allCycleSets().flatMap(set => set.cycles).find(cycle => cycle.id === cycleId) || state.cycles.find(cycle => cycle.id === cycleId) || null;
}
export function findCycleForRule(rule) {
  const level = rule.classLevel || classParts(rule.block?.schoolClass || "").level || "";
  return cyclesForClassLevel(level).find(item => item.id === rule.cycleId) || state.cycles.find(item => item.id === rule.cycleId) || allCycleSets().flatMap(set => set.cycles).find(item => item.id === rule.cycleId);
}
export function plannedHoursForWeeks(weeks) {
  const rows = yearRows();
  const stats = Object.fromEntries(state.teachers.map(teacher => [teacher.id, {
    total: 0,
    details: []
  }]));
  weeks.forEach(weekItem => {
    rows.forEach(row => {
      if (row.isAs) return;
      if (vacationForCell(row, weekItem) || holidayFor(row, weekItem)) return;
      const key = yearCellKey(row.id, weekItem.rank);
      (state.constructionPlan[key] || []).forEach(item => {
        teacherIdsForBlock(item).forEach(teacherId => {
          if (!stats[teacherId]) return;
          const blockHours = effectiveTeacherHoursForBlock(item, teacherId, fullServiceSlotHours(row));
          stats[teacherId].total += blockHours;
          stats[teacherId].details.push({
            week: weekItem,
            day: row.day,
            slot: row.slot,
            hours: blockHours,
            schoolClass: item.schoolClass || "Classe",
            facility: item.facilityLabel || "Installation"
          });
        });
      });
    });
  });
  return stats;
}
export function asHoursForWeeks(weeks) {
  const rows = yearRows().filter(row => row.isAs);
  const stats = Object.fromEntries(state.teachers.map(teacher => [teacher.id, 0]));
  weeks.forEach(weekItem => {
    rows.forEach(row => {
      const duration = row.day === "Mercredi" ? 2.5 : 0.75;
      asSessionsForCell(row, weekItem).forEach(session => {
        (session.teacherIds || []).forEach(teacherId => {
          if (stats[teacherId] === undefined) return;
          stats[teacherId] += duration;
        });
      });
    });
  });
  return stats;
}
export function completeCycleCourseAverages() {
  const rows = yearRows();
  const workingRanks = new Set(workingSchoolWeeks().map(weekItem => weekItem.rank));
  const byTeacher = Object.fromEntries(state.teachers.map(teacher => [teacher.id, {
    total: 0,
    weeks: 0,
    classes: new Set(),
    cycles: []
  }]));
  const cycleEntries = allCycleSets().flatMap(set => set.cycles).filter((cycle, index, list) => list.findIndex(item => item.id === cycle.id) === index);
  cycleEntries.forEach(cycle => {
    const cycleWeeks = weeksForCycle(cycle).filter(weekItem => workingRanks.has(weekItem.rank));
    state.teachers.forEach(teacher => {
      const cycleStats = {
        total: 0,
        weeks: cycleWeeks.length,
        classes: new Set()
      };
      annualConstructionRules().filter(rule => constructionCyclesForRule(rule).some(item => item.id === cycle.id)).forEach(rule => {
        const row = rows.find(item => item.id === rule.rowId);
        if (!row || row.isAs) return;
        cycleWeeks.forEach(weekItem => {
          if (rule.weekLetter && rule.weekLetter !== "all" && rule.weekLetter !== weekItem.letter) return;
          if (vacationForCell(row, weekItem) || holidayFor(row, weekItem)) return;
          const block = blockWithCycleOverride(rule, cycle);
          const teacherIds = teacherIdsForBlock(block);
          if (!teacherIds.includes(teacher.id)) return;
          cycleStats.total += effectiveTeacherHoursForBlock(block, teacher.id, fullServiceSlotHours(row));
          classesForBlock(block).forEach(schoolClass => cycleStats.classes.add(schoolClass));
        });
      });
      const average = cycleStats.weeks ? Math.round(cycleStats.total / cycleStats.weeks * 10) / 10 : 0;
      byTeacher[teacher.id].total += cycleStats.total;
      byTeacher[teacher.id].weeks += cycleStats.weeks;
      cycleStats.classes.forEach(schoolClass => byTeacher[teacher.id].classes.add(schoolClass));
      byTeacher[teacher.id].cycles.push({
        name: displayCycleName(cycle, true),
        average
      });
    });
  });
  return byTeacher;
}
export function uniqueClasses(details) {
  return [...new Set(details.map(detail => detail.schoolClass))].sort((a, b) => a.localeCompare(b, "fr"));
}
export function weeksInSameSchoolMonth(weekItem) {
  const reference = displayDateForSchoolWeek(weekItem);
  return schoolYearWeeks().filter(item => {
    const displayed = displayDateForSchoolWeek(item);
    return displayed.getMonth() === reference.getMonth() && displayed.getFullYear() === reference.getFullYear();
  });
}
export function workingSchoolWeeks() {
  return schoolYearWeeks().filter(weekItem => yearRows().some(row => !vacationForCell(row, weekItem) && !holidayFor(row, weekItem)));
}
export function monthLabelForWeek(weekItem) {
  return displayDateForSchoolWeek(weekItem).toLocaleDateString("fr-FR", {
    month: "short"
  });
}
