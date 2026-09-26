import { state } from "../app/state.js";
import { activitiesForFacility, activityAllowedForBuildBlock, blockClassLabel, blockCycleConflictMessage, blockCycleUnavailableMessage, blockDetailLabel, blockTeacherStyle, buildModalAvailability, classCollectionHasOverlap, classGroupVariant, classGroupVariants, classParts, classSameBase, classesForBlock, currentBlock, facilityHasActivityForBlockProgram, optionBlockAvailableForTeachers, optionBlockUnavailableReason, optionDurationMax, parseYearCellKey, programActivityIdsForBlock, renderFixedBlockContext, serviceAllowsClassForTeacher, serviceClassRestrictionMessage, serviceFreeActivities, serviceFreeOptionById, serviceFreeOptionsForTeachers, teacherClassForBlock } from "../domain/assignments.js";
import { schoolYearWeeks, yearRows } from "../domain/dates.js";
import { asBlockLabel, asSessionStyle, asSessionTeacherLabel, asSessionsForCell, eventTeacherDots, eventsForPeriod } from "../domain/events.js";
import { cycleForWeek } from "../domain/hours.js";
import { cycleLabel, displayCycleName, isCollegeEstablishment } from "../domain/settings.js";
import { blockUnavailableMessage, unavailableTeachersForCycleSpan } from "../domain/unavailability.js";
import { baseClassFromGroupedClass, constructionClassChoicesForLevel, constructionCycleForBlockById, constructionCycleForRuleById, normalizedOptionCycleIds, optionCycleChoices } from "../services/settings-storage.js";
import { classSelectionButtonClass, compactClassName, constructionClassChoiceLabel, eventClassSummary } from "./format.js";

