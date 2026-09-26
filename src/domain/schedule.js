import { state } from "../app/state.js";
import { displayedSchoolWeek } from "./dates.js";

export function emptyStats() {
  return Object.fromEntries(state.teachers.map(teacher => [teacher.id, {
    total: 0,
    external: 0,
    internal: 0,
    sessions: 0,
    dayHours: Object.fromEntries(state.days.map(day => [day, 0])),
    busy: {}
  }]));
}
export function score(stats, teacher, weekName, day, slot, facility, round) {
  const current = stats[teacher.id];
  const targetHours = teacher.weekTargets[weekName];
  const remaining = targetHours - current.total;
  const maxExternal = Math.ceil(targetHours * 0.6);
  if (remaining < slot.hours || current.busy[`${day}-${slot.id}`]) return Infinity;
  if (facility.type === "external" && current.external + slot.hours > maxExternal) return Infinity;
  if (slot.hours === 1 && remaining !== 1 && current.total < 12) return Infinity;
  if (slot.hours === 2 && remaining === 1) return Infinity;
  const facilityLoad = facility.type === "external" ? current.external : current.internal;
  const dayPenalty = current.dayHours[day] >= 4 ? 30 : current.dayHours[day] * 6;
  return current.total * 12 + facilityLoad * 2 + dayPenalty + (slot.id === "15" ? 5 : 0) + (round + teacher.id.charCodeAt(1)) % 7 / 10;
}
export function mark(stats, teacherId, day, slot, facility) {
  const current = stats[teacherId];
  current.busy[`${day}-${slot.id}`] = true;
  current.total += slot.hours;
  current.sessions += 1;
  current.dayHours[day] += slot.hours;
  if (facility.type === "external") current.external += slot.hours;else current.internal += slot.hours;
}
export function generateWeek(weekName) {
  const stats = emptyStats();
  const assignments = [];
  const classBusy = {};
  const orderedFacilities = state.facilities.filter(item => item.type === "external").concat(state.facilities.filter(item => item.type === "internal"));
  let round = state.seed + (weekName === "B" ? 31 : 0);
  orderedFacilities.forEach(facility => {
    state.days.forEach(day => {
      state.slots.forEach(slot => {
        const candidates = state.teachers.map(teacher => ({
          teacher,
          score: score(stats, teacher, weekName, day, slot, facility, round)
        })).filter(item => Number.isFinite(item.score)).sort((a, b) => a.score - b.score);
        if (!candidates.length) return;
        const teacher = candidates[0].teacher;
        const schoolClass = pickClass(classBusy, day, slot, round);
        assignments.push({
          id: `${weekName}-${day}-${slot.id}-${facility.id}`,
          week: weekName,
          day,
          slot,
          facility,
          teacher,
          schoolClass
        });
        mark(stats, teacher.id, day, slot, facility);
        classBusy[`${day}-${slot.id}-${schoolClass}`] = true;
        round += 1;
      });
    });
  });
  return {
    assignments,
    stats
  };
}
export function pickClass(classBusy, day, slot, round) {
  const start = round % state.classes.length;
  for (let offset = 0; offset < state.classes.length; offset += 1) {
    const schoolClass = state.classes[(start + offset) % state.classes.length];
    if (!classBusy[`${day}-${slot.id}-${schoolClass}`]) return schoolClass;
  }
  return state.classes[start];
}
export function generateCycle() {
  const A = generateWeek("A");
  const B = generateWeek("B");
  return {
    A,
    B,
    assignments: A.assignments.concat(B.assignments)
  };
}
export function activeScheduleWeek() {
  if (state.week === "current") return displayedSchoolWeek().letter;
  return state.week;
}
export function visible(cycle) {
  const selectedWeek = activeScheduleWeek();
  return selectedWeek === "year" ? cycle.assignments : cycle[selectedWeek].assignments;
}
export function statFor(cycle, teacherId) {
  const selectedWeek = activeScheduleWeek();
  if (selectedWeek !== "year") return cycle[selectedWeek].stats[teacherId];
  const a = cycle.A.stats[teacherId];
  const b = cycle.B.stats[teacherId];
  return {
    total: `${a.total * 2 + b.total * 2}h / ${state.teachers.find(teacher => teacher.id === teacherId).monthlyTarget}h`,
    external: `${a.external}h A / ${b.external}h B`,
    internal: `${a.internal}h A / ${b.internal}h B`,
    sessions: `${a.sessions} A / ${b.sessions} B`
  };
}
export function facilityBadge(type) {
  return `<span class="badge ${type === "external" ? "external" : "internal"}">${type === "external" ? "Ext." : "Collège"}</span>`;
}
