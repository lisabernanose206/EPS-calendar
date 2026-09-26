import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { activeCycles, setCycleCount } from "../domain/cycles.js";
import { activeSchoolZone, attrValue } from "../domain/dates.js";
import { isCollegeEstablishment, normalizedEstablishmentType } from "../domain/settings.js";
import { currentEtabDisplayName } from "../services/auth.js";
import { applyEstablishmentTypeChange, makeSlotId, saveSchoolSlotsAndRender } from "../services/settings-storage.js";
import { showValidationPopup } from "../ui/feedback.js";

export function renderEstablishmentSettings() {
  return `<section class="eventPage">
          <div class="eventForm">
            <h3>Établissement</h3>
            <p class="muted">Paramétrez les horaires utilisés dans les cours, les indisponibilités, les événements et les AS en indiquant simplement l'heure de début et l'heure de fin.</p>
            <div class="eventField">
              <label>Renommer l'établissement</label>
              <input id="establishmentName" value="${attrValue(currentEtabDisplayName() || state.schoolConstraints.establishmentName)}" placeholder="Ex. Lycée Jacques Vaucanson" />
              <span class="muted">Ce nom est enregistré dans Supabase pour l'établissement actif.</span>
            </div>
            <div class="eventField">
              <label>Type d’établissement</label>
              <select id="establishmentType">
                <option value="collège" ${normalizedEstablishmentType(state.schoolConstraints.establishmentType) === "collège" ? "selected" : ""}>Collège</option>
                <option value="lycée" ${normalizedEstablishmentType(state.schoolConstraints.establishmentType) === "lycée" ? "selected" : ""}>Lycée</option>
              </select>
              <span class="muted">Changer de type réinitialise les classes et les données qui en dépendent.</span>
            </div>
            <div class="eventField">
              <label>Zone scolaire</label>
              <div class="choiceGrid">
                ${["A", "B", "C"].map(zone => `<button class="choiceButton ${activeSchoolZone() === zone ? "active" : ""}" data-school-zone="${zone}">Zone ${zone}</button>`).join("")}
              </div>
              <span class="muted">Changer la zone met automatiquement a jour les vacances scolaires dans les calendriers.</span>
            </div>
          </div>
          <div class="eventList">
            <div class="establishmentSlotsGrid">
              <section class="establishmentSlotColumn">
                <h4>Créneaux de cours</h4>
                <div class="cycleList">
                  ${state.slots.map((slot, index) => `<div class="cycleRow schoolSlotGrid">
                    <label>Cours ${index + 1}</label>
                    <input data-course-slot-start="${slot.id}" type="time" value="${slot.startTime}" aria-label="Heure de début" />
                    <input data-course-slot-end="${slot.id}" type="time" value="${slot.endTime}" aria-label="Heure de fin" />
                    <button class="ghostButton" data-delete-course-slot="${slot.id}" ${state.slots.length <= 1 ? "disabled" : ""}>Supprimer</button>
                  </div>`).join("")}
                </div>
                <button class="ghostButton" id="addCourseSlot">Ajouter un créneau de cours</button>
              </section>
              <section class="establishmentSlotColumn">
                <h3>Créneaux AS</h3>
                <div class="cycleList">
                  ${(state.schoolConstraints.asSlots || []).map((slot, index) => `<div class="cycleRow">
                    <label>AS ${index + 1}</label>
                    <div class="asSlotGrid">
                      <input data-as-slot-start="${index}" type="time" value="${slot.startTime}" aria-label="Heure de début AS" />
                      <input data-as-slot-end="${index}" type="time" value="${slot.endTime}" aria-label="Heure de fin AS" />
                      <div class="asSlotDays">${state.days.map(day => `<button class="choiceButton ${(slot.days || []).includes(day) ? "active" : ""}" data-as-slot-day="${index}" data-day="${day}">${day}</button>`).join("")}</div>
                    </div>
                    <button class="ghostButton asSlotDelete" data-delete-as-slot="${index}" ${(state.schoolConstraints.asSlots || []).length <= 1 ? "disabled" : ""}>Supprimer</button>
                  </div>`).join("")}
                </div>
                <button class="ghostButton" id="addAsSlot">Ajouter un créneau AS</button>
              </section>
            </div>
          </div>
        </section>`;
}
export function bindEstablishmentEvents() {
  const establishmentTypeSelect = document.getElementById("establishmentType");
  if (establishmentTypeSelect) {
    establishmentTypeSelect.addEventListener("change", () => {
      const previousType = normalizedEstablishmentType(state.schoolConstraints.establishmentType);
      const nextType = normalizedEstablishmentType(establishmentTypeSelect.value);
      if (nextType === previousType) return;
      const confirmed = window.confirm(`Changer le type d'établissement vers ${nextType === "lycée" ? "Lycée" : "Collège"} va réinitialiser les classes, le service et la construction. Continuer ?`);
      if (!confirmed) {
        establishmentTypeSelect.value = previousType;
        return;
      }
      applyEstablishmentTypeChange(nextType);
      showValidationPopup(`${nextType === "lycée" ? "Lycée" : "Collège"} appliqué : classes réinitialisées.`);
      render();
    });
  }
  document.querySelectorAll("[data-school-zone]").forEach(button => {
    button.addEventListener("click", () => {
      const zone = button.dataset.schoolZone;
      if (!["A", "B", "C"].includes(zone)) return;
      state.schoolConstraints = {
        ...state.schoolConstraints,
        schoolZone: zone
      };
      saveSchoolSlotsAndRender(`Zone scolaire ${zone} appliquee`);
    });
  });
  document.querySelectorAll("[data-course-slot-start], [data-course-slot-end]").forEach(input => {
    input.addEventListener("change", () => {
      const id = input.dataset.courseSlotStart || input.dataset.courseSlotEnd;
      const field = input.dataset.courseSlotStart ? "startTime" : "endTime";
      state.schoolConstraints = {
        ...state.schoolConstraints,
        courseSlots: state.schoolConstraints.courseSlots.map(slot => slot.id === id ? {
          ...slot,
          [field]: input.value
        } : slot)
      };
      saveSchoolSlotsAndRender();
    });
  });
  const addCourseSlot = document.getElementById("addCourseSlot");
  if (addCourseSlot) {
    addCourseSlot.addEventListener("click", () => {
      const id = makeSlotId("slot", state.schoolConstraints.courseSlots.map(slot => slot.id));
      state.schoolConstraints = {
        ...state.schoolConstraints,
        courseSlots: [...state.schoolConstraints.courseSlots, {
          id,
          startTime: "16:30",
          endTime: "17:30",
          label: "16h30-17h30",
          hours: 1
        }]
      };
      saveSchoolSlotsAndRender("Créneau de cours ajouté");
    });
  }
  document.querySelectorAll("[data-delete-course-slot]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteCourseSlot;
      if (state.schoolConstraints.courseSlots.length <= 1) return;
      state.schoolConstraints = {
        ...state.schoolConstraints,
        courseSlots: state.schoolConstraints.courseSlots.filter(slot => slot.id !== id)
      };
      saveSchoolSlotsAndRender("Créneau de cours supprimé");
    });
  });
  document.querySelectorAll("[data-delete-as-slot]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.deleteAsSlot);
      if ((state.schoolConstraints.asSlots || []).length <= 1) return;
      state.schoolConstraints = {
        ...state.schoolConstraints,
        asSlots: (state.schoolConstraints.asSlots || []).filter((_, slotIndex) => slotIndex !== index)
      };
      saveSchoolSlotsAndRender("Créneau AS supprimé");
    });
  });
  const cycleCountInput = document.getElementById("cycleCount");
  if (cycleCountInput) {
    cycleCountInput.addEventListener("change", () => {
      const previousCount = activeCycles().length;
      setCycleCount(cycleCountInput.value);
      const nextCount = activeCycles().length;
      if (nextCount > previousCount) showValidationPopup(isCollegeEstablishment() ? "P\u00e9riode ajout\u00e9e" : "Cycle ajout\u00e9");else if (nextCount < previousCount) showValidationPopup(isCollegeEstablishment() ? "P\u00e9riode supprim\u00e9e" : "Cycle supprim\u00e9");else showValidationPopup(isCollegeEstablishment() ? "P\u00e9riodes mises \u00e0 jour" : "Cycles mis \u00e0 jour");
      render();
    });
  }
  document.querySelectorAll("[data-as-slot-start], [data-as-slot-end]").forEach(input => {
    input.addEventListener("change", () => {
      const index = Number(input.dataset.asSlotStart || input.dataset.asSlotEnd);
      const field = input.dataset.asSlotStart ? "startTime" : "endTime";
      state.schoolConstraints = {
        ...state.schoolConstraints,
        asSlots: (state.schoolConstraints.asSlots || []).map((slot, slotIndex) => slotIndex === index ? {
          ...slot,
          [field]: input.value
        } : slot)
      };
      saveSchoolSlotsAndRender();
    });
  });
  document.querySelectorAll("[data-as-slot-day]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.asSlotDay);
      const day = button.dataset.day;
      state.schoolConstraints = {
        ...state.schoolConstraints,
        asSlots: (state.schoolConstraints.asSlots || []).map((slot, slotIndex) => {
          if (slotIndex !== index) return slot;
          const currentDays = slot.days || [];
          const nextDays = currentDays.includes(day) ? currentDays.filter(item => item !== day) : [...currentDays, day];
          return {
            ...slot,
            days: nextDays.length ? nextDays : currentDays
          };
        })
      };
      saveSchoolSlotsAndRender();
    });
  });
}
