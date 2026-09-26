import { state } from "../app/state.js";
import { dateOnly } from "../ui/date-picker.js";

export function getIsoWeekInfo(date) {
  const current = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((current - yearStart) / 86400000 + 1) / 7);
  return {
    weekNumber,
    year: current.getUTCFullYear()
  };
}
export function currentSchoolWeek() {
  const today = new Date();
  const weeks = schoolYearWeeks();
  const inYear = weeks.find(item => today >= item.start && today <= item.end);
  if (inYear) return inYear;
  return weeks[0];
}
export function displayedSchoolWeek() {
  if (state.week !== "current" || !state.displayedCurrentWeekRank) return currentSchoolWeek();
  return schoolYearWeeks().find(item => item.rank === state.displayedCurrentWeekRank) || currentSchoolWeek();
}
export function navigateDisplayedWeek(delta) {
  const weeks = schoolYearWeeks();
  const currentRank = displayedSchoolWeek().rank;
  const nextRank = Math.min(weeks.length, Math.max(1, currentRank + delta));
  state.displayedCurrentWeekRank = nextRank;
}
export function isHighlightedWeek(weekItem) {
  const today = new Date();
  return today >= weekItem.start && today <= weekItem.end;
}
export function schoolYearWeeks() {
  const weeks = [];
  const firstMonday = mondayOnOrBefore(state.schoolYear.start);
  let cursor = new Date(firstMonday);
  let rank = 1;
  while (cursor <= state.calendarDisplayEnd) {
    const end = new Date(cursor);
    end.setDate(cursor.getDate() + 6);
    const info = getIsoWeekInfo(cursor);
    weeks.push({
      rank,
      isoWeek: info.weekNumber,
      isoYear: info.year,
      start: new Date(cursor),
      end,
      letter: rank % 2 === 1 ? "A" : "B"
    });
    cursor.setDate(cursor.getDate() + 7);
    rank += 1;
  }
  return weeks;
}
export function mondayOnOrBefore(date) {
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  return monday;
}
export function displayDateForSchoolWeek(weekItem) {
  if (weekItem.start < state.schoolYear.start) return state.schoolYear.start;
  if (weekItem.start > state.schoolYear.end) return state.schoolYear.end;
  return weekItem.start;
}
export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function attrValue(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
export function rowDateForWeek(row, weekItem) {
  const dayIndex = state.days.indexOf(row.day);
  const date = new Date(weekItem.start);
  date.setDate(weekItem.start.getDate() + dayIndex);
  return date;
}
export function schoolYearHolidays() {
  return new Map([["2026-11-01", "Toussaint"], ["2026-11-11", "Armistice"], ["2026-12-25", "Noel"], ["2027-01-01", "Jour de l'an"], ["2027-03-29", "Lundi de Paques"], ["2027-05-01", "Fete du Travail"], ["2027-05-06", "Ascension"], ["2027-05-08", "Victoire 1945"], ["2027-05-17", "Lundi de Pentecote"], ["2027-07-14", "Fete nationale"]]);
}
export function activeSchoolZone() {
  return ["A", "B", "C"].includes(state.schoolConstraints?.schoolZone) ? state.schoolConstraints.schoolZone : state.defaultSchoolConstraints.schoolZone;
}
export function schoolVacations() {
  return state.schoolVacationCalendars[activeSchoolZone()] || state.schoolVacationCalendars.B;
}
export function vacationForWeek(weekItem) {
  return schoolVacations().find(vacation => state.days.some(day => {
    const rowDate = rowDateForWeek({
      day
    }, weekItem);
    return rowDate >= dateOnly(vacation.start) && rowDate <= dateOnly(vacation.end);
  }));
}
export function vacationForCell(row, weekItem) {
  const rowDate = rowDateForWeek(row, weekItem);
  return schoolVacations().find(vacation => rowDate >= dateOnly(vacation.start) && rowDate <= dateOnly(vacation.end));
}
export function holidayFor(row, weekItem) {
  return schoolYearHolidays().get(dateKey(rowDateForWeek(row, weekItem)));
}
export function dayOffFor(day, weekItem) {
  const rowDate = rowDateForWeek({
    day
  }, weekItem);
  const vacation = schoolVacations().find(item => rowDate >= dateOnly(item.start) && rowDate <= dateOnly(item.end));
  const holiday = schoolYearHolidays().get(dateKey(rowDate));
  if (vacation) return {
    label: "V",
    title: vacation.name,
    className: "vacationCell"
  };
  if (holiday) return {
    label: "F",
    title: holiday,
    className: "holidayCell"
  };
  return null;
}
export function dateRangeBlockedReason(value) {
  const date = dateOnly(value);
  const day = date.getDay();
  if (day === 0 || day === 6) return "Week-end";
  const holiday = schoolYearHolidays().get(value);
  if (holiday) return holiday;
  const vacation = schoolVacations().find(item => date >= dateOnly(item.start) && date <= dateOnly(item.end));
  return vacation?.name || "";
}
export function dateRangeHasBlockedDay(start, end) {
  let cursor = dateOnly(start);
  const last = dateOnly(end);
  while (cursor <= last) {
    if (dateRangeBlockedReason(dateKey(cursor))) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}
export function asSlotsForDay(day) {
  return (state.schoolConstraints.asSlots || state.defaultAsSlots).filter(slot => (slot.days || []).includes(day)).map(slot => ({
    ...slot,
    isAs: true
  }));
}
export function daySlotsFor(day) {
  return [...state.slots.slice(0, 2), ...asSlotsForDay(day), ...state.slots.slice(2)];
}
export function isWednesdayAfternoonCourse(row) {
  if (!row || row.isAs || row.day !== "Mercredi") return false;
  const start = String(row.slot?.startTime || "").trim();
  if (start) return Number(start.split(":")[0]) >= 12;
  return ["13", "15"].includes(String(row.slot?.id || ""));
}
export function timetableSlots() {
  const combined = [];
  state.days.forEach(day => {
    daySlotsFor(day).forEach(slot => {
      const key = `${slot.id}-${slot.label}`;
      if (!combined.some(item => item.key === key)) combined.push({
        ...slot,
        key
      });
    });
  });
  return combined;
}
export function homeTimetableSlots() {
  return [...state.slots.slice(0, 2), {
    id: "__as__",
    label: "AS",
    isAsSummary: true
  }, ...state.slots.slice(2)];
}
export function yearRows() {
  return state.days.flatMap(day => {
    const daySlots = daySlotsFor(day);
    return daySlots.map(slot => ({
      id: `${day}-${slot.id}`,
      day,
      slot,
      label: `${day} ${slot.label}`,
      isAs: Boolean(slot.isAs)
    }));
  });
}
