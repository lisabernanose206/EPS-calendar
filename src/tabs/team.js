import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { availableTeacherPalette, firstAvailableTeacherColor, syncConstructionRulesForTeacher, teacherBorderForColor, teacherIdsForBlock, teacherNamesForBlock } from "../domain/assignments.js";
import { eventExclusionsFor } from "../domain/events.js";
import { rebuildConstructionPlan, saveAsSessions, saveBlockExclusions, saveEventExclusions, saveFacilityUnavailability, saveServiceAssignments, saveSportEvents, saveTeachers } from "../services/settings-storage.js";
import { showValidationPopup } from "../ui/feedback.js";

export function renderTeamSettings() {
  const draftPalette = availableTeacherPalette();
  if (state.teacherDraftColor && !draftPalette.some(item => item.color === state.teacherDraftColor)) {
    state.teacherDraftColor = firstAvailableTeacherColor();
  }
  const canAddTeacher = state.teacherDraftName.trim().length > 0 && Boolean(state.teacherDraftColor) && Boolean(state.teacherDraftStatus);
  const teacherDraftHours = state.teacherDraftStatus === "agrégé" ? 14 : state.teacherDraftStatus === "certifie" ? 17 : "-";
  return `<section class="eventPage">
          <div class="eventForm">
            <h3>Ajouter un professeur</h3>
            <div class="eventField">
              <label>Prénom</label>
              <input id="teacherDraftName" placeholder="Ex. Lisa" value="${state.teacherDraftName}" />
            </div>
            <div class="eventField">
              <label>Couleur</label>
              <div class="teacherColorPalette">${draftPalette.map(item => `<button class="teacherColorSwatch ${state.teacherDraftColor === item.color ? "active" : ""}" data-teacher-draft-color="${item.color}" style="background:${item.color};border-color:${state.teacherDraftColor === item.color ? item.border : "transparent"}" title="Couleur"></button>`).join("") || `<span class="muted">Toutes les couleurs sont déjà utilisées.</span>`}</div>
            </div>
            <div class="eventField">
              <label>Statut</label>
              <div class="choiceGrid">
                <button class="choiceButton ${state.teacherDraftStatus === "certifie" ? "active" : ""}" data-teacher-status="certifie">Certifié · 17h</button>
                <button class="choiceButton ${state.teacherDraftStatus === "agrégé" ? "active" : ""}" data-teacher-status="agrégé">Agrégé · 14h</button>
              </div>
            </div>
            <div class="teamPreview" style="background:${state.teacherDraftColor || "#f8fafc"};border-color:${state.teacherDraftColor ? teacherBorderForColor(state.teacherDraftColor) : "#cbd5e1"}">
              <strong>${state.teacherDraftName.trim() || "Nouveau prof"}</strong>
              <span class="muted">Cours classiques : ${teacherDraftHours}h · AS : 3h</span>
            </div>
            <div class="modalFooter">
              <button class="addButton" id="addTeacher" ${canAddTeacher ? "" : "disabled"}>Ajouter le prof</button>
            </div>
          </div>
          <div class="eventList">
            <h3>Équipe EPS</h3>
            <div class="compactCardGrid">${state.teachers.map(teacher => `<article class="eventCard teamCard">
              <div class="teamPreview" style="background:${teacher.color};border-color:${teacher.border}">
                <input class="teamNameEdit" data-rename-teacher="${teacher.id}" value="${teacher.name}" aria-label="Prenom du professeur" />
                <span>${teacher.weeklyReference}h cours classiques · 3h AS</span>
                ${teacher.replacementName ? `<span>Remplacant : ${teacher.replacementName}</span>` : ""}
              </div>
              <div class="eventField">
                <label>Couleur</label>
                <button class="ghostButton teacherColorToggle" data-toggle-teacher-color="${teacher.id}">${state.expandedTeacherColorId === teacher.id ? "Masquer les couleurs" : "Changer la couleur"}</button>
                ${state.expandedTeacherColorId === teacher.id ? `<div class="teacherColorPalette">${availableTeacherPalette(teacher.id).map(item => `<button class="teacherColorSwatch ${teacher.color === item.color ? "active" : ""}" data-update-teacher-color="${teacher.id}" data-color="${item.color}" style="background:${item.color};border-color:${teacher.color === item.color ? item.border : "transparent"}" title="Couleur"></button>`).join("")}</div>` : ""}
              </div>
              <div class="eventField">
                <label>Remplacant</label>
                <input class="replacementEdit" data-teacher-replacement="${teacher.id}" placeholder="Ex. Nom du remplacant" value="${teacher.replacementName || ""}" />
              </div>
              <button class="ghostButton" data-delete-teacher="${teacher.id}">Supprimer</button>
            </article>`).join("")}</div>
          </div>
        </section>`;
}
export function bindTeamEvents() {
  document.querySelectorAll("[data-delete-teacher]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteTeacher;
      state.teachers = state.teachers.filter(teacher => teacher.id !== id);
      state.selectedTeacherIds = state.selectedTeacherIds.filter(teacherId => teacherId !== id);
      if (!state.selectedTeacherIds.length) state.selectedTeacherIds = state.teachers.map(teacher => teacher.id);
      state.cycleTeacherIds = state.cycleTeacherIds.filter(teacherId => teacherId !== id);
      state.blockTeacherIds = state.blockTeacherIds.filter(teacherId => teacherId !== id);
      state.eventTeacherIds = state.eventTeacherIds.filter(teacherId => teacherId !== id);
      state.asTeacherIds = state.asTeacherIds.filter(teacherId => teacherId !== id);
      state.unavailableTeacherIds = state.unavailableTeacherIds.filter(teacherId => teacherId !== id);
      delete state.serviceAssignments[id];
      const removedRuleIds = new Set(state.constructionRules.filter(rule => teacherIdsForBlock(rule.block).includes(id)).map(rule => rule.id));
      state.constructionRules = state.constructionRules.filter(rule => !removedRuleIds.has(rule.id));
      Object.keys(state.blockExclusions).forEach(ruleId => {
        if (removedRuleIds.has(ruleId)) delete state.blockExclusions[ruleId];
      });
      state.sportEvents = state.sportEvents.map(event => ({
        ...event,
        teacherIds: (event.teacherIds || []).filter(teacherId => teacherId !== id)
      }));
      state.eventExclusions = {};
      state.sportEvents.forEach(event => {
        const exclusions = eventExclusionsFor(event);
        if (exclusions.length) state.eventExclusions[event.id] = exclusions;
      });
      state.asSessions = state.asSessions.filter(session => !(session.teacherIds || []).includes(id));
      state.facilityUnavailability = state.facilityUnavailability.map(item => ({
        ...item,
        teacherIds: (item.teacherIds || []).filter(teacherId => teacherId !== id)
      })).filter(item => item.type !== "teacher" || (item.teacherIds || []).length);
      saveTeachers();
      saveFacilityUnavailability();
      saveSportEvents();
      saveEventExclusions();
      saveAsSessions();
      saveBlockExclusions();
      saveServiceAssignments(true);
      rebuildConstructionPlan();
      showValidationPopup("Professeur supprimé");
      render();
    });
  });
  document.querySelectorAll("[data-update-teacher-color]").forEach(button => {
    button.addEventListener("click", () => {
      const teacher = state.teachers.find(item => item.id === button.dataset.updateTeacherColor);
      if (!teacher) return;
      teacher.color = button.dataset.color;
      teacher.border = teacherBorderForColor(teacher.color);
      syncConstructionRulesForTeacher(teacher.id);
      saveTeachers();
      rebuildConstructionPlan();
      state.expandedTeacherColorId = "";
      render();
    });
  });
  document.querySelectorAll("[data-rename-teacher]").forEach(input => {
    const saveRename = () => {
      const teacher = state.teachers.find(item => item.id === input.dataset.renameTeacher);
      if (!teacher) return;
      const name = input.value.trim();
      if (!name || name === teacher.name) return;
      teacher.name = name;
      state.constructionRules = state.constructionRules.map(rule => {
        const ids = teacherIdsForBlock(rule.block);
        if (!ids.includes(teacher.id)) return rule;
        return {
          ...rule,
          block: {
            ...rule.block,
            teacherName: ids[0] === teacher.id ? name : rule.block.teacherName,
            teacherNames: teacherNamesForBlock({
              ...rule.block,
              teacherIds: ids
            }).join(" + ")
          }
        };
      });
      saveTeachers();
      rebuildConstructionPlan();
      render();
    };
    input.addEventListener("change", saveRename);
    input.addEventListener("blur", saveRename);
  });
  const teacherDraftNameInput = document.getElementById("teacherDraftName");
  if (teacherDraftNameInput) teacherDraftNameInput.addEventListener("input", () => state.teacherDraftName = teacherDraftNameInput.value);
  document.querySelectorAll("[data-teacher-draft-color]").forEach(button => {
    button.addEventListener("click", () => {
      state.teacherDraftColor = button.dataset.teacherDraftColor;
      render();
    });
  });
  document.querySelectorAll("[data-teacher-status]").forEach(button => {
    button.addEventListener("click", () => {
      state.teacherDraftStatus = button.dataset.teacherStatus;
      render();
    });
  });
  const addTeacher = document.getElementById("addTeacher");
  if (addTeacher) {
    addTeacher.addEventListener("click", () => {
      const name = state.teacherDraftName.trim();
      if (!name || !state.teacherDraftColor || !state.teacherDraftStatus) return;
      const id = `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const weeklyReference = state.teacherDraftStatus === "agrégé" ? 14 : 17;
      const teacher = {
        id,
        name,
        color: state.teacherDraftColor,
        border: teacherBorderForColor(state.teacherDraftColor),
        monthlyTarget: weeklyReference * 4,
        weeklyReference,
        weekTargets: {
          A: weeklyReference,
          B: weeklyReference
        }
      };
      state.teachers = [...state.teachers, teacher];
      state.selectedTeacherIds = [...state.selectedTeacherIds, id];
      state.cycleTeacherIds = [...state.cycleTeacherIds, id];
      state.teacherDraftName = "";
      state.teacherDraftColor = firstAvailableTeacherColor();
      state.teacherDraftStatus = "";
      saveTeachers();
      showValidationPopup("Professeur validé");
      render();
    });
  }
  document.querySelectorAll("[data-toggle-teacher-color]").forEach(button => {
    button.addEventListener("click", () => {
      state.expandedTeacherColorId = state.expandedTeacherColorId === button.dataset.toggleTeacherColor ? "" : button.dataset.toggleTeacherColor;
      render();
    });
  });
  document.querySelectorAll("[data-teacher-replacement]").forEach(input => {
    const saveReplacement = () => {
      const teacher = state.teachers.find(item => item.id === input.dataset.teacherReplacement);
      if (!teacher) return;
      teacher.replacementName = input.value.trim();
      saveTeachers();
      render();
    };
    input.addEventListener("change", saveReplacement);
    input.addEventListener("blur", saveReplacement);
  });
}
