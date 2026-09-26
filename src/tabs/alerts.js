import { escapeHtml } from "../ui/format.js";
import { state } from "../app/state.js";
import { blockClassLabel, teacherLabelForBlock } from "../domain/assignments.js";
import { detectConflicts } from "../domain/conflicts.js";
import { activeScheduleWeek, statFor } from "../domain/schedule.js";

export function renderConstraints(cycle) {
  const selectedWeek = activeScheduleWeek();
  const selected = selectedWeek === "B" ? cycle.B : cycle.A;
  return `<section class="panel">
          <div class="check"><strong>Objectif mensuel : 68h pour 4 professeurs, 52h pour le professeur agrégé. Les semaines A et B peuvent donc être différentes.</strong></div>
          <h2 style="margin-top:18px">Priorite de generation</h2>
          <div class="list">${state.facilities.map((facility, index) => `
            <article class="priority"><strong>${index + 1}</strong><div><b>${escapeHtml(facility.label)}</b><span class="muted">${facility.type === "external" ? "Installation extérieure au collège" : "Installation dans le collège"}</span></div></article>
          `).join("")}</div>
          <h2 style="margin-top:18px">${selectedWeek === "year" ? "Bilan mensuel A/B" : `Bilan semaine ${selectedWeek}`}</h2>
          <div class="list">${state.teachers.map(teacher => {
    const stats = selectedWeek === "year" ? statFor(cycle, teacher.id) : selected.stats[teacher.id];
    const target = selectedWeek === "year" ? "" : ` / ${teacher.weekTargets[selectedWeek]}h`;
    return `<article class="stat"><strong style="color:${escapeHtml(teacher.border)}">${escapeHtml(teacher.name)}</strong><span>${escapeHtml(stats.total)}${selectedWeek === "year" ? "" : "h"}${target}</span><small class="muted">${escapeHtml(stats.external)}${selectedWeek === "year" ? "" : "h"} ext. · ${escapeHtml(stats.internal)}${selectedWeek === "year" ? "" : "h"} collège</small></article>`;
  }).join("")}</div>
        </section>`;
}
export function renderAlertsView() {
  const conflicts = detectConflicts();
  const conflictTypes = ["Installation : deux blocs utilisent la même installation sur le même créneau, sauf co-intervention volontaire.", "Professeur : un même prof est affecté à deux classes différentes en même temps.", "Classe : une même classe est affectée à deux cours différents en même temps.", "AS : un même prof ne peut pas être placé sur deux AS en même temps.", "Quinzaine : un cours A doit être posé depuis une semaine A, et un cours B depuis une semaine B."];
  return `<section class="alertsPage">
          <h2>Alertes de conflits</h2>
          <article class="alertHelp">
            <strong>Types de conflits surveillés</strong>
            ${conflictTypes.map(type => `<span>${type}</span>`).join("")}
          </article>
          ${conflicts.length === 0 ? `<div class="alertEmpty">Aucun conflit détecté dans le planning construit.</div>` : conflicts.map(conflict => `
            <article class="alertCard">
              <strong>${escapeHtml(conflict.row.day)} · ${escapeHtml(conflict.row.slot.label)} · Semaine ${escapeHtml(conflict.weekItem.rank)}${escapeHtml(conflict.weekItem.letter)}</strong>
              ${conflict.type === "teacher" ? `
                <span>Professeur en conflit : ${escapeHtml((state.teachers.find(teacher => teacher.id === conflict.teacher)?.name || conflict.teacher))}</span>
                <span>${conflict.items.map(item => `${blockClassLabel(item) || "classe"} · ${item.facilityLabel || "installation"}`).join(" / ")}</span>
                <span>Règle : un professeur ne peut pas avoir cours avec deux classes en même temps.</span>
              ` : conflict.type === "asTeacher" ? `
                <span>Professeur en conflit AS : ${escapeHtml((state.teachers.find(teacher => teacher.id === conflict.teacher)?.name || conflict.teacher))}</span>
                <span>${conflict.items.map(item => `${item.name || "AS"} · ${item.weekdays.join(", ")}`).join(" / ")}</span>
                <span>Règle : un professeur ne peut pas être affecté à deux AS en même temps.</span>
              ` : conflict.type === "class" ? `
                <span>Classe en conflit : ${escapeHtml(conflict.schoolClass)}</span>
                <span>${conflict.items.map(item => `${teacherLabelForBlock(item)} · ${item.facilityLabel || "installation"}`).join(" / ")}</span>
                <span>Règle : une classe ne peut pas avoir deux cours différents en même temps. Pour un cours conjoint, sélectionnez deux profs dans un seul bloc.</span>
              ` : `
                <span>Installation en conflit : ${escapeHtml((conflict.items[0].facilityLabel || conflict.facility))}</span>
                <span>${conflict.items.map(item => `${teacherLabelForBlock(item)} avec ${blockClassLabel(item) || "classe"}`).join(" / ")}</span>
                <span>Règle : une installation ne peut pas accueillir deux blocs sur le même créneau, sauf co-intervention volontaire avec profs et classes différents.</span>
              `}
            </article>
          `).join("")}
        </section>`;
}
