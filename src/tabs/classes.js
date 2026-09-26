import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { schoolClassLabel } from "../domain/assignments.js";
import { criticalCloudNotice } from "../services/cloud.js";
import { classesFromStandardConfig, generatedClassLabels, importClassesFromCsvText, saveClassConfig, specialClassBaseIdFromSchoolId, specialClassBaseIds, specialClassBaseLabel, specialClassSlug, specialClassTypeIdFromSchoolId, specialClasses } from "../services/settings-storage.js";
import { showValidationPopup } from "../ui/feedback.js";
import { compactClassName } from "../ui/format.js";

export function renderClassesView() {
  const standardClasses = classesFromStandardConfig();
  const canAddSpecialClass = Boolean(state.specialClassDraftName.trim() && state.specialClassDraftBaseIds.length);
  const classCloudNotice = criticalCloudNotice("Modifications de classes");
  return `<section class="eventPage">
          <div class="eventForm">
            <h3>Classes</h3>
            <p class="muted">Définissez les classes de l'établissement. Elles sont utilisées dans Construction, Service, Indisponibilités et Événements sportifs.</p>
            ${classCloudNotice}
          </div>
          <div class="eventList">
            <h3>Classes existantes</h3>
            <div class="classImportBox">
              <label>Importer depuis Pronote
                <input id="classCsvImport" type="file" accept=".csv,text/csv,text/plain" />
              </label>
              <span class="muted">Le CSV est lu sur votre ordinateur. Les classes détectées remplacent la liste actuelle.</span>
            </div>
            <div class="classConfigGrid">${state.classLevels.map(level => {
    const config = state.classConfig[level];
    return `<article class="classConfigCard">
                <h4>${level}</h4>
                <div class="classConfigControls">
                  <label>Nombre
                    <input type="number" min="0" max="99" value="${config.labels.length}" data-class-count="${level}" />
                  </label>
                  <label>Format
                    <select data-class-mode="${level}">
                      <option value="number" ${config.mode === "number" ? "selected" : ""}>1, 2, 3</option>
                      <option value="letter" ${config.mode === "letter" ? "selected" : ""}>A, B, C</option>
                    </select>
                  </label>
                </div>
                <div class="classConfigPills">${config.labels.length ? config.labels.map(label => `<span class="classConfigPill">${compactClassName(schoolClassLabel(level, label))}<button data-remove-class-label="${level}" data-class-label="${label}" title="Supprimer cette classe">x</button></span>`).join("") : `<span class="muted">Aucune classe définie.</span>`}</div>
                <button class="ghostButton" data-add-class-label="${level}">Ajouter une classe</button>
              </article>`;
  }).join("")}</div>
            <div class="specialClassPanel">
              <h3>Classes à besoin spécifique</h3>
              <div class="specialClassForm">
                <input id="specialClassName" value="${state.specialClassDraftName}" placeholder="Ex. Segpa, Ulysse, Dispositif..." />
                <div class="choiceGrid">
                  ${standardClasses.map(schoolClass => `<button class="choiceButton ${state.specialClassDraftBaseIds.includes(schoolClass) ? "active" : ""}" data-special-class-draft-base="${schoolClass}">${compactClassName(schoolClass)}</button>`).join("")}
                </div>
                <button class="ghostButton" id="addSpecialClass" ${canAddSpecialClass ? "" : "disabled"}>Valider</button>
              </div>
              <div class="cycleList">${specialClasses().length ? specialClasses().map(item => {
    const baseClassIds = specialClassBaseIds(item);
    return `<div class="cycleRow">
                <label>${item.label}</label>
                <div class="choiceGrid">
                  ${standardClasses.map(schoolClass => `<button class="choiceButton ${baseClassIds.includes(schoolClass) ? "active" : ""}" data-special-class-base="${item.id}" data-special-class-value="${schoolClass}">${compactClassName(schoolClass)}</button>`).join("")}
                </div>
                <span class="muted">${specialClassBaseLabel(item)}</span>
                <button class="ghostButton" data-remove-special-class="${item.id}" title="Supprimer cette classe">Supprimer</button>
              </div>`;
  }).join("") : `<span class="muted">Aucune classe spécifique définie.</span>`}</div>
            </div>
          </div>
        </section>`;
}
export function bindClassesEvents() {
  document.querySelectorAll("[data-service-special-hours]").forEach(input => {
    input.addEventListener("change", () => {
      const schoolClass = input.dataset.serviceSpecialHours;
      const id = specialClassTypeIdFromSchoolId(schoolClass);
      const baseClassId = specialClassBaseIdFromSchoolId(schoolClass);
      const hours = Math.max(0, Number(input.value) || 0);
      state.classConfig = {
        ...state.classConfig,
        specialClasses: specialClasses().map(item => {
          if (item.id !== id) return item;
          if (!baseClassId) return {
            ...item,
            hours
          };
          return {
            ...item,
            hoursByClass: {
              ...(item.hoursByClass || {}),
              [baseClassId]: hours
            }
          };
        })
      };
      saveClassConfig();
      render();
    });
  });
  document.querySelectorAll("[data-class-count]").forEach(input => {
    input.addEventListener("change", () => {
      const level = input.dataset.classCount;
      const mode = state.classConfig[level]?.mode || "number";
      const previousCount = state.classConfig[level]?.labels.length || 0;
      const nextCount = Math.min(99, Math.max(0, Number(input.value) || 0));
      state.classConfig = {
        ...state.classConfig,
        [level]: {
          mode,
          labels: generatedClassLabels(mode, nextCount)
        }
      };
      saveClassConfig();
      if (nextCount > previousCount) showValidationPopup("Classes ajoutées");else if (nextCount < previousCount) showValidationPopup("Classes supprimées");else showValidationPopup("Classes mises à jour");
      render();
    });
  });
  document.querySelectorAll("[data-class-mode]").forEach(select => {
    select.addEventListener("change", () => {
      const level = select.dataset.classMode;
      const mode = select.value === "letter" ? "letter" : "number";
      state.classConfig = {
        ...state.classConfig,
        [level]: {
          mode,
          labels: generatedClassLabels(mode, state.classConfig[level]?.labels.length || 0)
        }
      };
      saveClassConfig();
      render();
    });
  });
  document.querySelectorAll("[data-add-class-label]").forEach(button => {
    button.addEventListener("click", () => {
      const level = button.dataset.addClassLabel;
      const current = state.classConfig[level] || state.defaultClassConfig[level];
      state.classConfig = {
        ...state.classConfig,
        [level]: {
          ...current,
          labels: generatedClassLabels(current.mode, current.labels.length + 1)
        }
      };
      saveClassConfig();
      showValidationPopup("Classe validée");
      render();
    });
  });
  document.querySelectorAll("[data-remove-class-label]").forEach(button => {
    button.addEventListener("click", () => {
      const level = button.dataset.removeClassLabel;
      const label = button.dataset.classLabel;
      const current = state.classConfig[level] || state.defaultClassConfig[level];
      if (!window.confirm(`Supprimer la classe ${compactClassName(schoolClassLabel(level, label))} ?`)) return;
      state.classConfig = {
        ...state.classConfig,
        [level]: {
          ...current,
          labels: current.labels.filter(item => item !== label)
        }
      };
      saveClassConfig();
      showValidationPopup("Classe supprimée");
      render();
    });
  });
  const specialClassNameInput = document.getElementById("specialClassName");
  if (specialClassNameInput) {
    specialClassNameInput.addEventListener("input", () => {
      state.specialClassDraftName = specialClassNameInput.value;
      const addButton = document.getElementById("addSpecialClass");
      if (addButton) addButton.disabled = !state.specialClassDraftName.trim() || !state.specialClassDraftBaseIds.length;
    });
  }
  const addSpecialClassButton = document.getElementById("addSpecialClass");
  if (addSpecialClassButton && specialClassNameInput) {
    addSpecialClassButton.addEventListener("click", () => {
      const label = state.specialClassDraftName.trim();
      if (!label || !state.specialClassDraftBaseIds.length) return;
      const baseId = specialClassSlug(label);
      const existingIds = specialClasses().map(item => item.id);
      let id = baseId;
      let suffix = 2;
      while (existingIds.includes(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      state.classConfig = {
        ...state.classConfig,
        specialClasses: [...specialClasses(), {
          id,
          label,
          baseClassIds: [...state.specialClassDraftBaseIds],
          hours: 0,
          hoursByClass: {}
        }]
      };
      state.specialClassDraftName = "";
      state.specialClassDraftBaseIds = [];
      saveClassConfig();
      showValidationPopup("Classe specifique ajoutee");
      render();
    });
  }
  document.querySelectorAll("[data-special-class-draft-base]").forEach(button => {
    button.addEventListener("click", () => {
      const baseClassId = button.dataset.specialClassDraftBase;
      state.specialClassDraftBaseIds = state.specialClassDraftBaseIds.includes(baseClassId) ? state.specialClassDraftBaseIds.filter(schoolClass => schoolClass !== baseClassId) : [...state.specialClassDraftBaseIds, baseClassId];
      render();
    });
  });
  document.querySelectorAll("[data-special-class-base]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.specialClassBase;
      const baseClassId = button.dataset.specialClassValue;
      state.classConfig = {
        ...state.classConfig,
        specialClasses: specialClasses().map(item => {
          if (item.id !== id) return item;
          const baseClassIds = specialClassBaseIds(item);
          const nextBaseClassIds = baseClassIds.includes(baseClassId) ? baseClassIds.filter(schoolClass => schoolClass !== baseClassId) : [...baseClassIds, baseClassId];
          return {
            ...item,
            baseClassIds: nextBaseClassIds
          };
        })
      };
      saveClassConfig();
      showValidationPopup("Rattachements mis à jour");
      render();
    });
  });
  document.querySelectorAll("[data-remove-special-class]").forEach(button => {
    button.addEventListener("click", () => {
      const item = specialClasses().find(specialClass => specialClass.id === button.dataset.removeSpecialClass);
      if (!item) return;
      if (!window.confirm(`Supprimer la classe ${item.label} ?`)) return;
      state.classConfig = {
        ...state.classConfig,
        specialClasses: specialClasses().filter(specialClass => specialClass.id !== item.id)
      };
      saveClassConfig();
      showValidationPopup("Classe specifique supprimee");
      render();
    });
  });
  const classCsvImport = document.getElementById("classCsvImport");
  if (classCsvImport) {
    classCsvImport.addEventListener("change", async () => {
      const file = classCsvImport.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const total = importClassesFromCsvText(text);
        showValidationPopup(`${total} classe(s) importée(s) depuis Pronote`);
        render();
      } catch (error) {
        showValidationPopup(`Import CSV impossible : ${error.message || "fichier non reconnu"}`, "error");
        classCsvImport.value = "";
      }
    });
  }
}
