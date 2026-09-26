import { escapeHtml } from "../ui/format.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { classParts, schoolClassLabel, toggleExclusiveClassSelection, toggleWholeLevelSelection } from "../domain/assignments.js";
import { eventPeriodLabel } from "../domain/events.js";
import { resetEventForm, saveSportEventFromForm } from "../domain/unavailability.js";
import { classNumbersForLevel, classesForLevel, rebuildConstructionPlan, saveEventExclusions, saveSportEvents } from "../services/settings-storage.js";
import { renderDateRangePicker } from "../ui/date-picker.js";
import { showValidationPopup } from "../ui/feedback.js";
import { classSelectionButtonClass, classSelectionButtonLabel, eventClassSummary } from "../ui/format.js";

export function renderEventsView() {
  return `<section class="eventPage">
          <div class="eventForm">
            <h3>${state.editingEventId ? "Modifier l'événement sportif" : "Ajouter un événement sportif"}</h3>
            <div class="eventField">
              <label>Nom</label>
              <input id="eventName" value="${escapeHtml(state.eventName)}" />
            </div>
            <div class="eventField">
              <label>Dates</label>
              ${renderDateRangePicker("event", state.eventStart, state.eventEnd)}
            </div>
            <div class="eventField">
              <label>Période</label>
              <div class="choiceGrid">
                ${[{
    id: "all",
    label: "Journée"
  }, {
    id: "morning",
    label: "Matin"
  }, {
    id: "afternoon",
    label: "Après-midi"
  }, ...state.slots.map(slot => ({
    id: `slot-${slot.id}`,
    label: slot.label
  }))].map(period => `<button class="choiceButton ${state.eventHalfDay === period.id ? "active" : ""}" data-event-half-day="${escapeHtml(period.id)}">${escapeHtml(period.label)}</button>`).join("")}
              </div>
            </div>
            <div class="eventField">
              <label>Profs concernés</label>
              <div class="choiceGrid">${state.teachers.map(teacher => `<button class="choiceButton ${state.eventTeacherIds.includes(teacher.id) ? "active" : ""}" data-event-teacher="${escapeHtml(teacher.id)}" style="background:${escapeHtml(teacher.color)};border-color:${escapeHtml(teacher.border)}">${escapeHtml(teacher.name)}</button>`).join("")}</div>
            </div>
            <div class="eventField">
              <label>Classes concernées</label>
              <div class="classMatrix">${state.classLevels.map(level => `<div class="classMatrixRow">
                <button class="classLevelLabel ${classesForLevel(level).length && classesForLevel(level).every(schoolClass => state.eventClasses.includes(schoolClass)) ? "active" : ""}" data-event-class-level="${level}">${level}</button>
                <div class="classNumberGrid">${classNumbersForLevel(level).map(number => {
    return state.classGroups.map(group => {
      const schoolClass = schoolClassLabel(level, number, group.id);
      return `<button class="choiceButton${classSelectionButtonClass(schoolClass)} ${state.eventClasses.includes(schoolClass) ? "active" : ""}" data-event-class="${schoolClass}">${classSelectionButtonLabel(schoolClass)}</button>`;
    }).join("");
  }).join("")}</div>
              </div>`).join("")}</div>
              <span class="muted">${state.eventClasses.length ? `Classes sélectionnées : ${state.eventClasses.map(classSelectionButtonLabel).join(", ")}` : "Aucune classe sélectionnée"}</span>
            </div>
            <div class="modalFooter">
              ${state.editingEventId ? `<button class="ghostButton" id="cancelEventEdit">Annuler</button>` : ""}
              <button class="addButton" id="addSportEvent" ${state.eventTeacherIds.length ? "" : "disabled"}>${state.editingEventId ? "Enregistrer les modifications" : "Ajouter l'événement"}</button>
            </div>
          </div>
          <div class="eventList">
            <h3>Événements existants</h3>
            ${state.sportEvents.length === 0 ? `<div class="alertEmpty">Aucun événement sportif ajouté.</div>` : `<div class="compactCardGrid fiveCardGrid">${state.sportEvents.map(event => `
              <article class="eventCard">
                <input class="eventNameEdit" data-rename-event="${escapeHtml(event.id)}" value="${escapeHtml(event.name)}" aria-label="Nom de l'événement" />
                <span>${escapeHtml(event.start)} ↔ ${escapeHtml(event.end)} · ${eventPeriodLabel(event)}</span>
                <span>Classes : ${eventClassSummary(event)}</span>
                <span class="eventTeacherSummary">${escapeHtml(event.teacherIds.length)} prof(s) ${event.teacherIds.map(teacherId => {
    const teacher = state.teachers.find(item => item.id === teacherId);
    return teacher ? `<i class="eventTeacherSwatch" style="background:${escapeHtml(teacher.color)};border-color:${escapeHtml(teacher.border)}" title="${escapeHtml(teacher.name)}"></i>` : "";
  }).join("")}</span>
                <button class="ghostButton" data-edit-event="${escapeHtml(event.id)}">Modifier</button>
                <button class="ghostButton" data-delete-event="${escapeHtml(event.id)}">Supprimer</button>
              </article>`).join("")}</div>`}
          </div>
        </section>`;
}
export function bindEventsEvents() {
  document.querySelectorAll("[data-delete-event]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      state.sportEvents = state.sportEvents.filter(event => event.id !== button.dataset.deleteEvent);
      delete state.eventExclusions[button.dataset.deleteEvent];
      if (state.editingEventId === button.dataset.deleteEvent) resetEventForm();
      saveSportEvents();
      saveEventExclusions();
      rebuildConstructionPlan();
      showValidationPopup("Événement sportif supprimé");
      render();
    });
  });
  const eventNameInput = document.getElementById("eventName");
  if (eventNameInput) eventNameInput.addEventListener("input", () => state.eventName = eventNameInput.value);
  document.querySelectorAll("[data-event-half-day]").forEach(button => {
    button.addEventListener("click", () => {
      state.eventHalfDay = button.dataset.eventHalfDay;
      render();
    });
  });
  document.querySelectorAll("[data-event-teacher]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.eventTeacher;
      state.eventTeacherIds = state.eventTeacherIds.includes(id) ? state.eventTeacherIds.filter(item => item !== id) : [...state.eventTeacherIds, id];
      render();
    });
  });
  document.querySelectorAll("[data-event-class]").forEach(button => {
    button.addEventListener("click", () => {
      const schoolClass = button.dataset.eventClass;
      state.eventClasses = toggleExclusiveClassSelection(state.eventClasses, schoolClass);
      render();
    });
  });
  document.querySelectorAll("[data-event-class-level]").forEach(button => {
    button.addEventListener("click", () => {
      const level = button.dataset.eventClassLevel;
      state.eventClasses = toggleWholeLevelSelection(state.eventClasses, level);
      render();
    });
  });
  const addSportEvent = document.getElementById("addSportEvent");
  if (addSportEvent) {
    addSportEvent.addEventListener("click", () => {
      if (!state.eventTeacherIds.length) return;
      const message = state.editingEventId ? "Événement sportif modifié" : "Événement sportif validé";
      saveSportEventFromForm();
      showValidationPopup(message);
      render();
    });
  }
  const cancelEventEdit = document.getElementById("cancelEventEdit");
  if (cancelEventEdit) {
    cancelEventEdit.addEventListener("click", () => {
      resetEventForm();
      render();
    });
  }
  document.querySelectorAll("[data-edit-event]").forEach(button => {
    button.addEventListener("click", () => {
      const event = state.sportEvents.find(item => item.id === button.dataset.editEvent);
      if (!event) return;
      state.editingEventId = event.id;
      state.eventName = event.name;
      state.eventStart = event.start;
      state.eventEnd = event.end;
      state.eventHalfDay = event.halfDay || "all";
      state.eventTeacherIds = [...(event.teacherIds || [])];
      state.eventClasses = [...(event.classes || [])];
      state.eventClassLevelFilter = state.eventClasses[0] ? classParts(state.eventClasses[0]).level : "";
      render();
    });
  });
  document.querySelectorAll("[data-rename-event]").forEach(input => {
    const saveRename = () => {
      const event = state.sportEvents.find(item => item.id === input.dataset.renameEvent);
      if (!event) return;
      const name = input.value.trim();
      if (!name || name === event.name) return;
      event.name = name;
      saveSportEvents();
      render();
    };
    input.addEventListener("blur", saveRename);
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      saveRename();
    });
  });
}
