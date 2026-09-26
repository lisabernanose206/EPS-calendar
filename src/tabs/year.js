import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { asMatchesTeacherSelection, blockClassLabel, blockTeacherStyle, conflictMap, eventMatchesTeacherSelection, parseYearCellKey, renderTeacherLegend, teacherLabelForBlock, yearCellKey } from "../domain/assignments.js";
import { currentSchoolWeek, dayOffFor, holidayFor, schoolYearWeeks, vacationForCell, vacationForWeek, yearRows } from "../domain/dates.js";
import { asSessionStyle, asSessionTeacherLabel, asSessionsForCell, canMergeEventCell, eventForContinuation, eventPeriodLabel, eventRowSpan, eventTeacherDots, eventsForCell, eventsForPeriod, teacherNamesFromIds, visibleCourseBlocksForCell } from "../domain/events.js";
import { cycleForWeek, monthLabelForWeek } from "../domain/hours.js";
import { cycleLabel, displayCycleName } from "../domain/settings.js";
import { weekDateLabel, weekWorkingDaysLabel } from "../ui/date-picker.js";
import { compactClassName, eventShortName, facilityShortLabel, groupedHeaderCells, serviceFreeShortLabel } from "../ui/format.js";
import { updateNavigationActive } from "../ui/navigation.js";

