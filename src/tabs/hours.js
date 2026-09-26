import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { removeServiceAssignment, removeServiceFreeAssignment, schoolClassLabel, selectedServiceClassForTeacher, selectedServiceLevelForTeacher, serviceAlerts, serviceAssignmentFor, serviceClassHoursValid, serviceClassRowsForTeacher, serviceClassTarget, serviceDraftKey, serviceDraftValue, serviceFreeDraftForTeacher, serviceFreeRowsForTeacher, serviceMaxAssignableHours, setServiceAssignment, setServiceFreeAssignment, syncServiceFreeDraft } from "../domain/assignments.js";
import { classNumbersForLevel, saveServiceHoursByLevel, serviceClassesForLevel, specialClassHoursForSchoolClass, specialClassInstances } from "../services/settings-storage.js";
import { showValidationPopup } from "../ui/feedback.js";
import { compactClassName, hourStatus } from "../ui/format.js";

export function renderHoursBalance() {
  const alerts = serviceAlerts();
  return `<section class="hoursBalancePage">
          <div class="hoursBalanceHeader">
            <div>
              <h2>Service</h2>
              <p class="muted">Affectez les classes aux profs et indiquez le nombre d'heures hebdomadaires prévues. Une alerte s'affiche si une classe dépasse son volume autorisé.</p>
            </div>
          </div>
          <div class="servicePanel compactServicePanel">
            <h3>Volumes EPS hebdomadaires par niveau</h3>
            <div class="serviceTargets">${state.classLevels.map(level => `
              <div class="serviceTarget">
                <label>${level}</label>
                <input data-service-level-hours="${level}" type="number" min="0" max="${state.defaultServiceHours[level]}" step="0.5" value="${serviceClassTarget(schoolClassLabel(level, classNumbersForLevel(level)[0] || "1"))}" />
              </div>`).join("")}${specialClassInstances().map(({
    item,
    baseClassId,
    schoolClass
  }) => `
              <div class="serviceTarget">
                <label>${compactClassName(schoolClass)}</label>
                <input data-service-special-hours="${schoolClass}" type="number" min="0" step="0.5" value="${specialClassHoursForSchoolClass(schoolClass)}" />
              </div>`).join("")}</div>
            <div class="alertHelp"><strong>Contrainte de construction</strong><span>Il faut minimum 24h d'intervalle pour refaire cours avec la même classe, peu importe le prof. Cette contrainte sera intégrée lors de la construction des emplois du temps.</span></div>
            ${alerts.length ? `<div class="serviceAlerts">${alerts.map(item => `<div class="serviceAlert">${compactClassName(item.schoolClass)} : ${item.total}h affectées / ${item.target}h autorisées. A modifier avant validation du service.</div>`).join("")}</div>` : `<div class="alertEmpty">Aucun dépassement d'heures par classe.</div>`}
          </div>
          <div class="servicePanel">
            <h3>Service théorique</h3>
            <div class="serviceTeachers">${state.teachers.map(teacher => {
    const teacherRows = serviceClassRowsForTeacher(teacher.id);
    const freeRows = serviceFreeRowsForTeacher(teacher.id);
    const freeDraft = serviceFreeDraftForTeacher(teacher.id);
    const selectedLevel = selectedServiceLevelForTeacher(teacher.id);
    const visibleClasses = selectedLevel ? serviceClassesForLevel(selectedLevel) : [];
    const selectedClass = selectedServiceClassForTeacher(teacher.id);
    const selectedClassAssignment = selectedClass ? serviceAssignmentFor(teacher.id, selectedClass) : null;
    const selectedClassHoursDraft = selectedClass ? serviceDraftValue(teacher.id, selectedClass) : "";
    const selectedClassMaxHours = selectedClass ? serviceMaxAssignableHours(teacher.id, selectedClass) : 0;
    const canValidateSelectedClass = selectedClass && serviceClassHoursValid(teacher.id, selectedClass, selectedClassHoursDraft);
    const total = [...teacherRows, ...freeRows].reduce((sum, row) => sum + (Number(row.hours) || 0), 0);
    const courseTarget = teacher.weeklyReference;
    const overtimeHours = Math.max(0, Math.round((total - courseTarget) * 10) / 10);
    return `<article class="serviceTeacher" style="background:${teacher.color};border-color:${teacher.border}">
                <div class="hoursCardTop">
                  <strong>${teacher.name}</strong>
                </div>
                <div class="serviceCompare singleColumn">
                  <div class="serviceColumn">
                    <h4>Service théorique</h4>
                    <div class="serviceTheorySummary">
                      <span class="hoursStatus ${hourStatus(total - courseTarget).className}">${total}h / ${courseTarget}h</span>
                      ${overtimeHours ? `<span class="overtimeBadge">${overtimeHours}h HSA</span>` : ""}
                    </div>
                <div class="serviceLevelButtons">
                  ${state.classLevels.map(level => `<button class="choiceButton ${selectedLevel === level ? "active" : ""}" data-service-level="${teacher.id}" data-service-level-value="${level}">${level}</button>`).join("")}
                </div>
                ${selectedLevel ? `<div class="serviceClassRows">${visibleClasses.map(schoolClass => {
      const assignment = serviceAssignmentFor(teacher.id, schoolClass);
      const active = selectedClass === schoolClass;
      return `<button class="choiceButton serviceClassButton ${active ? "active" : ""}" data-service-class-toggle="${teacher.id}" data-service-class="${schoolClass}" title="${assignment ? `${assignment.hours}h affectée(s)` : ""}">${compactClassName(schoolClass)}${assignment ? ` &middot; ${assignment.hours}h` : ""}</button>`;
    }).join("")}</div>
                ${selectedClass ? `<div class="serviceClassRow">
                  <strong>${compactClassName(selectedClass)}</strong>
                  <input class="serviceHoursInput ${selectedClassAssignment ? "" : "needsValidation"}" data-service-class-hours="${teacher.id}" data-service-class="${selectedClass}" type="number" min="0" max="${selectedClassMaxHours}" step="0.5" value="${selectedClassHoursDraft}" placeholder="${serviceClassTarget(selectedClass)}h max" />
                  <button class="serviceValidateButton" data-service-class-validate="${teacher.id}" data-service-class="${selectedClass}" title="Valider les heures" ${canValidateSelectedClass ? "" : "disabled"}>&#10003;</button>
                </div>` : `<span class="muted">Choisissez une classe pour renseigner les heures.</span>`}` : `<span class="muted">Choisissez un niveau pour afficher les classes.</span>`}
                <div class="classPills">${teacherRows.length ? teacherRows.map(row => `<button class="classPill" data-service-assignment-delete="${teacher.id}" data-service-assignment-class="${row.classId}" title="Supprimer cette affectation">${compactClassName(row.classId)} &middot; ${row.hours}h</button>`).join("") : `<span class="classPill">Aucune classe affectée</span>`}</div>
                <div class="serviceFreeBox">
                  <label>Service libre</label>
                  <div class="serviceFreeRow">
                    <input data-service-free-label="${teacher.id}" value="${freeDraft.label}" placeholder="Ex. soutien piscine" />
                    <input data-service-free-hours="${teacher.id}" type="number" min="0" step="0.5" value="${freeDraft.hours}" placeholder="h" />
                    <button class="serviceValidateButton" data-service-free-validate="${teacher.id}" title="Valider le service libre" ${freeDraft.label.trim() && Number(freeDraft.hours) > 0 ? "" : "disabled"}>&#10003;</button>
                  </div>
                  <div class="classPills">${freeRows.length ? freeRows.map(row => `<button class="classPill" data-service-free-delete="${teacher.id}" data-service-free-id="${row.id}" title="Supprimer ce service libre">${row.label} &middot; ${row.hours}h</button>`).join("") : `<span class="classPill">Aucun service libre</span>`}</div>
                </div>
                  </div>
                </div>
              </article>`;
  }).join("")}</div>
          </div>
        </section>`;
}
export function bindHoursEvents() {
  document.querySelectorAll("[data-service-level-hours]").forEach(input => {
    input.addEventListener("change", () => {
      const level = input.dataset.serviceLevelHours;
      const legalTarget = Number(state.defaultServiceHours[level] ?? 0);
      const value = Math.max(0, Number(input.value) || 0);
      const cappedValue = legalTarget ? Math.min(value, legalTarget) : value;
      input.value = String(cappedValue);
      state.serviceHoursByLevel = {
        ...state.serviceHoursByLevel,
        [level]: cappedValue
      };
      saveServiceHoursByLevel(true);
      render();
    });
  });
  document.querySelectorAll("[data-service-class-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const teacherId = button.dataset.serviceClassToggle;
      const schoolClass = button.dataset.serviceClass;
      state.serviceClassByTeacher = {
        ...state.serviceClassByTeacher,
        [teacherId]: state.serviceClassByTeacher[teacherId] === schoolClass ? "" : schoolClass
      };
      if (!state.serviceClassByTeacher[teacherId]) {
        state.serviceDraftHours = {
          ...state.serviceDraftHours
        };
        delete state.serviceDraftHours[serviceDraftKey(teacherId, schoolClass)];
      }
      render();
    });
  });
  document.querySelectorAll("[data-service-level]").forEach(button => {
    button.addEventListener("click", () => {
      const teacherId = button.dataset.serviceLevel;
      const nextLevel = state.serviceLevelByTeacher[teacherId] === button.dataset.serviceLevelValue ? "" : button.dataset.serviceLevelValue;
      state.serviceLevelByTeacher = {
        ...state.serviceLevelByTeacher,
        [teacherId]: nextLevel
      };
      state.serviceClassByTeacher = {
        ...state.serviceClassByTeacher,
        [button.dataset.serviceLevel]: ""
      };
      render();
    });
  });
  document.querySelectorAll("[data-service-class-hours]").forEach(input => {
    input.addEventListener("input", () => {
      const teacherId = input.dataset.serviceClassHours;
      const schoolClass = input.dataset.serviceClass;
      const maxHours = serviceMaxAssignableHours(teacherId, schoolClass);
      if (Number(input.value) > maxHours) input.value = String(maxHours);
      state.serviceDraftHours = {
        ...state.serviceDraftHours,
        [serviceDraftKey(teacherId, schoolClass)]: input.value
      };
      const validateButton = document.querySelector(`[data-service-class-validate="${teacherId}"][data-service-class="${CSS.escape(schoolClass)}"]`);
      input.max = String(maxHours);
      input.classList.toggle("needsValidation", !serviceClassHoursValid(teacherId, schoolClass, input.value));
      if (validateButton) validateButton.disabled = !serviceClassHoursValid(teacherId, schoolClass, input.value);
    });
  });
  document.querySelectorAll("[data-service-class-validate]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const teacherId = button.dataset.serviceClassValidate;
      const schoolClass = button.dataset.serviceClass;
      const saved = setServiceAssignment(teacherId, schoolClass, serviceDraftValue(teacherId, schoolClass));
      if (!saved) {
        render();
        return;
      }
      state.serviceDraftHours = {
        ...state.serviceDraftHours
      };
      delete state.serviceDraftHours[serviceDraftKey(teacherId, schoolClass)];
      render();
    });
  });
  document.querySelectorAll("[data-service-free-label]").forEach(input => {
    input.addEventListener("input", () => {
      syncServiceFreeDraft(input.dataset.serviceFreeLabel);
    });
  });
  document.querySelectorAll("[data-service-free-hours]").forEach(input => {
    input.addEventListener("input", () => {
      syncServiceFreeDraft(input.dataset.serviceFreeHours);
    });
  });
  document.querySelectorAll("[data-service-free-validate]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const teacherId = button.dataset.serviceFreeValidate;
      const draft = serviceFreeDraftForTeacher(teacherId);
      if (!setServiceFreeAssignment(teacherId, draft.label, draft.hours)) return;
      state.serviceFreeDrafts = {
        ...state.serviceFreeDrafts,
        [teacherId]: {
          label: "",
          hours: ""
        }
      };
      render();
    });
  });
  document.querySelectorAll("[data-service-free-delete]").forEach(button => {
    button.addEventListener("click", () => {
      const teacherId = button.dataset.serviceFreeDelete;
      removeServiceFreeAssignment(teacherId, button.dataset.serviceFreeId);
      showValidationPopup("Service libre supprimé");
      render();
    });
  });
  document.querySelectorAll("[data-service-assignment-delete]").forEach(button => {
    button.addEventListener("click", () => {
      const teacherId = button.dataset.serviceAssignmentDelete;
      const schoolClass = button.dataset.serviceAssignmentClass;
      const teacherName = state.teachers.find(teacher => teacher.id === teacherId)?.name || "ce prof";
      if (!window.confirm(`Supprimer l'affectation ${compactClassName(schoolClass)} pour ${teacherName} ?`)) return;
      removeServiceAssignment(teacherId, schoolClass);
      showValidationPopup("Service théorique supprimé");
      render();
    });
  });
}
