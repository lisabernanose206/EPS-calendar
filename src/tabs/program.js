import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { activityProgramForClass, classesFromStandardConfig, normalizeSchoolClassId, saveActivityProgramByClass, saveActivityProgramByLevel } from "../services/settings-storage.js";
import { compactClassName } from "../ui/format.js";

export function renderActivityProgramSettings() {
  const standardClasses = classesFromStandardConfig();
  return `<section class="eventPage">
          <div class="eventList" style="grid-column:1 / -1">
            <h3>Programme annuel par niveau</h3>
            ${state.activities.length ? `<div class="facilityActivityMatrix">${state.classLevels.map(level => {
    const selectedIds = state.activityProgramByLevel[level] || [];
    const selectedActivities = selectedIds.map(id => state.activities.find(activity => activity.id === id)).filter(Boolean);
    const unselectedActivities = state.activities.filter(activity => !selectedIds.includes(activity.id)).sort((a, b) => a.label.localeCompare(b.label, "fr", {
      sensitivity: "base"
    }));
    return `<article class="facilityActivityRow">
                <strong>${level}</strong>
                ${selectedActivities.length ? `<div class="choiceGrid">${selectedActivities.map(activity => `
                  <button class="choiceButton active" data-program-activity-level="${level}" data-program-activity="${activity.id}">${activity.label}</button>
                `).join("")}</div>` : `<span class="muted">Aucune activité affectée a ce niveau.</span>`}
                ${unselectedActivities.length ? `<div class="choiceGrid">${unselectedActivities.map(activity => `
                  <button class="choiceButton" data-program-activity-level="${level}" data-program-activity="${activity.id}">${activity.label}</button>
                `).join("")}</div>` : ""}
              </article>`;
  }).join("")}</div>` : `<div class="alertEmpty">Ajoutez d'abord les activités dans Installations & activités.</div>`}
            ${state.activities.length ? `<h3 style="margin-top:16px">Programme spécifique par classe</h3>
            <p class="muted">Optionnel : renseignez uniquement les classes qui ne suivent pas exactement le programme de leur niveau.</p>
            <div class="facilityActivityMatrix">${standardClasses.map(schoolClass => {
    const selectedIds = state.activityProgramByClass[schoolClass] || [];
    const selectedActivities = selectedIds.map(id => state.activities.find(activity => activity.id === id)).filter(Boolean);
    const unselectedActivities = state.activities.filter(activity => !selectedIds.includes(activity.id)).sort((a, b) => a.label.localeCompare(b.label, "fr", {
      sensitivity: "base"
    }));
    const inheritedCount = activityProgramForClass(schoolClass).length;
    return `<article class="facilityActivityRow">
                <strong>${compactClassName(schoolClass)}</strong>
                ${selectedActivities.length ? `<div class="choiceGrid">${selectedActivities.map(activity => `
                  <button class="choiceButton active" data-program-class="${schoolClass}" data-program-activity="${activity.id}">${activity.label}</button>
                `).join("")}</div>` : `<span class="muted">Programme du niveau utilisé (${inheritedCount} activité(s)).</span>`}
                ${unselectedActivities.length ? `<div class="choiceGrid">${unselectedActivities.map(activity => `
                  <button class="choiceButton" data-program-class="${schoolClass}" data-program-activity="${activity.id}">${activity.label}</button>
                `).join("")}</div>` : ""}
              </article>`;
  }).join("")}</div>` : ""}
          </div>
        </section>`;
}
export function bindProgramEvents() {
  document.querySelectorAll("[data-program-activity]").forEach(button => {
    button.addEventListener("click", () => {
      const activityId = button.dataset.programActivity;
      const schoolClass = button.dataset.programClass;
      if (schoolClass) {
        const normalizedClass = normalizeSchoolClassId(schoolClass);
        if (!classesFromStandardConfig().includes(normalizedClass) || !state.activities.some(activity => activity.id === activityId)) return;
        const current = state.activityProgramByClass[normalizedClass] || [];
        const next = current.includes(activityId) ? current.filter(id => id !== activityId) : [...current, activityId];
        state.activityProgramByClass = {
          ...state.activityProgramByClass,
          [normalizedClass]: next
        };
        if (!next.length) delete state.activityProgramByClass[normalizedClass];
        saveActivityProgramByClass();
        render();
        return;
      }
      const level = button.dataset.programActivityLevel;
      if (!state.classLevels.includes(level) || !state.activities.some(activity => activity.id === activityId)) return;
      const current = state.activityProgramByLevel[level] || [];
      state.activityProgramByLevel = {
        ...state.activityProgramByLevel,
        [level]: current.includes(activityId) ? current.filter(id => id !== activityId) : [...current, activityId]
      };
      saveActivityProgramByLevel();
      render();
    });
  });
}