export function renderSelectedYearWeek() {
  if (!state.selectedYearWeekRank) return "";
  const weekItem = schoolYearWeeks().find(item => item.rank === state.selectedYearWeekRank);
  if (!weekItem) return "";
  const rows = yearRows().filter(row => !row.isAs);
  return `<section class="panel">
          <h2>Semaine ${weekItem.rank}${weekItem.letter} · ${weekDateLabel(weekItem)}</h2>
          <div class="calendarWrap"><div class="calendar">${state.days.map(day => `
            <section class="dayColumn">
              <h2>${day}</h2>
              ${rows.filter(row => row.day === day).map(row => {
    const key = yearCellKey(row.id, weekItem.rank);
    const items = visibleCourseBlocksForCell(row, weekItem);
    const events = eventsForPeriod(row, weekItem).filter(eventMatchesTeacherSelection);
    const blocked = vacationForCell(row, weekItem) || holidayFor(row, weekItem);
    return `<article class="slot">
                  <div class="slotHead"><strong>${row.slot.label}</strong><span class="muted">${row.slot.hours}h</span></div>
                  <div class="lessons">
                    ${blocked ? `<div class="emptyLesson">${vacationForCell(row, weekItem) ? "V" : "F"}</div>` : ""}
                    ${items.map(item => `<div class="lesson" style="${blockTeacherStyle(item)}">
                      <div class="lessonTop"><strong>${teacherLabelForBlock(item)}</strong></div>
                      <div class="lessonMeta"><span class="muted">${blockClassLabel(item)} · ${item.facilityLabel}</span></div>
                    </div>`).join("")}
                    ${events.map(event => `<div class="lesson eventBlock"><strong>${event.name}</strong><span>${eventPeriodLabel(event)}</span>${eventTeacherDots(event)}</div>`).join("")}
                    ${!blocked && !items.length && !events.length ? `<div class="emptyLesson">Libre</div>` : ""}
                  </div>
                </article>`;
  }).join("")}
            </section>`).join("")}</div></div>
        </section>`;
}
export function renderSelectedYearCellDetails() {
  if (!state.selectedYearCellKey) return "";
  const {
    rowId,
    weekRank
  } = parseYearCellKey(state.selectedYearCellKey);
  const row = yearRows().find(item => item.id === rowId);
  const weekItem = schoolYearWeeks().find(item => item.rank === weekRank);
  if (!row || !weekItem) return "";
  const key = yearCellKey(row.id, weekItem.rank);
  const builtItems = visibleCourseBlocksForCell(row, weekItem);
  const events = eventsForPeriod(row, weekItem).filter(eventMatchesTeacherSelection);
  const asItems = asSessionsForCell(row, weekItem).filter(asMatchesTeacherSelection);
  const holiday = holidayFor(row, weekItem);
  const vacation = vacationForCell(row, weekItem);
  const details = [...builtItems.map(item => `<div class="selectedCellDetail">
            <strong>Cours</strong>
            <span>Classe : ${item.schoolClass ? compactClassName(item.schoolClass) : "non renseignée"}</span>
            <span>Prof : ${teacherLabelForBlock(item)}</span>
            <span>Installation : ${item.facilityLabel || item.type || "non renseignée"}</span>
            ${item.activityLabel ? `<span>Activité : ${item.activityLabel}</span>` : ""}
            ${item.cycleName ? `<span>Cycle : ${item.cycleName}${item.weekLetter && item.weekLetter !== "all" ? ` · Quinzaine ${item.weekLetter}` : ""}</span>` : ""}
          </div>`), ...events.map(event => `<div class="selectedCellDetail">
            <strong>Evenement sportif</strong>
            <span>Nom : ${event.name}</span>
            <span>Dates : ${event.start} -> ${event.end}</span>
            <span>Periode : ${eventPeriodLabel(event)}</span>
            <span>Classes : ${(event.classes || []).map(compactClassName).join(", ") || "aucune"}</span>
            <span>Profs : ${teacherNamesFromIds(event.teacherIds || []).join(", ") || "aucun"}</span>
          </div>`), ...asItems.map(session => `<div class="selectedCellDetail">
            <strong>AS</strong>
            <span>Nom : ${session.name}</span>
            <span>Dates : ${session.start} -> ${session.end}</span>
            <span>Jours : ${(session.weekdays || []).join(", ")}</span>
            <span>Profs : ${asSessionTeacherLabel(session)}</span>
          </div>`)];
  if (vacation) details.push(`<div class="selectedCellDetail"><strong>Vacances</strong><span>${vacation.name}</span></div>`);
  if (holiday) details.push(`<div class="selectedCellDetail"><strong>Férié</strong><span>${holiday}</span></div>`);
  return `<div class="selectedCellBackdrop" data-close-year-cell-detail></div>
          <div class="selectedCellInfo" role="dialog" aria-label="Detail de la case sélectionnée">
            <button class="selectedCellClose" data-close-year-cell-detail>Fermer</button>
            <strong>${row.day} ${row.slot.label} · Semaine ${weekItem.rank}${weekItem.letter}</strong>
            <span>${weekDateLabel(weekItem)}</span>
            ${details.join("") || `<span>Aucun contenu sur cette case.</span>`}
          </div>`;
}
export function renderYearView(cycle) {
  const weeks = schoolYearWeeks();
  const current = currentSchoolWeek();
  const rows = yearRows();
  const rowsByDay = state.days.map(day => ({
    day,
    rows: rows.filter(row => row.day === day)
  }));
  const conflicts = conflictMap();
  const effectiveSelectedWeekRank = state.selectedYearWeekRank || current.rank;
  const selectedWeekItem = weeks.find(item => item.rank === effectiveSelectedWeekRank);
  return `<section class="panel">
          <div class="yearHeaderCompact">
            ${renderTeacherLegend("yearTeacherLegend")}
            <div class="yearActionsRight">
              ${selectedWeekItem ? `<button class="ghostButton primaryWeekButton" id="showSelectedWeek">Afficher la semaine ${selectedWeekItem.rank}${selectedWeekItem.letter}</button>` : ""}
              <button class="ghostButton" data-print-format="A3">Exporter A3</button>
              <button class="ghostButton" data-print-format="A2">Exporter A2</button>
            </div>
          </div>
          <div class="calendarLegend">V = vacances · F = férié</div>
          ${renderSelectedYearCellDetails()}
          <div class="yearWrap consultationYearWrap">
          ${selectedWeekItem ? `<div class="selectedWeekInfo"><strong>Semaine ${selectedWeekItem.rank}${selectedWeekItem.letter}</strong><span>${weekDateLabel(selectedWeekItem)}</span><small>${weekWorkingDaysLabel(selectedWeekItem)}</small></div>` : ""}
          <table class="yearTable consultationYearTable">
            <thead>
              <tr><th class="rowHead">Jour</th><th class="timeHead">Horaire</th>${groupedHeaderCells(weeks, monthLabelForWeek, () => "monthCell")}</tr>
              <tr><th class="rowHead"></th><th class="timeHead">${cycleLabel()}</th>${groupedHeaderCells(weeks, weekItem => {
    const vacation = vacationForWeek(weekItem);
    const cycle = cycleForWeek(weekItem);
    return vacation ? "V" : cycle ? displayCycleName(cycle, true) : "-";
  }, weekItem => vacationForWeek(weekItem) ? "vacationHeader" : "cycleHeader")}</tr>
              <tr><th class="rowHead"></th><th class="timeHead"></th>${weeks.map(weekItem => `<th class="${weekItem.rank === current.rank ? "currentWeek" : ""} ${effectiveSelectedWeekRank === weekItem.rank ? "selectedWeekColumn selectedWeekTop" : ""}"><button class="weekSelect ${effectiveSelectedWeekRank === weekItem.rank ? "selected" : ""}" data-year-week-rank="${weekItem.rank}">${weekItem.rank}${weekItem.letter}</button></th>`).join("")}</tr>
            </thead>
            <tbody>
              ${rowsByDay.map(group => group.rows.map((row, rowIndex) => `<tr>
                ${rowIndex === 0 ? `<th class="rowHead" rowspan="${group.rows.length}">${group.day}</th>` : ""}
                <th class="timeHead">${row.slot.label}</th>${weeks.map(weekItem => {
    const key = yearCellKey(row.id, weekItem.rank);
    const selectedCellClass = state.selectedYearCellKey === key ? "selectedYearCell" : "";
    const dayOff = dayOffFor(group.day, weekItem);
    if (dayOff && rowIndex > 0) return "";
    if (dayOff) return `<td rowspan="${group.rows.length}" data-year-cell="${key}" title="${dayOff.title}" class="mergedOff ${dayOff.className} ${selectedCellClass} ${weekItem.rank === current.rank ? "currentWeek" : ""} ${effectiveSelectedWeekRank === weekItem.rank ? "selectedWeekColumn selectedWeekMiddle" : ""}">${dayOff.label}</td>`;
    const continuedEvent = eventForContinuation(row, weekItem);
    if (continuedEvent && eventMatchesTeacherSelection(continuedEvent) && canMergeEventCell(continuedEvent, group.rows, weekItem)) return "";
    const mergeableEvents = eventsForCell(row, weekItem).filter(event => eventMatchesTeacherSelection(event) && canMergeEventCell(event, group.rows, weekItem));
    if (mergeableEvents.length) {
      const event = mergeableEvents[0];
      return `<td rowspan="${eventRowSpan(event, group.rows)}" data-year-cell="${key}" class="${selectedCellClass} ${weekItem.rank === current.rank ? "currentWeek" : ""} ${effectiveSelectedWeekRank === weekItem.rank ? "selectedWeekColumn selectedWeekMiddle" : ""}">
                    <div class="yearLesson eventBlock">
                      <strong>${eventShortName(event.name)}</strong>
                    </div>
                  </td>`;
    }
    const holiday = holidayFor(row, weekItem);
    const vacation = vacationForCell(row, weekItem);
    return `<td data-year-cell="${key}" title="${holiday || vacation?.name || ""}" class="${selectedCellClass} ${weekItem.rank === current.rank ? "currentWeek" : ""} ${effectiveSelectedWeekRank === weekItem.rank ? `selectedWeekColumn ${group.day === state.days[state.days.length - 1] && rowIndex === group.rows.length - 1 ? "selectedWeekBottom" : "selectedWeekMiddle"}` : ""} ${conflicts.has(key) ? "conflictCell" : ""} ${holiday ? "holidayCell" : ""} ${vacation ? "vacationCell" : ""}">${vacation ? `<span class="muted">V</span>` : holiday ? `<span class="muted">F</span>` : renderYearCell(cycle, weekItem, row, conflicts)}</td>`;
  }).join("")}</tr>`).join("")).join("")}
            </tbody>
          </table></div>
        </section>`;
}
export function renderYearCell(cycle, weekItem, row, conflicts = null) {
  const key = yearCellKey(row.id, weekItem.rank);
  const builtItems = visibleCourseBlocksForCell(row, weekItem);
  const events = eventsForPeriod(row, weekItem).filter(eventMatchesTeacherSelection);
  const asItems = asSessionsForCell(row, weekItem).filter(asMatchesTeacherSelection);
  if (!builtItems.length && !events.length && !asItems.length) return `<span class="muted">-</span>`;
  const hasConflict = (conflicts || conflictMap()).has(key);
  return `<div class="yearLessonStack">${builtItems.map(item => `
          <div class="yearLesson" style="${blockTeacherStyle(item)}">
            <strong>${compactClassName(item.schoolClass) || (item.optionBlock ? serviceFreeShortLabel(item.optionLabel || item.activityLabel || item.label) : item.label) || "Bloc"}</strong>
            <span>${facilityShortLabel(item.facilityId, item.facilityLabel || item.type || "")}</span>
          </div>`).join("")}${events.map(event => `
          <div class="yearLesson eventBlock">
            <strong>${eventShortName(event.name)}</strong>
          </div>`).join("")}${asItems.map(session => `
          <div class="yearLesson asBlock" style="${asSessionStyle(session)}">
            <strong>${session.name}</strong>
            <span>AS</span>
          </div>`).join("")}${hasConflict ? `<span class="conflictBadge">Conflit</span>` : ""}</div>`;
}
export function bindYearEvents() {
  document.querySelectorAll("[data-year-week-rank]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedYearWeekRank = Number(button.dataset.yearWeekRank);
      render();
    });
  });
  document.querySelectorAll("[data-year-cell]").forEach(cell => {
    cell.addEventListener("click", () => {
      state.selectedYearCellKey = cell.dataset.yearCell;
      state.selectedYearWeekRank = parseYearCellKey(state.selectedYearCellKey).weekRank;
      render();
    });
  });
  document.querySelectorAll("[data-close-year-cell-detail]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedYearCellKey = "";
      render();
    });
  });
  const showSelectedWeek = document.getElementById("showSelectedWeek");
  if (showSelectedWeek) {
    showSelectedWeek.addEventListener("click", () => {
      state.displayedCurrentWeekRank = state.selectedYearWeekRank || currentSchoolWeek().rank;
      state.week = "current";
      updateNavigationActive();
      render();
    });
  }
}
