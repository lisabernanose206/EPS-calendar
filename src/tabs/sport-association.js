import { escapeHtml } from "../ui/format.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { asSessionStyle, asSessionTeacherLabel, resetAsForm, saveAsSessionFromForm } from "../domain/events.js";
import { makeSlotId, saveAsExclusions, saveAsSessions, saveSchoolSlotsAndRender } from "../services/settings-storage.js";
import { renderDateRangePicker } from "../ui/date-picker.js";
import { showValidationPopup } from "../ui/feedback.js";

export function renderAsView() {
  const canSaveAs = Boolean(state.asTeacherIds.length && state.asWeekdays.length && state.asStart && state.asEnd);
  return `<section class="eventPage">
          <div class="eventForm">
            <h3>${state.editingAsId ? "Modifier l'AS" : "Ajouter une AS"}</h3>
            <div class="eventField">
              <label>Nom</label>
              <input id="asName" value="${escapeHtml(state.asName)}" />
            </div>
            <div class="eventField">
              <label>Dates</label>
              ${renderDateRangePicker("as", state.asStart, state.asEnd)}
            </div>
            <div class="eventField">
              <label>Jours récurrents · ${(state.schoolConstraints.asSlots || []).map(slot => slot.label.replace(/^AS\s*/i, "")).join(", ")}</label>
              <div class="choiceGrid">${state.days.map(day => `<button class="choiceButton ${state.asWeekdays.includes(day) ? "active" : ""}" data-as-day="${day}">${day}</button>`).join("")}</div>
            </div>
            <div class="eventField">
              <label>Profs concernés</label>
              <div class="choiceGrid">${state.teachers.map(teacher => `<button class="choiceButton ${state.asTeacherIds.includes(teacher.id) ? "active" : ""}" data-as-teacher="${escapeHtml(teacher.id)}" style="background:${escapeHtml(teacher.color)};border-color:${escapeHtml(teacher.border)}">${escapeHtml(teacher.name)}</button>`).join("")}</div>
            </div>
            <div class="modalFooter">
              ${state.editingAsId ? `<button class="ghostButton" id="cancelAsEdit">Annuler</button>` : ""}
              <button class="addButton" id="addAsSession" ${canSaveAs ? "" : "disabled"}>${state.editingAsId ? "Enregistrer les modifications" : "Ajouter l'AS"}</button>
            </div>
          </div>
          <div class="eventList">
            <h3>AS existantes</h3>
            ${state.asSessions.length === 0 ? `<div class="alertEmpty">Aucune AS ajoutée.</div>` : `<div class="compactCardGrid fiveCardGrid">${state.asSessions.map(session => `
              <article class="eventCard asExistingCard" style="${asSessionStyle(session)}">
                <strong>${escapeHtml(session.name)}</strong>
                <span>${escapeHtml(session.start)} ↔ ${escapeHtml(session.end)} · ${session.weekdays.join(", ")} · AS midi</span>
                <span>${asSessionTeacherLabel(session)}</span>
                <button class="ghostButton" data-edit-as="${escapeHtml(session.id)}">Modifier</button>
                <button class="ghostButton" data-delete-as="${escapeHtml(session.id)}">Supprimer</button>
              </article>`).join("")}</div>`}
          </div>
        </section>`;
}
export function bindSportAssociationEvents() {
  const addAsSlot = document.getElementById("addAsSlot");
  if (addAsSlot) {
    addAsSlot.addEventListener("click", () => {
      const id = makeSlotId("as", (state.schoolConstraints.asSlots || []).map(slot => slot.id));
      state.schoolConstraints = {
        ...state.schoolConstraints,
        asSlots: [...(state.schoolConstraints.asSlots || []), {
          id,
          startTime: "16:30",
          endTime: "17:30",
          label: "AS 16h30-17h30",
          days: ["Mercredi"],
          hours: 1
        }]
      };
      saveSchoolSlotsAndRender("Créneau AS ajouté");
    });
  }
  const asNameInput = document.getElementById("asName");
  if (asNameInput) asNameInput.addEventListener("input", () => state.asName = asNameInput.value);
  document.querySelectorAll("[data-as-day]").forEach(button => {
    button.addEventListener("click", () => {
      const day = button.dataset.asDay;
      state.asWeekdays = state.asWeekdays.includes(day) ? state.asWeekdays.filter(item => item !== day) : [...state.asWeekdays, day];
      render();
    });
  });
  document.querySelectorAll("[data-as-teacher]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.asTeacher;
      state.asTeacherIds = state.asTeacherIds.includes(id) ? state.asTeacherIds.filter(item => item !== id) : [...state.asTeacherIds, id];
      render();
    });
  });
  const addAsSession = document.getElementById("addAsSession");
  if (addAsSession) {
    addAsSession.addEventListener("click", () => {
      if (!state.asTeacherIds.length || !state.asWeekdays.length || !state.asStart || !state.asEnd) return;
      const message = state.editingAsId ? "AS modifiée" : "AS validée";
      saveAsSessionFromForm();
      showValidationPopup(message);
      render();
    });
  }
  document.querySelectorAll("[data-edit-as]").forEach(button => {
    button.addEventListener("click", () => {
      const session = state.asSessions.find(item => item.id === button.dataset.editAs);
      if (!session) return;
      state.editingAsId = session.id;
      state.asName = session.name;
      state.asStart = session.start;
      state.asEnd = session.end;
      state.asWeekdays = [...(session.weekdays || [])];
      state.asTeacherIds = [...(session.teacherIds || [])];
      render();
    });
  });
  document.querySelectorAll("[data-delete-as]").forEach(button => {
    button.addEventListener("click", () => {
      state.asSessions = state.asSessions.filter(session => session.id !== button.dataset.deleteAs);
      delete state.asExclusions[button.dataset.deleteAs];
      if (state.editingAsId === button.dataset.deleteAs) resetAsForm();
      saveAsSessions();
      saveAsExclusions();
      showValidationPopup("AS supprimée");
      render();
    });
  });
  const cancelAsEdit = document.getElementById("cancelAsEdit");
  if (cancelAsEdit) {
    cancelAsEdit.addEventListener("click", () => {
      resetAsForm();
      render();
    });
  }
}
