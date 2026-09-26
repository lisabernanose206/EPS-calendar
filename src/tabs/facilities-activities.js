import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { activityAllowedForFacility } from "../domain/assignments.js";
import { attrValue } from "../domain/dates.js";
import { saveFacilityUnavailableFromForm } from "../domain/unavailability.js";
import { criticalCloudNotice } from "../services/cloud.js";
import { facilityLocationTypeLabel, facilityTypeLabel, normalizeActivityProgramByClass, normalizeActivityProgramByLevel, rebuildConstructionPlan, saveActivities, saveActivityProgramByClass, saveActivityProgramByLevel, saveFacilities, saveFacilityActivities, saveFacilityUnavailability, syncConstructionFacilityLabel } from "../services/settings-storage.js";
import { showValidationPopup } from "../ui/feedback.js";

export function facilityIdFromName(name) {
  const base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "installation";
  let id = base;
  let index = 2;
  while (state.facilities.some(facility => facility.id === id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}
export function activityIdFromName(name) {
  const base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "activite";
  let id = base;
  let index = 2;
  while (state.activities.some(activity => activity.id === id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}
export function renderFacilitiesSettings() {
  const canAddFacility = state.facilityDraftName.trim().length > 0 && Boolean(state.facilityDraftType) && Boolean(state.facilityDraftLocationType);
  return `<section class="eventPage">
          <div class="eventForm">
            <h3>Ajouter une installation</h3>
            <div class="eventField">
              <label>Nom</label>
              <input id="facilityDraftName" placeholder="Ex. Stade, Dojo, Gymnase municipal" value="${state.facilityDraftName}" />
            </div>
            <div class="eventField">
              <label>Position par rapport a l’établissement</label>
              <div class="choiceGrid">
                <button class="choiceButton ${state.facilityDraftType === "external" ? "active" : ""}" data-facility-type="external">Externe à l’établissement</button>
                <button class="choiceButton ${state.facilityDraftType === "internal" ? "active" : ""}" data-facility-type="internal">Interne à l’établissement</button>
              </div>
              ${state.facilityDraftType === "external" ? `<span class="muted">Votre installation est en dehors de votre Établissement.</span>` : ""}
            </div>
            <div class="eventField">
              <label>Lieu de pratique</label>
              <div class="choiceGrid">
                <button class="choiceButton ${state.facilityDraftLocationType === "outdoor" ? "active" : ""}" data-facility-location-type="outdoor">En extérieur</button>
                <button class="choiceButton ${state.facilityDraftLocationType === "indoor" ? "active" : ""}" data-facility-location-type="indoor">En intérieur</button>
              </div>
            </div>
            <div class="modalFooter">
              <button class="addButton" id="addFacility" ${canAddFacility ? "" : "disabled"}>Ajouter l'installation</button>
            </div>
          </div>
          <div class="eventList">
            <h3>Installations existantes</h3>
            ${state.facilities.length ? `<div class="compactCardGrid fiveCardGrid">${state.facilities.map(facility => `<article class="eventCard">
              <label class="eventField">
                <span>Nom</span>
                <input data-rename-facility="${facility.id}" value="${attrValue(facility.label)}" />
              </label>
              <span>${facilityTypeLabel(facility.type)}</span>
              <span>${facilityLocationTypeLabel(facility.locationType)}</span>
              <div class="choiceGrid">
                <button class="choiceButton ${facility.locationType === "outdoor" ? "active" : ""}" data-set-facility-location="${facility.id}" data-location-type="outdoor">Exterieur</button>
                <button class="choiceButton ${facility.locationType === "indoor" ? "active" : ""}" data-set-facility-location="${facility.id}" data-location-type="indoor">Interieur</button>
              </div>
              <button class="ghostButton" data-delete-facility="${facility.id}">Supprimer</button>
            </article>`).join("")}</div>` : `<div class="alertEmpty">Aucune installation ajoutée.</div>`}
          </div>
        </section>`;
}
export function renderActivitiesSettings() {
  const canAddActivity = state.activityDraftName.trim().length > 0;
  return `<section class="eventPage">
          <div class="eventForm">
            <h3>Ajouter une activité</h3>
            <div class="eventField">
              <label>Nom</label>
              <input id="activityDraftName" placeholder="Ex. Badminton, Boxe, Natation" value="${state.activityDraftName}" />
            </div>
            <div class="modalFooter">
              <button class="addButton" id="addActivity" ${canAddActivity ? "" : "disabled"}>Ajouter l'activité</button>
            </div>
          </div>
          <div class="eventList">
            <h3>Activités existantes</h3>
            ${state.activities.length ? `<div class="compactCardGrid compactActivityGrid">${state.activities.map(activity => `<article class="eventCard">
              <strong>${activity.label}</strong>
              <button class="ghostButton" data-delete-activity="${activity.id}">Supprimer</button>
            </article>`).join("")}</div>` : `<div class="alertEmpty">Aucune activité ajoutée.</div>`}
          </div>
        </section>`;
}
export function renderFacilityActivityLinks() {
  if (!state.facilities.length || !state.activities.length) {
    return `<section class="eventList facilityActivityLinksPanel">
            <h3>Activités possibles par installation</h3>
            ${criticalCloudNotice("Liens installations/activités")}
            <div class="alertEmpty">Ajoutez au moins une installation et une activité pour définir les activités possibles.</div>
          </section>`;
  }
  return `<section class="eventList facilityActivityLinksPanel">
          <h3>Activités possibles par installation</h3>
          ${criticalCloudNotice("Liens installations/activités")}
          <div class="facilityActivityMatrix">${state.facilities.map(facility => {
    const linked = state.facilityActivities[facility.id] || [];
    const linkedActivities = linked.map(id => state.activities.find(activity => activity.id === id)).filter(Boolean);
    const unlinkedActivities = state.activities.filter(activity => !linked.includes(activity.id)).sort((a, b) => a.label.localeCompare(b.label, "fr", {
      sensitivity: "base"
    }));
    return `<article class="facilityActivityRow">
              <strong>${facility.label}</strong>
              ${linkedActivities.length ? `<div class="facilityActivityOrdered">${linkedActivities.map((activity, index) => `
                <div class="facilityActivityOrderedItem">
                  <span class="facilityActivityRank">${index + 1}</span>
                  <strong>${activity.label}</strong>
                  <button class="ghostButton" data-move-facility-activity="${facility.id}" data-activity-id="${activity.id}" data-direction="up" ${index === 0 ? "disabled" : ""}>↑</button>
                  <button class="ghostButton" data-move-facility-activity="${facility.id}" data-activity-id="${activity.id}" data-direction="down" ${index === linkedActivities.length - 1 ? "disabled" : ""}>↓</button>
                  <button class="ghostButton" data-toggle-facility-activity="${facility.id}" data-activity-id="${activity.id}">Retirer</button>
                </div>
              `).join("")}</div>` : `<span class="muted">Aucune activité priorisée pour cette installation.</span>`}
              ${unlinkedActivities.length ? `<div class="choiceGrid">${unlinkedActivities.map(activity => `
                <button class="choiceButton" data-toggle-facility-activity="${facility.id}" data-activity-id="${activity.id}">${activity.label}</button>
              `).join("")}</div>` : ""}
            </article>`;
  }).join("")}</div>
        </section>`;
}
export function renderFacilitiesActivitiesSettings() {
  const canAddFacility = state.facilityDraftName.trim().length > 0 && Boolean(state.facilityDraftType) && Boolean(state.facilityDraftLocationType);
  const canAddActivity = state.activityDraftName.trim().length > 0;
  return `<section class="eventPage">
          <div class="eventForm">
            <h3>Ajouter une installation</h3>
            <div class="eventField">
              <label>Nom</label>
              <input id="facilityDraftName" placeholder="Ex. Stade, Dojo, Gymnase municipal" value="${state.facilityDraftName}" />
            </div>
            <div class="eventField">
              <label>Position par rapport a l’établissement</label>
              <div class="choiceGrid">
                <button class="choiceButton ${state.facilityDraftType === "external" ? "active" : ""}" data-facility-type="external">Externe à l’établissement</button>
                <button class="choiceButton ${state.facilityDraftType === "internal" ? "active" : ""}" data-facility-type="internal">Interne à l’établissement</button>
              </div>
              ${state.facilityDraftType === "external" ? `<span class="muted">Votre installation est en dehors de votre Établissement.</span>` : ""}
            </div>
            <div class="eventField">
              <label>Lieu de pratique</label>
              <div class="choiceGrid">
                <button class="choiceButton ${state.facilityDraftLocationType === "outdoor" ? "active" : ""}" data-facility-location-type="outdoor">En extérieur</button>
                <button class="choiceButton ${state.facilityDraftLocationType === "indoor" ? "active" : ""}" data-facility-location-type="indoor">En intérieur</button>
              </div>
            </div>
            <div class="modalFooter">
              <button class="addButton" id="addFacility" ${canAddFacility ? "" : "disabled"}>Ajouter l'installation</button>
            </div>
          </div>
          <div class="eventList">
            <h3>Installations existantes</h3>
            ${state.facilities.length ? `<div class="compactCardGrid fiveCardGrid">${state.facilities.map(facility => `<article class="eventCard">
              <label class="eventField">
                <span>Nom</span>
                <input data-rename-facility="${facility.id}" value="${attrValue(facility.label)}" />
              </label>
              <span>${facilityTypeLabel(facility.type)}</span>
              <span>${facilityLocationTypeLabel(facility.locationType)}</span>
              <div class="choiceGrid">
                <button class="choiceButton ${facility.locationType === "outdoor" ? "active" : ""}" data-set-facility-location="${facility.id}" data-location-type="outdoor">Exterieur</button>
                <button class="choiceButton ${facility.locationType === "indoor" ? "active" : ""}" data-set-facility-location="${facility.id}" data-location-type="indoor">Interieur</button>
              </div>
              <button class="ghostButton" data-delete-facility="${facility.id}">Supprimer</button>
            </article>`).join("")}</div>` : `<div class="alertEmpty">Aucune installation ajoutée.</div>`}
          </div>
          <div class="eventForm">
            <h3>Ajouter une activité</h3>
            <div class="eventField">
              <label>Nom</label>
              <input id="activityDraftName" placeholder="Ex. Badminton, Boxe, Natation" value="${state.activityDraftName}" />
            </div>
            <div class="modalFooter">
              <button class="addButton" id="addActivity" ${canAddActivity ? "" : "disabled"}>Ajouter l'activité</button>
            </div>
          </div>
          <div class="eventList">
            <h3>Activités existantes</h3>
            ${state.activities.length ? `<div class="compactCardGrid compactActivityGrid">${state.activities.map(activity => `<article class="eventCard">
              <strong>${activity.label}</strong>
              <button class="ghostButton" data-delete-activity="${activity.id}">Supprimer</button>
            </article>`).join("")}</div>` : `<div class="alertEmpty">Aucune activité ajoutée.</div>`}
          </div>
          ${renderFacilityActivityLinks()}
        </section>`;
}
export function bindFacilitiesActivitiesEvents() {
  document.querySelectorAll("[data-rename-facility]").forEach(input => {
    const saveRename = () => {
      const facility = state.facilities.find(item => item.id === input.dataset.renameFacility);
      if (!facility) return;
      const label = input.value.trim();
      if (!label) {
        input.value = facility.label;
        return;
      }
      if (label === facility.label) return;
      state.facilities = state.facilities.map(item => item.id === facility.id ? {
        ...item,
        label
      } : item);
      syncConstructionFacilityLabel(facility.id, label);
      saveFacilities();
      rebuildConstructionPlan();
      showValidationPopup("Installation renommée");
      render();
    };
    input.addEventListener("change", saveRename);
    input.addEventListener("blur", saveRename);
  });
  document.querySelectorAll("[data-delete-facility]").forEach(button => {
    button.addEventListener("click", () => {
      state.facilities = state.facilities.filter(facility => facility.id !== button.dataset.deleteFacility);
      delete state.facilityActivities[button.dataset.deleteFacility];
      if (!state.facilities.some(facility => facility.id === state.blockFacilityId)) state.blockFacilityId = "";
      state.cycleFacilityIds = state.cycleFacilityIds.filter(id => state.facilities.some(facility => facility.id === id));
      state.unavailableFacilityIds = state.unavailableFacilityIds.filter(id => state.facilities.some(facility => facility.id === id));
      state.facilityUnavailability = state.facilityUnavailability.map(item => ({
        ...item,
        facilityIds: (item.facilityIds || []).filter(id => state.facilities.some(facility => facility.id === id))
      })).filter(item => {
        const itemType = item.type || ((item.classIds || []).length ? "class" : "facility");
        return itemType !== "facility" || (item.facilityIds || []).length;
      });
      saveFacilities();
      saveFacilityActivities();
      saveFacilityUnavailability();
      showValidationPopup("Installation supprimée");
      render();
    });
  });
  document.querySelectorAll("[data-delete-activity]").forEach(button => {
    button.addEventListener("click", () => {
      const deletedId = button.dataset.deleteActivity;
      state.activities = state.activities.filter(activity => activity.id !== deletedId);
      state.activityProgramByLevel = normalizeActivityProgramByLevel(state.activityProgramByLevel);
      state.activityProgramByClass = normalizeActivityProgramByClass(state.activityProgramByClass);
      state.facilityActivities = Object.fromEntries(Object.entries(state.facilityActivities).map(([facilityId, ids]) => [facilityId, Array.isArray(ids) ? ids.filter(id => id !== deletedId) : []]));
      if (state.blockActivityId === deletedId) state.blockActivityId = "";
      state.constructionRules = state.constructionRules.map(rule => rule.block?.activityId === deletedId ? {
        ...rule,
        block: {
          ...rule.block,
          activityId: "",
          activityLabel: ""
        }
      } : rule);
      saveActivities();
      saveActivityProgramByLevel();
      saveActivityProgramByClass();
      saveFacilityActivities();
      rebuildConstructionPlan();
      showValidationPopup("Activité supprimée");
      render();
    });
  });
  document.querySelectorAll("[data-toggle-facility-activity]").forEach(button => {
    button.addEventListener("click", () => {
      const facilityId = button.dataset.toggleFacilityActivity;
      const activityId = button.dataset.activityId;
      const current = state.facilityActivities[facilityId] || [];
      state.facilityActivities = {
        ...state.facilityActivities,
        [facilityId]: current.includes(activityId) ? current.filter(id => id !== activityId) : [...current, activityId]
      };
      if (state.blockFacilityId === facilityId && state.blockActivityId && !activityAllowedForFacility(facilityId, state.blockActivityId)) state.blockActivityId = "";
      saveFacilityActivities();
      render();
    });
  });
  const facilityDraftNameInput = document.getElementById("facilityDraftName");
  if (facilityDraftNameInput) facilityDraftNameInput.addEventListener("input", () => state.facilityDraftName = facilityDraftNameInput.value);
  const activityDraftNameInput = document.getElementById("activityDraftName");
  if (activityDraftNameInput) activityDraftNameInput.addEventListener("input", () => {
    state.activityDraftName = activityDraftNameInput.value;
    const addActivity = document.getElementById("addActivity");
    if (addActivity) addActivity.disabled = state.activityDraftName.trim().length === 0;
  });
  document.querySelectorAll("[data-facility-type]").forEach(button => {
    button.addEventListener("click", () => {
      state.facilityDraftType = button.dataset.facilityType;
      render();
    });
  });
  document.querySelectorAll("[data-facility-location-type]").forEach(button => {
    button.addEventListener("click", () => {
      state.facilityDraftLocationType = button.dataset.facilityLocationType;
      render();
    });
  });
  document.querySelectorAll("[data-set-facility-location]").forEach(button => {
    button.addEventListener("click", () => {
      const facilityId = button.dataset.setFacilityLocation;
      const locationType = button.dataset.locationType;
      if (!["outdoor", "indoor"].includes(locationType)) return;
      state.facilities = state.facilities.map(facility => facility.id === facilityId ? {
        ...facility,
        locationType
      } : facility);
      saveFacilities();
      render();
    });
  });
  const addFacility = document.getElementById("addFacility");
  if (addFacility) {
    addFacility.addEventListener("click", () => {
      const label = state.facilityDraftName.trim();
      if (!label || !state.facilityDraftType || !state.facilityDraftLocationType) return;
      const facility = {
        id: facilityIdFromName(label),
        label,
        type: state.facilityDraftType,
        locationType: state.facilityDraftLocationType
      };
      state.facilities = [...state.facilities, facility];
      state.facilityActivities = {
        ...state.facilityActivities,
        [facility.id]: []
      };
      state.cycleFacilityIds = [...state.cycleFacilityIds, facility.id];
      state.facilityDraftName = "";
      state.facilityDraftType = "";
      state.facilityDraftLocationType = "";
      saveFacilities();
      saveFacilityActivities();
      showValidationPopup("Installation validée");
      render();
    });
  }
  const addActivity = document.getElementById("addActivity");
  if (addActivity) {
    addActivity.addEventListener("click", () => {
      const label = state.activityDraftName.trim();
      if (!label) return;
      state.activities = [...state.activities, {
        id: activityIdFromName(label),
        label
      }];
      state.activityDraftName = "";
      saveActivities();
      showValidationPopup("Activité validée");
      render();
    });
  }
  document.querySelectorAll("[data-move-facility-activity]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const facilityId = button.dataset.moveFacilityActivity;
      const activityId = button.dataset.activityId;
      const direction = button.dataset.direction;
      const current = [...(state.facilityActivities[facilityId] || [])];
      const index = current.indexOf(activityId);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
      [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
      state.facilityActivities = {
        ...state.facilityActivities,
        [facilityId]: current
      };
      saveFacilityActivities();
      render();
    });
  });
  const addFacilityUnavailable = document.getElementById("addFacilityUnavailable");
  if (addFacilityUnavailable) {
    addFacilityUnavailable.addEventListener("click", () => {
      const hasTime = state.unavailableCells.length;
      if (!hasTime) return;
      if (state.unavailablePeriodMode === "cycles" && !state.unavailableCycleIds.length) return;
      if (state.unavailableType === "facility" && !state.unavailableFacilityIds.length) return;
      if (state.unavailableType === "class" && !state.unavailableClassIds.length) return;
      if (state.unavailableType === "teacher" && !state.unavailableTeacherIds.length) return;
      const message = state.editingUnavailableId ? "Contrainte modifiée" : "Contrainte validée";
      saveFacilityUnavailableFromForm();
      showValidationPopup(message);
      render();
    });
  }
}
