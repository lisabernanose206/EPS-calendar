import { state } from "../app/state.js";
import { asMatchesTeacherSelection, availableTeacherCellStyle, availableTeacherCellTitle, blockClassLabel, blockDetailLabel, blockMatchesTeacherSelection, blockTeacherStyle, conflictMap, eventMatchesTeacherSelection, teacherIdsForBlock, yearCellKey } from "../domain/assignments.js";
import { dayOffFor, holidayFor, isWednesdayAfternoonCourse, vacationForCell, vacationForWeek, yearRows } from "../domain/dates.js";
import { asBlockLabel, asSessionStyle, asSessionTeacherLabel, asSessionsForCell, canMergeEventCell, eventForContinuation, eventRowSpan, eventTeacherDots, eventsForCell, eventsForPeriod, visibleCourseBlocksForCell } from "../domain/events.js";
import { cycleForWeek, representativeWeekForCycle } from "../domain/hours.js";
import { cycleLabel, displayCycleName, isCollegeEstablishment } from "../domain/settings.js";
import { blockWithCycleOverride, itemExcludedForCell } from "../services/settings-storage.js";
import { dateOnly, weekDateLabel } from "./date-picker.js";
import { escapeHtml, eventClassSummary } from "./format.js";

export function renderConstructionCellStack(items, events, asItems, editable, key, row, alignmentTeacherIds = []) {
  const indexedItems = items.map((item, index) => ({
    item,
    index
  }));
  const orderedTeacherIds = editable ? alignmentTeacherIds : state.teachers.map(teacher => teacher.id);
  const showCycleDetails = state.constructionBuildMode !== "blocks";
  const lessonBlocks = row.isAs ? "" : editable ? orderedTeacherIds.map(teacherId => {
    const matches = indexedItems.filter(({
      item
    }) => teacherIdsForBlock(item)[0] === teacherId);
    return `<div class="buildFacilitySlot">${matches.map(({
      item,
      index
    }) => `
              <div class="buildBlock ${state.movingBuildBlock?.type === "course" && state.movingBuildBlock?.key === key && state.movingBuildBlock?.index === index ? "moveSelected" : ""}" data-move-kind="course" data-move-index="${index}" data-block-key="${key}" style="${blockTeacherStyle(item)}">
                <button class="moveBlockButton" data-start-move-kind="course" data-move-index="${index}" data-block-key="${key}" title="Déplacer">↔</button>
                <button class="removeBlockButton" data-remove-cell="${key}" data-remove-index="${index}" title="Retirer">x</button>
                <strong>${blockClassLabel(item)}</strong>
                ${showCycleDetails ? `<span>${blockDetailLabel(item)}</span>` : ""}
              </div>`).join("") || `<div class="buildSlotSpacer"></div>`}</div>`;
  }).join("") : items.map(item => `
              <div class="buildBlock" style="${blockTeacherStyle(item)}">
                <strong>${blockClassLabel(item)}</strong>
                ${showCycleDetails ? `<span>${blockDetailLabel(item)}</span>` : ""}
              </div>`).join("");
  return `<div class="buildCellStack">${lessonBlocks}${events.map(event => `
          <div class="buildBlock eventBlock ${state.movingBuildBlock?.type === "event" && state.movingBuildBlock?.id === event.id ? "moveSelected" : ""}" data-move-kind="event" data-move-id="${escapeHtml(event.id)}" data-block-key="${key}">
            <strong>${escapeHtml(event.name)} : ${eventClassSummary(event)}</strong>
            <div class="eventBlockControls">
              <button class="moveBlockButton" data-start-move-kind="event" data-move-id="${escapeHtml(event.id)}" data-block-key="${key}" title="Déplacer">↔</button>
              ${eventTeacherDots(event)}
            </div>
          </div>`).join("")}${asItems.map(session => `
          <div class="buildBlock asBlock ${state.movingBuildBlock?.type === "as" && state.movingBuildBlock?.id === session.id ? "moveSelected" : ""}" ${state.constructionBuildMode === "blocks" ? `data-move-kind="as"` : ""} data-move-id="${escapeHtml(session.id)}" data-block-key="${key}" style="${asSessionStyle(session)}">
            ${state.constructionBuildMode === "blocks" ? `<button class="moveBlockButton" data-start-move-kind="as" data-move-id="${escapeHtml(session.id)}" data-block-key="${key}" title="Déplacer">↔</button>` : ""}
            <strong>${asBlockLabel(session)}</strong>
          </div>`).join("")}</div>`;
}
export function indexedConstructionItemsForKey(key, filterSelection = false, weekLetter = "") {
  return (state.constructionPlan[key] || []).map((item, index) => ({
    item,
    index
  })).filter(({
    item
  }) => (!filterSelection || blockMatchesTeacherSelection(item)) && (!weekLetter || (item.weekLetter || "all") === weekLetter));
}
export function constructionOptimizationIssueForBlock(item, cycle) {
  if (state.constructionBuildMode !== "cycleDetails" || !state.constructionOptimizationResult?.unresolvedBlocks?.length || !item?.ruleId || !cycle?.id) return null;
  return state.constructionOptimizationResult.unresolvedBlocks.find(issue => issue.ruleId === item.ruleId && issue.cycleId === cycle.id) || null;
}
export function constructionCycleDisplayBlock(item, cycle = null) {
  if (state.constructionBuildMode !== "cycleDetails" || !cycle?.id || !item?.ruleId) return item;
  const rule = state.constructionRules.find(entry => entry.id === item.ruleId);
  if (!rule) return item;
  return {
    ...blockWithCycleOverride(rule, cycle),
    ruleId: rule.id,
    cycleId: cycle.id,
    cycleName: displayCycleName(cycle),
    weekLetter: item.weekLetter || rule.weekLetter || "all"
  };
}
export function renderConstructionCycleBlocks(indexedItems, key, editable = true, cycle = null) {
  if (!indexedItems.length) return "";
  return `<div class="cycleBlockGrid">${indexedItems.map(({
    item,
    index
  }) => {
    const displayItem = constructionCycleDisplayBlock(item, cycle);
    const optimizationIssue = constructionOptimizationIssueForBlock(displayItem, cycle);
    const showCycleDetails = state.constructionBuildMode !== "blocks";
    return `
          <div class="buildBlock ${state.movingBuildBlock?.type === "course" && state.movingBuildBlock?.key === key && state.movingBuildBlock?.index === index ? "moveSelected" : ""} ${optimizationIssue ? "optimizationIssue" : ""}" ${editable ? state.constructionBuildMode === "blocks" ? `data-move-kind="course"` : `data-edit-cycle-details="${index}"` : ""} data-move-index="${index}" data-block-key="${key}" data-rule-id="${escapeHtml((displayItem.ruleId || ""))}" data-cycle-id="${cycle?.id || ""}" title="${optimizationIssue ? escapeHtml(optimizationIssue.reason) : ""}" style="${blockTeacherStyle(displayItem)}">
            ${editable && state.constructionBuildMode === "blocks" ? `<button class="moveBlockButton" data-start-move-kind="course" data-move-index="${index}" data-block-key="${key}" title="Déplacer">↔</button>
            <button class="removeBlockButton" data-remove-cell="${key}" data-remove-index="${index}" title="Retirer">x</button>` : ""}
            <strong>${blockClassLabel(displayItem)}</strong>
            ${showCycleDetails && blockDetailLabel(displayItem) ? `<span>${blockDetailLabel(displayItem)}</span>` : ""}
            ${optimizationIssue ? `<span class="optimizationIssueReason">${escapeHtml(optimizationIssue.reason)}</span>` : ""}
            ${displayItem.coIntervention ? `<span>Co-intervention</span>` : ""}
          </div>
        `;
  }).join("")}</div>`;
}
export function asSessionsForConstructionCycle(row, cycle, key, filterSelection = false) {
  if (!row?.isAs || !cycle) return [];
  const cycleStart = dateOnly(cycle.start);
  const cycleEnd = dateOnly(cycle.end);
  return state.asSessions.filter(session => {
    const start = dateOnly(session.start);
    const end = dateOnly(session.end);
    const slotIds = Array.isArray(session.slotIds) ? session.slotIds : [];
    return start <= cycleEnd && end >= cycleStart && (session.weekdays || []).includes(row.day) && (!slotIds.length || slotIds.includes(row.slot.id)) && !itemExcludedForCell(state.asExclusions, session.id, key);
  }).filter(session => !filterSelection || asMatchesTeacherSelection(session));
}
export function renderConstructionCycleArea(row, cycle, letter, label, filterSelection = false, editable = true) {
  const weekItem = representativeWeekForCycle(cycle, letter);
  if (!weekItem) return `<div class="cycleConstructionFull"><span class="muted">${cycleLabel()} sans semaine</span></div>`;
  const key = yearCellKey(row.id, weekItem.rank);
  const indexedItems = indexedConstructionItemsForKey(key, filterSelection, letter);
  const asItems = asSessionsForConstructionCycle(row, cycle, key, filterSelection);
  const blocked = isWednesdayAfternoonCourse(row);
  const canOpenHere = editable && state.constructionBuildMode === "blocks" && !row.isAs && !blocked;
  const availableStyle = canOpenHere ? availableTeacherCellStyle(row, weekItem, key, blocked, cycle, letter || "all") : "";
  const availabilityTitle = canOpenHere ? availableTeacherCellTitle(row, weekItem, key, cycle, letter || "all") : "";
  const cellTitle = [label, blocked ? "Mercredi après-midi indisponible" : "", availabilityTitle].filter(Boolean).join(" | ");
  return `<div title="${cellTitle}" class="${letter ? "cycleConstructionHalf" : "cycleConstructionFull"} ${row.isAs ? "cycleConstructionAsCell" : ""} ${blocked ? "constructionBlockedCell" : ""} ${canOpenHere ? "buildDropCell availableTeacherBg" : ""}" style="${availableStyle}" ${canOpenHere ? `data-open-cell="${key}" data-open-cycle-id="${cycle.id}" data-open-week-letter="${letter || "all"}" data-move-cell="${key}"` : ""}>
          ${letter ? `<span class="cycleConstructionHalfLabel">${label}</span>` : ""}
          ${blocked ? "" : row.isAs ? `<div class="constructionAsStack">${asItems.length ? asItems.map(session => `
            <div class="buildBlock asBlock ${state.movingBuildBlock?.type === "as" && state.movingBuildBlock?.id === session.id ? "moveSelected" : ""}" ${editable && state.constructionBuildMode === "blocks" ? `data-move-kind="as"` : ""} data-move-id="${escapeHtml(session.id)}" data-block-key="${key}" style="${asSessionStyle(session)}">
              ${editable && state.constructionBuildMode === "blocks" ? `<button class="moveBlockButton" data-start-move-kind="as" data-move-id="${escapeHtml(session.id)}" data-block-key="${key}" title="Déplacer">↔</button>` : ""}
              <strong>${asBlockLabel(session)}</strong>
              <span>${asSessionTeacherLabel(session)}</span>
            </div>`).join("") : `<span class="muted">-</span>`}</div>` : renderConstructionCycleBlocks(indexedItems, key, editable, cycle)}
        </div>`;
}
export function constructionWeekTypeSlots() {
  return [...state.slots.slice(0, 2), {
    id: "__as__",
    label: "AS",
    isAsSummary: true
  }, ...state.slots.slice(2)];
}
export function constructionRowForSlot(day, slot) {
  const rows = yearRows();
  if (slot.isAsSummary) return rows.find(item => item.day === day && item.isAs) || null;
  return rows.find(item => item.day === day && item.slot.id === slot.id && item.slot.label === slot.label) || null;
}
export function renderConstructionCycleTable(cycle, rows, editable, filterSelection = false) {
  if (!cycle) return `<div class="alertEmpty">${isCollegeEstablishment() ? "Aucune période classique définie." : "Aucun cycle classique défini."}</div>`;
  const slotRows = constructionWeekTypeSlots();
  return `<div class="yearWrap cycleConstructionTableWrap"><table class="yearTable constructionTable cycleConstructionTable">
          <thead>
            <tr><th class="timeHead">Créneau</th>${state.days.map(day => `<th>${day}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${slotRows.map(slot => `<tr>
              <th class="timeHead">${escapeHtml(slot.label)}</th>
              ${state.days.map(day => {
    const row = constructionRowForSlot(day, slot);
    if (!row) return `<td class="mergedOff"><span class="muted">-</span></td>`;
    const weekAll = representativeWeekForCycle(cycle);
    const weekA = representativeWeekForCycle(cycle, "A");
    const weekB = representativeWeekForCycle(cycle, "B");
    const keyAll = weekAll ? yearCellKey(row.id, weekAll.rank) : "";
    const keyA = weekA ? yearCellKey(row.id, weekA.rank) : "";
    const keyB = weekB ? yearCellKey(row.id, weekB.rank) : "";
    const allItems = keyAll ? indexedConstructionItemsForKey(keyAll, filterSelection, "all") : [];
    const aItems = keyA ? indexedConstructionItemsForKey(keyA, filterSelection, "A") : [];
    const bItems = keyB ? indexedConstructionItemsForKey(keyB, filterSelection, "B") : [];
    const hasQuinzaine = aItems.length || bItems.length;
    const blockedRow = isWednesdayAfternoonCourse(row);
    return `<td class="cycleConstructionCell">
                  <div class="cycleConstructionCellInner">
                    ${hasQuinzaine ? `${!blockedRow && allItems.length ? renderConstructionCycleBlocks(allItems, keyAll, editable, cycle) : ""}<div class="cycleConstructionSplit">${renderConstructionCycleArea(row, cycle, "A", "Semaine A", filterSelection, editable)}${renderConstructionCycleArea(row, cycle, "B", "Semaine B", filterSelection, editable)}</div>` : renderConstructionCycleArea(row, cycle, "", "", filterSelection, editable)}
                  </div>
                </td>`;
  }).join("")}
            </tr>`).join("")}
          </tbody>
        </table></div>`;
}
export function renderConstructionTable(weeks, current, monthLabels, rows, editable, filterSelection = false) {
  const conflicts = conflictMap(state.constructionBuildMode);
  const rowsByDay = state.days.map(day => ({
    day,
    rows: rows.filter(row => row.day === day)
  }));
  return `<div class="yearWrap"><table class="yearTable constructionTable">
          <colgroup>
            <col />
            <col />
            ${weeks.map(weekItem => `<col class="${vacationForWeek(weekItem) ? "vacationWeekCol" : "regularWeekCol"}" />`).join("")}
          </colgroup>
          <thead>
            <tr><th class="rowHead">Jour</th><th class="timeHead">Horaire</th>${monthLabels.map((month, index) => `<th class="monthCell ${vacationForWeek(weeks[index]) ? "vacationWeekCell" : ""}">${month}</th>`).join("")}</tr>
            <tr><th class="rowHead"></th><th class="timeHead">${cycleLabel()}</th>${weeks.map(weekItem => {
    const vacation = vacationForWeek(weekItem);
    const cycle = cycleForWeek(weekItem);
    return `<th class="${vacation ? "vacationHeader vacationWeekCell" : "cycleHeader"}">${vacation ? "V" : cycle ? displayCycleName(cycle, true) : "-"}</th>`;
  }).join("")}</tr>
            <tr><th class="rowHead"></th><th class="timeHead">Semaine</th>${weeks.map(weekItem => `<th class="${vacationForWeek(weekItem) ? "vacationWeekCell" : ""}"><span class="constructionWeekHead"><strong>${escapeHtml(weekItem.rank)}${escapeHtml(weekItem.letter)}</strong><small>${weekDateLabel(weekItem)}</small></span></th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rowsByDay.map(group => group.rows.map((row, rowIndex) => {
    const alignmentTeacherIds = state.teachers.filter(teacher => weeks.some(weekItem => (state.constructionPlan[yearCellKey(row.id, weekItem.rank)] || []).some(item => teacherIdsForBlock(item)[0] === teacher.id))).map(teacher => teacher.id);
    return `<tr>
              ${rowIndex === 0 ? `<th class="rowHead" rowspan="${escapeHtml(group.rows.length)}">${escapeHtml(group.day)}</th>` : ""}
              <th class="timeHead">${escapeHtml(row.slot.label)}</th>${weeks.map(weekItem => {
      const key = yearCellKey(row.id, weekItem.rank);
      const dayOff = dayOffFor(group.day, weekItem);
      const isVacationWeek = Boolean(vacationForWeek(weekItem));
      if (dayOff && rowIndex > 0) return "";
      if (dayOff) return `<td rowspan="${escapeHtml(group.rows.length)}" title="${escapeHtml(dayOff.title)}" class="mergedOff ${escapeHtml(dayOff.className)} ${isVacationWeek ? "vacationWeekCell" : ""}">${escapeHtml(dayOff.label)}</td>`;
      const continuedEvent = eventForContinuation(row, weekItem);
      if (!editable && continuedEvent && (!filterSelection || eventMatchesTeacherSelection(continuedEvent)) && canMergeEventCell(continuedEvent, group.rows, weekItem)) return "";
      const mergeableEvents = editable ? [] : eventsForCell(row, weekItem).filter(event => (!filterSelection || eventMatchesTeacherSelection(event)) && canMergeEventCell(event, group.rows, weekItem));
      if (mergeableEvents.length) {
        const event = mergeableEvents[0];
        return `<td rowspan="${eventRowSpan(event, group.rows)}">
                    <div class="buildBlock eventBlock">
                      <strong>${escapeHtml(event.name)} : ${eventClassSummary(event)}</strong>
                      <div class="eventBlockControls">
                        ${eventTeacherDots(event)}
                      </div>
                    </div>
                  </td>`;
      }
      const items = visibleCourseBlocksForCell(row, weekItem, filterSelection);
      const events = eventsForPeriod(row, weekItem).filter(event => !filterSelection || eventMatchesTeacherSelection(event));
      const asItems = asSessionsForCell(row, weekItem).filter(session => !filterSelection || asMatchesTeacherSelection(session));
      const holiday = holidayFor(row, weekItem);
      const vacation = vacationForCell(row, weekItem);
      const blocked = vacation || holiday;
      const blockedWednesdayAfternoon = isWednesdayAfternoonCourse(row);
      const canMoveHere = editable && !blocked && !blockedWednesdayAfternoon && (state.movingBuildBlock?.type === "as" ? row.isAs : true);
      const canOpenHere = editable && !blocked && !blockedWednesdayAfternoon && !row.isAs;
      const availableStyle = canOpenHere ? availableTeacherCellStyle(row, weekItem, key, blocked) : "";
      const availabilityTitle = canOpenHere ? availableTeacherCellTitle(row, weekItem, key) : "";
      const cellTitle = [holiday || vacation?.name || "", blockedWednesdayAfternoon ? "Mercredi après-midi indisponible" : "", availabilityTitle].filter(Boolean).join(" | ");
      return `<td title="${cellTitle}" class="${canOpenHere ? "buildDropCell availableTeacherBg" : ""} ${blockedWednesdayAfternoon ? "constructionBlockedCell" : ""} ${state.movingBuildBlock && canMoveHere ? "moveTarget" : ""} ${conflicts.has(key) ? "conflictCell" : ""} ${holiday ? "holidayCell" : ""} ${vacation ? "vacationCell vacationWeekCell" : ""}" style="${availableStyle}" ${canMoveHere ? `data-move-cell="${key}"` : ""} ${canOpenHere ? `data-open-cell="${key}" data-row="${row.id}"` : ""}>
                ${vacation ? `<span class="muted">V</span>` : ""}
                ${!vacation && holiday ? `<span class="muted">F</span>` : ""}
                ${renderConstructionCellStack(items, events, asItems, editable, key, row, alignmentTeacherIds)}
                ${conflicts.has(key) ? `<span class="conflictBadge">Conflit</span>` : ""}
              </td>`;
    }).join("")}
            </tr>`;
  }).join("")).join("")}
          </tbody>
        </table></div>`;
}
