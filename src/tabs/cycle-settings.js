import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { activeCycles, cyclesForScope, validateCycles } from "../domain/cycles.js";
import { schoolYearWeeks, vacationForWeek } from "../domain/dates.js";
import { monthLabelForWeek, weeksForCycle } from "../domain/hours.js";
import { cycleLabel, displayCycleName } from "../domain/settings.js";
import { renderDateRangePicker, shortDate, weekDisplayEnd, weekDisplayStart } from "../ui/date-picker.js";
import { groupedHeaderCells } from "../ui/format.js";

export function renderCycleDefinition() {
  const shownCycles = activeCycles();
  const cycleErrors = validateCycles(shownCycles);
  return `<h3>Définition des ${cycleLabel(true, true)}</h3>
          <div class="constructionTabs">
            <button class="${state.activeCycleScope === "default" ? "active" : ""}" data-cycle-scope="default">Tous niveaux</button>
            ${state.classLevels.map(level => `<button class="${state.activeCycleScope === level ? "active" : ""}" data-cycle-scope="${level}">${level}</button>`).join("")}
          </div>
          ${state.activeCycleScope === "default" ? `<p class="muted">Par défaut, ces ${cycleLabel(true, true)} s’appliquent à tous les niveaux.</p>` : `<p class="muted">${cycleLabel(false, true)} spécifiques aux ${state.activeCycleScope}. Ils seront utilisés pour les blocs de classes ${state.activeCycleScope}.</p>`}
          <div class="cycleCount">
            <label for="cycleCount">Nombre de ${cycleLabel(true, true)}</label>
            <input id="cycleCount" type="number" min="1" max="12" value="${shownCycles.length}" />
          </div>
          <div class="cycleList">${shownCycles.map(cycle => `
            <div class="cycleRow">
              <label>${displayCycleName(cycle)}</label>
              ${renderDateRangePicker(`cycle:${cycle.id}`, cycle.start, cycle.end)}
            </div>`).join("")}</div>
          ${cycleErrors.length ? `<div class="cycleErrorBox">${cycleErrors.map(message => `<span>${message}</span>`).join("")}</div>` : ""}
          ${state.cycleSaveStatus ? `<div class="cloudStatus">${state.cycleSaveStatus}</div>` : ""}
          ${renderCycleCoverage(state.activeCycleScope)}`;
}
export function renderCycleCoverage(scope = "default") {
  const weeks = schoolYearWeeks();
  const shownCycles = cyclesForScope(scope);
  const palette = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe", "#cffafe", "#fee2e2", "#e0e7ff", "#ecfccb", "#fae8ff", "#f1f5f9", "#ffedd5"];
  const cycleStyle = cycle => {
    if (!cycle) return "";
    const index = Math.max(0, shownCycles.findIndex(item => item.id === cycle.id));
    return `background:${palette[index % palette.length]};border-color:#111827;color:#0f172a;`;
  };
  const groupedCoverageCells = () => {
    const groups = [];
    weeks.forEach(weekItem => {
      const vacation = vacationForWeek(weekItem);
      const cycle = shownCycles.find(item => weeksForCycle(item).some(cycleWeek => cycleWeek.rank === weekItem.rank));
      const label = vacation ? "V" : cycle ? displayCycleName(cycle, true) : "";
      const className = vacation ? "vacationCell" : cycle ? "coveredCell" : "gapCell";
      const style = cycle && !vacation ? cycleStyle(cycle) : "";
      const title = vacation?.name || (cycle ? `${cycle.start} - ${cycle.end}` : `Aucune ${cycleLabel(true)}`);
      const last = groups[groups.length - 1];
      if (last && last.label === label && last.className === className && last.style === style && last.title === title) {
        last.span += 1;
        last.end = weekItem;
      } else {
        groups.push({
          label,
          className,
          style,
          title,
          start: weekItem,
          end: weekItem,
          span: 1
        });
      }
    });
    return groups.map(group => `<td colspan="${group.span}" class="${group.className}" style="${group.style}" title="${group.title}">
            <div class="cycleCoverageBlock">
              <strong>du ${shortDate(weekDisplayStart(group.start))} au ${shortDate(weekDisplayEnd(group.end))}</strong>
            </div>
          </td>`).join("");
  };
  return `<div class="cycleCoverage">
          <h3>Vue annuelle des ${cycleLabel(true, true)}</h3>
          <div class="cycleLegend"><span class="cycleLegendSwatch"></span><span>Rouge fonce : trou dans les ${cycleLabel(true, true)}</span></div>
          <div class="yearWrap"><table class="yearTable cycleCoverageTable">
            <thead>
              <tr><th class="timeHead">Repère</th>${groupedHeaderCells(weeks, monthLabelForWeek, () => "monthCell")}</tr>
              <tr><th class="timeHead">${cycleLabel()}</th>${groupedHeaderCells(weeks, weekItem => {
    const vacation = vacationForWeek(weekItem);
    const cycle = shownCycles.find(item => weeksForCycle(item).some(cycleWeek => cycleWeek.rank === weekItem.rank));
    return vacation ? "V" : cycle ? displayCycleName(cycle, true) : "";
  }, weekItem => vacationForWeek(weekItem) ? "vacationHeader" : shownCycles.find(item => weeksForCycle(item).some(cycleWeek => cycleWeek.rank === weekItem.rank)) ? "cycleHeader" : "gapCell")}</tr>
              <tr><th class="timeHead">Semaine</th>${weeks.map(weekItem => `<th>${weekItem.rank}${weekItem.letter}</th>`).join("")}</tr>
            </thead>
            <tbody>
              <tr>
                <th class="timeHead">Dates</th>
                ${groupedCoverageCells()}
              </tr>
            </tbody>
          </table></div>
        </div>`;
}
export function bindCycleSettingsEvents() {
  document.querySelectorAll("[data-cycle-view-zoom]").forEach(button => {
    button.addEventListener("click", () => {
      const direction = button.dataset.cycleViewZoom;
      state.cycleViewZoom = Math.min(1.5, Math.max(0.15, state.cycleViewZoom + (direction === "+" ? 0.1 : -0.1)));
      state.cycleViewZoom = Math.round(state.cycleViewZoom * 100) / 100;
      render();
    });
  });
  document.querySelectorAll("[data-cycle-view-zoom-reset]").forEach(button => {
    button.addEventListener("click", () => {
      state.cycleViewZoom = 0.6;
      render();
    });
  });
  document.querySelectorAll("[data-cycle-scope]").forEach(button => {
    button.addEventListener("click", () => {
      state.activeCycleScope = button.dataset.cycleScope;
      const scopedCycles = activeCycles();
      state.activeCycleId = scopedCycles[0]?.id || "";
      render();
    });
  });
}
