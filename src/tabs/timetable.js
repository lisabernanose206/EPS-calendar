import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { allTeachersSelected, asMatchesTeacherSelection, blockClassLabel, blockTeacherStyle, eventMatchesTeacherSelection, renderTeacherLegend, teacherLabelForBlock, yearCellKey } from "../domain/assignments.js";
import { displayDateForSchoolWeek, displayedSchoolWeek, holidayFor, homeTimetableSlots, navigateDisplayedWeek, schoolYearWeeks, vacationForCell, yearRows } from "../domain/dates.js";
import { asBlockLabel, asSessionStyle, asSessionTeacherLabel, asSessionsForCell, asSessionsForDay, eventPeriodLabel, eventTeacherDots, eventsForPeriod, visibleCourseBlocksForCell } from "../domain/events.js";
import { activeScheduleWeek, statFor, visible } from "../domain/schedule.js";
import { unavailableCoversFacility, unavailableForCell } from "../domain/unavailability.js";
import { weekDateLabel, weekWorkingDaysLabel } from "../ui/date-picker.js";
import { compactClassName } from "../ui/format.js";

export function paletteItems() {
  return [...state.teachers.map(teacher => ({
    type: "prof",
    label: teacher.name,
    color: teacher.color,
    border: teacher.border
  })), ...state.facilities.map(facility => ({
    type: "installation",
    label: facility.label,
    color: facility.type === "external" ? "#ccfbf1" : "#e2e8f0",
    border: facility.type === "external" ? "#5eead4" : "#cbd5e1"
  })), ...state.classes.map(schoolClass => ({
    type: "classe",
    label: schoolClass,
    color: "#fef3c7",
    border: "#fbbf24"
  }))];
}
export function renderDateInfo() {
  const weekInfo = displayedSchoolWeek();
  const monthName = displayDateForSchoolWeek(weekInfo).toLocaleDateString("fr-FR", {
    month: "long"
  });
  const schoolWeeks = schoolYearWeeks();
  return `<section class="dateInfo">
          <div class="dateNav">
            <button class="weekArrow" id="prevWeek" title="Semaine precedente" ${weekInfo.rank <= 1 ? "disabled" : ""}>‹</button>
            <div class="dateMain">
              <span>Semaine sélectionnée</span>
              <strong>Semaine ${weekInfo.rank}${weekInfo.letter} - ${weekDateLabel(weekInfo)}</strong>
              <small>${weekWorkingDaysLabel(weekInfo)}</small>
            </div>
            <button class="weekArrow" id="nextWeek" title="Semaine suivante" ${weekInfo.rank >= schoolWeeks.length ? "disabled" : ""}>›</button>
          </div>
          <div class="dateChips">
            <span class="dateChip">Mois <strong>${monthName}</strong></span>
            <span class="dateChip">Template <strong>${state.schoolYear.label}</strong></span>
            <button class="ghostButton" data-print-format="A4">Exporter A4</button>
          </div>
        </section>`;
}
export function renderCalendar(cycle) {
  const weekItem = displayedSchoolWeek();
  const rows = yearRows();
  const calendarSlots = homeTimetableSlots();
  return `${renderDateInfo()}${renderTeacherLegend("homeTeacherLegend")}<div class="homeTimetableWrap"><table class="homeTimetable">
          <thead><tr><th class="timeColumn">Créneau</th>${state.days.map(day => `<th>${day}</th>`).join("")}</tr></thead>
          <tbody>${calendarSlots.map(slot => `<tr>
            <th class="timeColumn">${slot.label}</th>
            ${state.days.map(day => {
    const row = slot.isAsSummary ? rows.find(item => item.day === day && item.isAs) : rows.find(item => item.day === day && item.slot.id === slot.id && item.slot.label === slot.label);
    const nonWorkingCell = day === "Mercredi" && ["13", "15"].includes(slot.id);
    if (!row) return `<td class="${nonWorkingCell ? "nonWorkingCell" : ""}"><div class="homeTimetableSlot"></div></td>`;
    const key = yearCellKey(row.id, weekItem.rank);
    const holiday = holidayFor(row, weekItem);
    const vacation = vacationForCell(row, weekItem);
    const lessons = slot.isAsSummary ? [] : visibleCourseBlocksForCell(row, weekItem);
    const events = slot.isAsSummary ? [] : eventsForPeriod(row, weekItem).filter(eventMatchesTeacherSelection);
    const asItems = (slot.isAsSummary ? asSessionsForDay(rows, day, weekItem) : asSessionsForCell(row, weekItem)).filter(asMatchesTeacherSelection);
    return `<td><div class="homeTimetableSlot">
                ${vacation ? `<div class="emptyLesson">${vacation.name}</div>` : ""}
                ${!vacation && holiday ? `<div class="emptyLesson">${holiday}</div>` : ""}
                ${lessons.map(lesson => `
                  <div class="lesson" style="${blockTeacherStyle(lesson)}">
                    <div class="lessonTop"><strong>${blockClassLabel(lesson)}</strong></div>
                    <div class="lessonMeta"><span class="muted">${lesson.facilityLabel}</span></div>
                  </div>`).join("")}
                ${events.map(event => `<div class="lesson eventBlock"><strong>${event.name}</strong><span>${eventPeriodLabel(event)}</span>${eventTeacherDots(event)}</div>`).join("")}
                ${asItems.map(session => `<div class="lesson asBlock" style="${asSessionStyle(session)}"><strong>${asBlockLabel(session)}</strong><span>${asSessionTeacherLabel(session)}</span></div>`).join("")}
                ${!vacation && !holiday && !lessons.length && !events.length && !asItems.length ? "" : ""}
              </div></td>`;
  }).join("")}
          </tr>`).join("")}</tbody>
        </table></div>`;
}
export function renderFacilitiesCalendar(cycle) {
  const weekItem = displayedSchoolWeek();
  const rows = yearRows();
  return `<div class="facilityScheduleWrap">
          <table class="facilitySchedule">
            <thead>
              <tr><th class="slotName">Créneau</th><th class="facilityName">Installation</th>${state.days.map(day => `<th>${day}</th>`).join("")}</tr>
            </thead>
            <tbody>${state.slots.map(slot => state.facilities.map((facility, facilityIndex) => `
              <tr>
                ${facilityIndex === 0 ? `<th class="slotName" rowspan="${state.facilities.length}">${slot.label}</th>` : ""}
                <th class="facilityName">${facility.label}</th>
                ${state.days.map(day => {
    const row = rows.find(item => item.day === day && item.slot.id === slot.id);
    const key = row ? yearCellKey(row.id, weekItem.rank) : "";
    const facilityLessons = row ? visibleCourseBlocksForCell(row, weekItem, false).filter(item => item.facilityId === facility.id) : [];
    const unavailableItems = row ? unavailableForCell(row, weekItem).filter(item => unavailableCoversFacility(item, facility.id)) : [];
    const isBusy = facilityLessons.length > 0;
    const isUnavailable = unavailableItems.length > 0;
    return `<td><div class="facilityCell ${isBusy ? "occupied" : isUnavailable ? "unavailable" : "free"}">
                      <strong>${isBusy ? "Occupée" : isUnavailable ? "Indisponible" : row ? "Libre" : "Pas de cours"}</strong>
                      ${isBusy ? `<span>${facilityLessons.map(lesson => `${teacherLabelForBlock(lesson)} · ${blockClassLabel(lesson)}`).join(" / ")}</span>` : ""}
                      ${!isBusy && isUnavailable ? `<span>${unavailableItems.map(item => item.name || "Contrainte").join(" / ")}</span>` : ""}
                    </div></td>`;
  }).join("")}
              </tr>`).join("")).join("")}</tbody>
          </table>
        </div>`;
}
export function renderTeachers(cycle) {
  const selectedWeek = activeScheduleWeek();
  const assignments = visible(cycle);
  const allSelected = allTeachersSelected();
  const displayedTeachers = state.teachers.filter(teacher => state.selectedTeacherIds.includes(teacher.id));
  return `<section class="panel">
          <h2>Vue par professeur</h2>
          <p class="muted">${allSelected ? "Tous les professeurs sont visibles ensemble" : `${displayedTeachers.length} professeur(s) sélectionné(s)`} pour la semaine ${selectedWeek}.</p>
          <div class="allTeachersGrid">${displayedTeachers.map(teacher => {
    const stats = statFor(cycle, teacher.id);
    const lessons = assignments.filter(item => item.teacher.id === teacher.id);
    return `<article class="teacherMini">
              <div class="teacherMiniHead" style="background:${teacher.color};border-bottom:1px solid ${teacher.border}">
                <strong>${teacher.name}</strong>
                <span class="muted">${stats.total}h / ${teacher.weekTargets[selectedWeek]}h</span>
              </div>
              <div class="miniWeek">${state.days.map(day => {
      const dayLessons = lessons.filter(lesson => lesson.day === day).sort((a, b) => state.slots.findIndex(slot => slot.id === a.slot.id) - state.slots.findIndex(slot => slot.id === b.slot.id));
      return `<section class="miniDay">
                  <h3>${day}</h3>
                  ${dayLessons.length ? dayLessons.map(lesson => `
                    <div class="miniLesson" style="background:${teacher.color};border-color:${teacher.border}">
                      <strong>${lesson.slot.label}</strong>
                      <span>${compactClassName(lesson.schoolClass)} · ${lesson.facility.label}</span>
                    </div>`).join("") : `<div class="miniEmpty">Libre</div>`}
                </section>`;
    }).join("")}</div>
            </article>`;
  }).join("")}</div>
        </section>`;
}
export function bindTimetableEvents() {
  const prevWeek = document.getElementById("prevWeek");
  if (prevWeek) {
    prevWeek.addEventListener("click", () => {
      navigateDisplayedWeek(-1);
      render();
    });
  }
  const nextWeek = document.getElementById("nextWeek");
  if (nextWeek) {
    nextWeek.addEventListener("click", () => {
      navigateDisplayedWeek(1);
      render();
    });
  }
  document.querySelectorAll("[data-teacher]").forEach(button => {
    button.addEventListener("click", () => {
      const teacherId = button.dataset.teacher;
      if (teacherId === "all") {
        state.selectedTeacherIds = state.teachers.map(teacher => teacher.id);
      } else {
        const allSelected = state.selectedTeacherIds.length === state.teachers.length;
        if (allSelected) state.selectedTeacherIds = [teacherId];else if (state.selectedTeacherIds.includes(teacherId)) {
          state.selectedTeacherIds = state.selectedTeacherIds.filter(id => id !== teacherId);
        } else {
          state.selectedTeacherIds = [...state.selectedTeacherIds, teacherId];
        }
      }
      render();
    });
  });
}
