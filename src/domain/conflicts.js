import { state } from "../app/state.js";
import { blockClassLabel, blocksCanShareFacility, classesForBlock, classesOverlap, parseYearCellKey, teacherClassForBlock, teacherIdsForBlock, yearCellKey } from "./assignments.js";
import { schoolYearWeeks, yearRows } from "./dates.js";
import { asSessionsForCell, blockCancelledByEvent } from "./events.js";
import { cachedConstructionCheck } from "../services/planning-storage.js";

export function detectConflicts() {
  return cachedConstructionCheck("conflicts", () => {
    const conflicts = [];
    const rows = yearRows();
    const weeks = schoolYearWeeks();
    const rowById = new Map(rows.map(row => [row.id, row]));
    const weekByRank = new Map(weeks.map(weekItem => [weekItem.rank, weekItem]));
    Object.entries(state.constructionPlan).forEach(([key, rawItems]) => {
      if (!Array.isArray(rawItems)) return;
      const {
        rowId,
        weekRank
      } = parseYearCellKey(key);
      const row = rowById.get(rowId);
      const weekItem = weekByRank.get(weekRank);
      const items = row && weekItem ? rawItems.filter(item => !blockCancelledByEvent(row, weekItem, item)) : rawItems;
      if (!Array.isArray(items) || items.length < 2) return;
      const byFacility = items.reduce((acc, item, index) => {
        const facility = item.facilityId || item.facilityLabel || "";
        if (!facility) return acc;
        if (!acc[facility]) acc[facility] = [];
        acc[facility].push({
          ...item,
          index
        });
        return acc;
      }, {});
      Object.entries(byFacility).forEach(([facility, facilityItems]) => {
        if (facilityItems.length < 2) return;
        if (facilityItems.length === 2 && blocksCanShareFacility(facilityItems[0], facilityItems[1])) return;
        conflicts.push({
          type: "facility",
          key,
          facility,
          row,
          weekItem,
          items: facilityItems
        });
      });
      const byTeacher = {};
      items.forEach((item, index) => {
        teacherIdsForBlock(item).forEach(teacherId => {
          if (!byTeacher[teacherId]) byTeacher[teacherId] = [];
          byTeacher[teacherId].push({
            ...item,
            index
          });
        });
      });
      Object.entries(byTeacher).forEach(([teacher, teacherItems]) => {
        const classesInConflict = [...new Set(teacherItems.map(item => teacherClassForBlock(item, teacher)).filter(Boolean))];
        if (classesInConflict.length < 2) return;
        conflicts.push({
          type: "teacher",
          key,
          teacher,
          row,
          weekItem,
          items: teacherItems
        });
      });
      items.forEach((item, index) => {
        const classItems = items.map((other, otherIndex) => ({
          ...other,
          index: otherIndex
        })).filter(other => other.index !== index && classesForBlock(item).some(itemClass => classesForBlock(other).some(otherClass => classesOverlap(itemClass, otherClass))));
        if (!classItems.length) return;
        conflicts.push({
          type: "class",
          key,
          schoolClass: blockClassLabel(item),
          row,
          weekItem,
          items: [{
            ...item,
            index
          }, ...classItems]
        });
      });
    });
    rows.filter(row => row.isAs).forEach(row => {
      weeks.forEach(weekItem => {
        const sessions = asSessionsForCell(row, weekItem);
        if (sessions.length < 2) return;
        const byTeacher = {};
        sessions.forEach(session => {
          (session.teacherIds || []).forEach(teacherId => {
            if (!byTeacher[teacherId]) byTeacher[teacherId] = [];
            byTeacher[teacherId].push(session);
          });
        });
        Object.entries(byTeacher).forEach(([teacherId, teacherSessions]) => {
          if (teacherSessions.length < 2) return;
          conflicts.push({
            type: "asTeacher",
            key: yearCellKey(row.id, weekItem.rank),
            teacher: teacherId,
            row,
            weekItem,
            items: teacherSessions
          });
        });
      });
    });
    return conflicts;
  });
}