export function renderBuildModal() {
  const {
    rowId,
    weekRank
  } = parseYearCellKey(state.activeBuildCell);
  const row = yearRows().find(item => item.id === rowId);
  const weekItem = schoolYearWeeks().find(item => item.rank === weekRank);
  const block = currentBlock();
  const blockLevel = classParts(block.schoolClass).level;
  const editingCycleDetails = state.constructionBuildMode === "cycleDetails" && Boolean(state.editingBuildBlock?.ruleId);
  const editingRule = state.editingBuildBlock?.ruleId ? state.constructionRules.find(rule => rule.id === state.editingBuildBlock.ruleId) : null;
  const cellCycle = state.activeBuildCycleId ? editingRule ? constructionCycleForRuleById(editingRule, state.activeBuildCycleId) : constructionCycleForBlockById(block, state.activeBuildCycleId) : cycleForWeek(weekItem, blockLevel);
  const selectedClass = classParts(state.blockClass);
  const occupied = buildModalAvailability();
  const cycleUnavailableTeacherIds = cellCycle ? unavailableTeachersForCycleSpan(row, cellCycle, state.blockWeekLetter) : new Set();
  const selectedClassUnavailable = classesForBlock(block).some(schoolClass => classCollectionHasOverlap(occupied.classes, schoolClass) || classCollectionHasOverlap(occupied.unavailableClasses, schoolClass)) || state.blockTeacherIds.some(teacherId => {
    const schoolClass = teacherClassForBlock(block, teacherId);
    return schoolClass && !serviceAllowsClassForTeacher(teacherId, schoolClass);
  });
  const selectedFacilityUnavailable = occupied.facilityIds.has(state.blockFacilityId) && !state.blockCoIntervention || occupied.unavailableFacilityIds.has(state.blockFacilityId);
  const selectedFacilityNoProgramActivity = Boolean(state.blockFacilityId) && !facilityHasActivityForBlockProgram(state.blockFacilityId, block);
  const selectedTeachersUnavailable = state.blockTeacherIds.some(teacherId => occupied.teacherIds.has(teacherId) || occupied.unavailableTeacherIds.has(teacherId) || cycleUnavailableTeacherIds.has(teacherId));
  const weekLetterMismatch = !editingCycleDetails && !state.activeBuildCycleId && state.blockWeekLetter !== "all" && state.blockWeekLetter !== weekItem.letter;
  const unavailableMessage = editingCycleDetails ? "" : blockUnavailableMessage(row, weekItem, block);
  const cycleUnavailableMessage = cellCycle ? blockCycleUnavailableMessage(row.id, cellCycle.id, block, state.blockWeekLetter) : "";
  const activityProgramValid = activityAllowedForBuildBlock(block);
  const activityProgramMessage = !activityProgramValid && block.activityId ? "Impossible : l'activite choisie n'est pas reliee a l'installation ou n'est pas au programme de la classe du bloc." : "";
  const facilityProgramMessage = selectedFacilityNoProgramActivity ? "Impossible : cette installation ne propose aucune activite compatible avec le programme de la classe du bloc." : "";
  const conflictMessage = unavailableMessage || cycleUnavailableMessage || activityProgramMessage || facilityProgramMessage || (weekLetterMismatch ? `Impossible : cette case est en semaine ${weekItem.letter}, pas en semaine ${state.blockWeekLetter}.` : cellCycle ? blockCycleConflictMessage(row.id, cellCycle.id, block, state.editingBuildBlock?.ruleId, state.blockWeekLetter, !editingCycleDetails) : "");
  const hardUnavailableMessage = unavailableMessage || cycleUnavailableMessage;
  const optionBlockValid = !block.optionBlock || Boolean(block.optionId && block.optionHours > 0);
  const canSaveBlock = Boolean(cellCycle && state.blockTeacherIds.length && !selectedTeachersUnavailable && !hardUnavailableMessage && !weekLetterMismatch && optionBlockValid && activityProgramValid && !selectedFacilityNoProgramActivity);
  const items = state.constructionPlan[state.activeBuildCell] || [];
  const events = eventsForPeriod(row, weekItem);
  const asItems = asSessionsForCell(row, weekItem);
  const presentCount = items.length + events.length + asItems.length;
  const editingLabel = editingCycleDetails ? `Mode ${cycleLabel(true)} : les installations et activités seront appliquées à toute cette ${cycleLabel(true)}.` : state.editingBuildBlock ? "Mode modification : double-clic appliqué sur un bloc existant." : "";
  const linkedActivities = state.blockFacilityId ? activitiesForFacility(state.blockFacilityId) : [];
  const baseActivities = state.blockFacilityId ? linkedActivities : state.activities;
  const programActivityIds = programActivityIdsForBlock(block);
  const availableActivities = programActivityIds.length ? baseActivities.filter(activity => programActivityIds.includes(activity.id)) : baseActivities;
  const activityEmptyMessage = state.blockFacilityId && !linkedActivities.length ? "Aucune activite reliee a cette installation." : programActivityIds.length && !availableActivities.length ? "Aucune activite de cette installation n'est au programme de la classe." : "Aucune activite renseignee.";
  const availableFreeActivities = serviceFreeActivities();
  const availableOptions = serviceFreeOptionsForTeachers(state.blockTeacherIds);
  const selectedOption = state.blockOptionId ? serviceFreeOptionById(state.blockOptionId) : null;
  const selectedOptionDefaultHours = selectedOption ? optionDurationMax(selectedOption.id) : 0;
  const optionBlockAvailable = optionBlockAvailableForTeachers();
  const optionBlockReason = optionBlockAvailable ? "Construire un bloc option." : optionBlockUnavailableReason();
  const selectedOptionCycleIds = normalizedOptionCycleIds();
  const renderTeacherClassPicker = teacher => {
    const selectedTeacherClass = classParts(state.blockTeacherClasses[teacher.id] || "");
    const selectedLevel = state.blockTeacherClassLevels[teacher.id] || selectedTeacherClass.level || "";
    const selectedBaseClass = state.blockTeacherClasses[teacher.id] ? baseClassFromGroupedClass(state.blockTeacherClasses[teacher.id]) : "";
    const visibleClasses = selectedLevel ? constructionClassChoicesForLevel(selectedLevel) : [];
    const teacherClassUnavailable = schoolClass => classCollectionHasOverlap(occupied.classes, schoolClass) || classCollectionHasOverlap(occupied.unavailableClasses, schoolClass) || !serviceAllowsClassForTeacher(teacher.id, schoolClass);
    return `<div class="buildField">
            <label>Classe de ${teacher.name}</label>
            <div class="choiceGrid">
              <button class="choiceButton ${!state.blockTeacherClasses[teacher.id] && !selectedLevel ? "active" : ""}" data-clear-teacher-class="${teacher.id}">Sans classe</button>
              ${state.classLevels.map(level => {
      const levelClasses = constructionClassChoicesForLevel(level);
      const unavailable = !levelClasses.length || levelClasses.every(schoolClass => classGroupVariants(schoolClass).every(teacherClassUnavailable));
      const reason = unavailable ? `Classes de ${level} déjà prises, indisponibles ou hors service théorique pour ${teacher.name}.` : `Afficher les classes de ${level}.`;
      return `<button class="choiceButton ${level === selectedLevel ? "active" : ""} ${unavailable ? "unavailable" : ""}" data-pick-teacher-class-level="${teacher.id}" data-class-level="${level}" title="${reason}" aria-label="${reason}" ${!levelClasses.length ? "disabled" : ""}>${level}</button>`;
    }).join("")}
            </div>
            ${selectedLevel ? `<div class="choiceGrid">${visibleClasses.map(schoolClass => {
      const variants = classGroupVariants(schoolClass);
      const serviceMessage = serviceClassRestrictionMessage([teacher.id], schoolClass);
      const unavailable = variants.every(variant => classCollectionHasOverlap(occupied.classes, variant) || classCollectionHasOverlap(occupied.unavailableClasses, variant) || !serviceAllowsClassForTeacher(teacher.id, variant));
      const reason = unavailable ? serviceMessage || `${compactClassName(schoolClass)} est déjà prise ou indisponible sur ce créneau.` : `${compactClassName(schoolClass)} disponible.`;
      const classChoiceLabel = constructionClassChoiceLabel(schoolClass);
      const hardUnavailable = variants.every(variant => classCollectionHasOverlap(occupied.unavailableClasses, variant));
      return `<button class="choiceButton serviceClassButton${classSelectionButtonClass(schoolClass)} ${classSameBase(schoolClass, selectedBaseClass) ? "active" : ""} ${unavailable ? "unavailable" : ""}" data-pick-teacher-class="${teacher.id}" data-school-class="${schoolClass}" title="${reason}" aria-label="${reason}" ${hardUnavailable ? "disabled" : ""}>${classChoiceLabel}</button>`;
    }).join("")}</div>` : `<span class="muted">Choisissez un niveau pour afficher les classes.</span>`}
            ${selectedBaseClass ? `<div class="choiceGrid">
              ${state.classGroups.map(group => {
      const variant = classGroupVariant(selectedBaseClass, group.id);
      const groupActive = classParts(state.blockTeacherClasses[teacher.id] || "").group === group.id;
      const serviceMessage = serviceClassRestrictionMessage([teacher.id], variant);
      const unavailable = classCollectionHasOverlap(occupied.classes, variant) || classCollectionHasOverlap(occupied.unavailableClasses, variant) || Boolean(serviceMessage);
      const hardUnavailable = classCollectionHasOverlap(occupied.unavailableClasses, variant);
      const label = group.id === "whole" ? "Classe entière" : group.label;
      const reason = unavailable ? serviceMessage || `${compactClassName(variant)} est déjà prise ou indisponible sur ce créneau.` : `${label} disponible.`;
      return `<button class="choiceButton ${groupActive ? "active" : ""} ${unavailable ? "unavailable" : ""}" data-pick-teacher-class-group="${teacher.id}" data-class-group="${group.id}" title="${reason}" aria-label="${reason}" ${hardUnavailable ? "disabled" : ""}>${label}</button>`;
    }).join("")}
            </div>` : ""}
          </div>`;
  };
  return `<div class="modalBackdrop">
          <section class="modal">
            <div class="modalHeader">
              <div>
                <h3>${row.day} · ${row.slot.label}</h3>
                <p class="muted">${editingCycleDetails ? `${cycleLabel()} ${blockLevel ? blockLevel : "commun"} : ${cellCycle ? displayCycleName(cellCycle) : `aucune ${cycleLabel(true)} définie`}.` : `Semaine ${weekItem.rank}${weekItem.letter}. ${cycleLabel()} ${blockLevel ? blockLevel : "commun"} : ${cellCycle ? displayCycleName(cellCycle) : `aucune ${cycleLabel(true)} définie`}.`}</p>
                ${editingLabel ? `<p class="muted">${editingLabel}</p>` : ""}
              </div>
              <button class="modalClose" id="closeBuildModal">x</button>
            </div>
            ${!row.isAs ? `${editingCycleDetails ? renderFixedBlockContext(state.editingBuildBlock?.ruleId, cellCycle, block) : `<div class="buildField" style="margin-bottom:10px">
              <label>Type de bloc</label>
              <div class="choiceGrid">
                <button class="choiceButton ${state.blockCoIntervention && !state.blockIsOption ? "active" : ""}" data-toggle-co-intervention ${state.blockIsOption ? "disabled" : ""}>Co-intervention</button>
                <button class="choiceButton ${!state.blockCoIntervention && !state.blockIsOption ? "active" : ""}" data-toggle-single-intervention>Cours simple</button>
                <button class="choiceButton ${state.blockIsOption ? "active" : ""} ${optionBlockAvailable ? "" : "unavailable"}" data-toggle-option-block title="${optionBlockReason}" aria-label="${optionBlockReason}" aria-disabled="${optionBlockAvailable ? "false" : "true"}">Option</button>
              </div>
            </div>`}
            <div class="modalGrid">
              ${!editingCycleDetails ? `<div class="buildField">
                <label>Professeur(s)</label>
                <div class="choiceGrid">${state.teachers.map(teacher => {
    const unavailable = occupied.teacherIds.has(teacher.id) || occupied.unavailableTeacherIds.has(teacher.id) || cycleUnavailableTeacherIds.has(teacher.id);
    const reason = occupied.teacherIds.has(teacher.id) ? `${teacher.name} est déjà pris sur ce créneau.` : occupied.unavailableTeacherIds.has(teacher.id) ? `${teacher.name} est indisponible sur ce créneau.` : cycleUnavailableTeacherIds.has(teacher.id) ? `${teacher.name} est indisponible sur une semaine de ce cycle.` : `${teacher.name} disponible.`;
    return `<button class="choiceButton ${state.blockTeacherIds.includes(teacher.id) ? "active" : ""} ${unavailable ? "unavailable" : ""}" data-pick-teacher="${teacher.id}" title="${reason}" aria-label="${reason}" ${unavailable ? "disabled" : ""} style="background:${teacher.color};border-color:${teacher.border}">${teacher.name}</button>`;
  }).join("")}</div>
              </div>` : ""}
              ${state.constructionBuildMode === "cycleDetails" ? `<div class="buildField">
                <label>Installation</label>
                <div class="choiceGrid">
                  <button class="choiceButton ${!state.blockFacilityId ? "active" : ""}" data-clear-facility>Sans installation</button>
                  ${state.facilities.map(facility => {
    const occupiedByCourse = occupied.facilityIds.has(facility.id);
    const hasLinkedActivities = activitiesForFacility(facility.id).length > 0;
    const hasProgramActivity = hasLinkedActivities && facilityHasActivityForBlockProgram(facility.id, block);
    const hardUnavailable = occupied.unavailableFacilityIds.has(facility.id) || !hasProgramActivity;
    const unavailable = occupiedByCourse && !state.blockCoIntervention || hardUnavailable;
    const reason = !hasLinkedActivities ? `${facility.label} n'a aucune activite reliee.` : !hasProgramActivity ? `${facility.label} ne propose aucune activite au programme de la classe du bloc.` : occupied.facilityIds.has(facility.id) ? state.blockCoIntervention ? `${facility.label} déjà occupée : autorisée en co-intervention si profs et classes sont différents.` : `${facility.label} est déjà occupée sur ce créneau.` : occupied.unavailableFacilityIds.has(facility.id) ? `${facility.label} est indisponible sur ce créneau.` : `${facility.label} disponible.`;
    return `<button class="choiceButton ${facility.id === state.blockFacilityId ? "active" : ""} ${unavailable ? "unavailable" : ""}" data-pick-facility="${facility.id}" title="${reason}" aria-label="${reason}" ${hardUnavailable ? "disabled" : ""}>${facility.label}</button>`;
  }).join("")}</div>
              </div>
              ${false && state.blockIsOption ? `<div class="buildField">
                <label>Option</label>
                <div class="choiceGrid">
                  ${availableOptions.map(option => `<button class="choiceButton ${option.id === state.blockOptionId ? "active" : ""}" data-pick-option="${option.id}">${option.label}${state.blockTeacherIds.length > 1 ? ` · ${option.teacherName}` : ""}</button>`).join("") || `<span class="muted">Aucune option disponible pour le ou les profs sélectionnés.</span>`}
                </div>
                ${selectedOption ? `<label>Duree</label>
                <input id="blockOptionHours" type="number" min="0.25" step="0.25" value="${state.blockOptionHours || selectedOptionDefaultHours}" />
                <span class="muted">Durée libre : renseignéz le volume à compter dans le service réel.</span>` : `<span class="muted">Choisissez l'option concernee pour ${isCollegeEstablishment() ? "cette période" : "ce cycle"}.</span>`}
              </div>` : `<div class="buildField">
                <label>Activité (optionnel)</label>
                <div class="choiceGrid">
                  <button class="choiceButton ${!state.blockActivityId ? "active" : ""}" data-clear-activity>Sans activite</button>
                  ${availableActivities.map(activity => `<button class="choiceButton ${activity.id === state.blockActivityId ? "active" : ""}" data-pick-activity="${activity.id}">${activity.label}</button>`).join("") || `<span class="muted">${activityEmptyMessage}</span>`}
                </div>
                ${availableFreeActivities.length ? `<label>Service libre</label>
                <div class="choiceGrid">
                  ${availableFreeActivities.map(activity => `<button class="choiceButton ${activity.id === state.blockActivityId ? "active" : ""}" data-pick-activity="${activity.id}">${activity.label}</button>`).join("")}
                </div>` : ""}
                <span class="muted">Optionnel : les services libres peuvent etre choisis sans installation.</span>
              </div>`}` : ""}
              ${!editingCycleDetails ? state.blockIsOption ? `<div class="buildField">
                  <label>Option</label>
                  <div class="choiceGrid">
                    ${availableOptions.map(option => `<button class="choiceButton ${option.id === state.blockOptionId ? "active" : ""}" data-pick-option="${option.id}">${option.label}${state.blockTeacherIds.length > 1 ? ` &middot; ${option.teacherName}` : ""}</button>`).join("") || `<span class="muted">Aucune option disponible pour le ou les profs sélectionnés.</span>`}
                  </div>
                  ${selectedOption ? `<label>Duree</label>
                  <input id="blockOptionHours" type="number" min="0.25" step="0.25" value="${state.blockOptionHours || selectedOptionDefaultHours}" />
                  <span class="muted">Durée libre : renseignéz le volume à compter dans le service réel.</span>
                  <label>${isCollegeEstablishment() ? "P\u00e9riodes concern\u00e9es" : "Cycles concern\u00e9s"}</label>
                  <div class="choiceGrid">
                    ${optionCycleChoices().map(cycle => `<button class="choiceButton ${selectedOptionCycleIds.includes(cycle.id) ? "active" : ""}" data-pick-option-cycle="${cycle.id}">${displayCycleName(cycle)}</button>`).join("")}
                  </div>` : `<span class="muted">Choisissez l'option concernee.</span>`}
                  <span class="muted">Aucune classe n'est obligatoire pour valider ce bloc.</span>
                </div>` : state.blockTeacherIds.length ? `<div class="coTeacherClassGrid">${state.blockTeacherIds.map(teacherId => state.teachers.find(teacher => teacher.id === teacherId)).filter(Boolean).map(renderTeacherClassPicker).join("")}</div>` : `<div class="buildField"><label>Classe</label><span class="muted">Selectionnez d'abord un professeur, puis attribuez-lui sa classe.</span></div>` : ""}
            </div>
            ${!editingCycleDetails ? `<div class="buildField" style="margin-top:10px">
              <label>Rythme</label>
              <div class="choiceGrid">
                <button class="choiceButton ${state.blockWeekLetter === "all" ? "active" : ""}" data-pick-week-letter="all">Toutes les semaines</button>
                <button class="choiceButton ${state.blockWeekLetter === "A" ? "active" : ""} ${!state.activeBuildCycleId && weekItem.letter !== "A" ? "unavailable" : ""}" data-pick-week-letter="A" title="${!state.activeBuildCycleId && weekItem.letter !== "A" ? `Cette case est en semaine ${weekItem.letter}. Pour un cours quinzaine A, cliquez sur une case de semaine A.` : "Cours uniquement en semaine A"}" aria-label="${!state.activeBuildCycleId && weekItem.letter !== "A" ? `Cette case est en semaine ${weekItem.letter}. Pour un cours quinzaine A, cliquez sur une case de semaine A.` : "Cours uniquement en semaine A"}" ${!state.activeBuildCycleId && weekItem.letter !== "A" ? "disabled" : ""}>Quinzaine A</button>
                <button class="choiceButton ${state.blockWeekLetter === "B" ? "active" : ""} ${!state.activeBuildCycleId && weekItem.letter !== "B" ? "unavailable" : ""}" data-pick-week-letter="B" title="${!state.activeBuildCycleId && weekItem.letter !== "B" ? `Cette case est en semaine ${weekItem.letter}. Pour un cours quinzaine B, cliquez sur une case de semaine B.` : "Cours uniquement en semaine B"}" aria-label="${!state.activeBuildCycleId && weekItem.letter !== "B" ? `Cette case est en semaine ${weekItem.letter}. Pour un cours quinzaine B, cliquez sur une case de semaine B.` : "Cours uniquement en semaine B"}" ${!state.activeBuildCycleId && weekItem.letter !== "B" ? "disabled" : ""}>Quinzaine B</button>
              </div>
            </div>` : ""}
            <div class="buildPreview" style="${blockTeacherStyle(block)}">
              <strong>${classesForBlock(block).length ? blockClassLabel(block) : block.optionBlock ? "Option" : "Classe libre"}</strong>
              ${state.constructionBuildMode === "cycleDetails" && block.facilityLabel ? `<span>${block.facilityLabel}</span>
              ${block.activityLabel ? `<span>${block.activityLabel}</span>` : ""}` : ""}
              <span>${block.teacherNames || "Professeur a sélectionnér"}</span>
              ${state.blockCoIntervention ? `<span>Co-intervention</span>` : ""}
            </div>
            ${conflictMessage ? `<div class="conflictNotice">${conflictMessage}</div>` : ""}
            <div class="modalFooter">
              <button class="ghostButton" id="closeBuildModalFooter">Annuler</button>
              <button class="addButton" id="addBuiltBlock" ${canSaveBlock ? "" : "disabled"}>${editingCycleDetails ? "Enregistrer ce cycle" : state.editingBuildBlock ? "Enregistrer le bloc annuel" : "Ajouter le bloc annuel"}</button>
            </div>` : ""}
            <div class="existingBlocks">
              <h3>${editingCycleDetails ? "Blocs présents sur ce cycle" : "Blocs présents sur ce créneau"}</h3>
              <div class="buildCellStack">${presentCount ? `${items.map((item, index) => `
                <div class="buildBlock" data-edit-built-block="${index}" style="${blockTeacherStyle(item)}">
                  ${editingCycleDetails ? "" : `<button data-remove-cell="${state.activeBuildCell}" data-remove-index="${index}" title="Retirer">x</button>`}
                  <strong>${blockClassLabel(item)}</strong>
                  <span>${blockDetailLabel(item)}</span>
                  ${item.coIntervention ? `<span>Co-intervention</span>` : ""}
                  <span>${item.cycleName || ""}${item.weekLetter && item.weekLetter !== "all" ? ` · Quinzaine ${item.weekLetter}` : ""}</span>
                </div>`).join("")}${events.map(event => `
                <div class="buildBlock eventBlock">
                  <button data-delete-cell-event="${event.id}" data-delete-cell-key="${state.activeBuildCell}" title="Retirer de ce créneau">x</button>
                  <strong>${event.name} : ${eventClassSummary(event)}</strong>
                  ${eventTeacherDots(event)}
                </div>`).join("")}${asItems.map(session => `
                <div class="buildBlock asBlock" style="${asSessionStyle(session)}">
                  <button data-delete-cell-as="${session.id}" data-delete-cell-key="${state.activeBuildCell}" title="Retirer de ce créneau">x</button>
                  <strong>${asBlockLabel(session)}</strong>
                  <span>${asSessionTeacherLabel(session)}</span>
                </div>`).join("")}` : `<span class="muted">Aucun bloc pour cette case.</span>`}</div>
            </div>
          </section>
        </div>`;
}
export function renderDeleteBlockModal() {
  const block = state.constructionPlan[state.pendingBlockDelete.key]?.[state.pendingBlockDelete.index];
  const label = block ? `${block.schoolClass || "Bloc"} · ${block.facilityLabel || ""} · ${block.cycleName || "cycle"}` : "Bloc sélectionné";
  return `<div class="modalBackdrop">
          <section class="modal deleteModal">
            <div class="modalHeader">
              <div>
                <h3>Supprimer ce bloc ?</h3>
                <p class="muted">${label}</p>
              </div>
              <button class="modalClose" id="cancelBlockDeleteTop">x</button>
            </div>
            <div class="deleteChoices">
              <button class="dangerButton" id="deleteWholeCycle">Suppression ${cycleLabel(true)}</button>
              <button class="ghostButton" id="deleteSelectedSlot">Suppression créneau sélectionné</button>
              <button class="ghostButton" id="cancelBlockDelete">Annuler</button>
            </div>
          </section>
        </div>`;
}
