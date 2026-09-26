import { state } from "../app/state.js";
import { acceptedConflictKey, acceptedConflictKeys, allConflictsForBuildMode, blockClassLabel, classesForBlock, constructionActivityById, serviceFreeActivityById, swimmingActivityIds, teacherLabelForBlock } from "./assignments.js";
import { yearRows } from "./dates.js";
import { cycleForWeek } from "./hours.js";
import { annualConstructionRules } from "./readiness.js";
import { cycleLabel, displayCycleName } from "./settings.js";
import { baseClassFromGroupedClass, blockWithCycleOverride, constructionCyclesForRule, cycleOrdinal, loadHiddenConstructionReport } from "../services/settings-storage.js";
import { compactClassName } from "../ui/format.js";

export function constructionConflictDetails(conflict) {
  if (conflict.type === "teacher") {
    const teacherName = state.teachers.find(teacher => teacher.id === conflict.teacher)?.name || conflict.teacher;
    return {
      label: teacherName,
      detail: conflict.items.map(item => `${blockClassLabel(item) || "classe non précisée"} · ${item.facilityLabel || "installation non précisée"}`).join(" / ")
    };
  }
  if (conflict.type === "asTeacher") {
    const teacherName = state.teachers.find(teacher => teacher.id === conflict.teacher)?.name || conflict.teacher;
    return {
      label: teacherName,
      detail: conflict.items.map(item => `${item.name || "AS"} · ${item.weekdays.join(", ")}`).join(" / ")
    };
  }
  if (conflict.type === "class") {
    return {
      label: conflict.schoolClass || "classe non précisée",
      detail: conflict.items.map(item => `${teacherLabelForBlock(item)} · ${item.facilityLabel || "installation non précisée"}`).join(" / ")
    };
  }
  return {
    label: conflict.items[0].facilityLabel || conflict.facility || "installation non précisée",
    detail: conflict.items.map(item => `${teacherLabelForBlock(item)} avec ${blockClassLabel(item) || "classe non précisée"}`).join(" / ")
  };
}
export function constructionConflictTitle(conflict, includeCycle = true) {
  if (state.constructionBuildMode === "cycleDetails") {
    const weekType = conflict.weekType && conflict.weekType !== "all" ? ` · Semaine type ${conflict.weekType}` : "";
    const cycleLabel = includeCycle && conflict.cycleLabel ? `${conflict.cycleLabel} · ` : "";
    return `${cycleLabel}${conflict.row.day} · ${conflict.row.slot.label}${weekType}`;
  }
  return `${conflict.row.day} · ${conflict.row.slot.label} · Semaine ${conflict.weekItem.rank}${conflict.weekItem.letter}`;
}
export function encodedConflictValue(value) {
  return encodeURIComponent(String(value || ""));
}
export function cycleDetailsCompletionItems() {
  return annualConstructionRules().flatMap(rule => {
    if (!rule?.block || rule.block.optionBlock) return [];
    return constructionCyclesForRule(rule).map(cycle => {
      const block = blockWithCycleOverride(rule, cycle);
      const missing = [];
      if (!block.facilityId && !serviceFreeActivityById(block.activityId)) missing.push("installation");
      if (!block.activityId && !serviceFreeActivityById(block.activityId)) missing.push("activité");
      return missing.length ? {
        rule,
        cycle,
        block,
        title: `${displayCycleName(cycle)} · ${ruleRowLabel(rule.rowId)}`,
        detail: `${blockClassLabel(block)} · ${teacherLabelForBlock(block)} : ${missing.join(" et ")} à renseigner`
      } : null;
    }).filter(Boolean);
  });
}
export function repeatedActivityByClassItems() {
  const swimmingIds = new Set(swimmingActivityIds());
  const byClassActivity = new Map();
  annualConstructionRules().forEach(rule => {
    if (!rule?.block || rule.block.optionBlock) return;
    constructionCyclesForRule(rule).forEach(cycle => {
      const block = blockWithCycleOverride(rule, cycle);
      if (!block.activityId || swimmingIds.has(block.activityId)) return;
      classesForBlock(block).forEach(schoolClass => {
        const key = `${baseClassFromGroupedClass(schoolClass)}::${block.activityId}`;
        if (!byClassActivity.has(key)) {
          byClassActivity.set(key, {
            schoolClass: baseClassFromGroupedClass(schoolClass),
            activityId: block.activityId,
            activityLabel: block.activityLabel || constructionActivityById(block.activityId)?.label || block.activityId,
            cycles: new Map()
          });
        }
        const item = byClassActivity.get(key);
        const cycleKey = cycleOrdinal(cycle) || cycle.id;
        if (!item.cycles.has(cycleKey)) item.cycles.set(cycleKey, {
          cycle,
          blocks: []
        });
        item.cycles.get(cycleKey).blocks.push({
          rule,
          block
        });
      });
    });
  });
  return [...byClassActivity.values()].filter(item => item.cycles.size > 1).map(item => ({
    ...item,
    cycleLabels: [...item.cycles.values()].map(entry => displayCycleName(entry.cycle)).join(", ")
  })).sort((a, b) => compactClassName(a.schoolClass).localeCompare(compactClassName(b.schoolClass), "fr") || a.activityLabel.localeCompare(b.activityLabel, "fr"));
}
export function groupBy(items, keyForItem) {
  const groups = new Map();
  items.forEach(item => {
    const key = keyForItem(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].map(([key, values]) => ({
    key,
    values
  }));
}
export function ruleRowLabel(rowId) {
  const row = yearRows().find(item => item.id === rowId);
  return row ? `${row.day} · ${row.slot.label}` : "Créneau";
}
export function periodLabelForCycle(cycle) {
  return displayCycleName(cycle) || `${cycleLabel()} ${cycleOrdinal(cycle) || ""}`.trim();
}
export function conflictPeriodOrderFromCycle(cycle) {
  const ordinal = cycleOrdinal(cycle);
  return ordinal === null ? 999 : ordinal;
}
export function conflictPeriodOrder(conflict) {
  const itemCycles = (conflict.items || []).map(item => item.cycleId ? {
    id: item.cycleId,
    name: item.cycleName || item.cycleId
  } : null).filter(Boolean);
  if (itemCycles.length) return Math.min(...itemCycles.map(conflictPeriodOrderFromCycle));
  return conflict.weekItem ? conflictPeriodOrderFromCycle(cycleForWeek(conflict.weekItem)) : 999;
}
export function conflictClassSortLabel(schoolClass) {
  return compactClassName(baseClassFromGroupedClass(schoolClass || "") || schoolClass || "zz");
}
export function compareConflictLabels(first, second) {
  return String(first || "").localeCompare(String(second || ""), "fr", {
    numeric: true,
    sensitivity: "base"
  });
}
export function conflictClassOrderLabel(conflict) {
  if (conflict.schoolClass) return conflictClassSortLabel(conflict.schoolClass);
  const labels = (conflict.items || []).map(item => blockClassLabel(item)).filter(Boolean).map(conflictClassSortLabel).sort(compareConflictLabels);
  return labels[0] || "zz";
}
export function compareConstructionConflicts(first, second) {
  return conflictPeriodOrder(first) - conflictPeriodOrder(second) || compareConflictLabels(conflictClassOrderLabel(first), conflictClassOrderLabel(second)) || compareConflictLabels(constructionConflictTitle(first), constructionConflictTitle(second));
}
export function compareQualityConflicts(first, second) {
  return (first.periodOrder || 999) - (second.periodOrder || 999) || compareConflictLabels(first.classLabel, second.classLabel) || compareConflictLabels(first.title, second.title);
}
export function cycleDetailsQualityConflictItems() {
  if (state.constructionBuildMode !== "cycleDetails") return [];
  const repeatedItems = repeatedActivityByClassItems();
  const missingItems = cycleDetailsCompletionItems();
  return [...repeatedItems.map(item => ({
    key: [state.constructionBuildMode, "quality", "repeated-activity", item.schoolClass, item.activityId, [...item.cycles.keys()].join("+")].join("::"),
    family: "repeatedActivity",
    familyTitle: "Activités répétées hors piscine",
    groupTitle: `${compactClassName(item.schoolClass)} · activité répétée`,
    periodKey: "inter-period",
    periodTitle: "Inter-période",
    periodOrder: 1000,
    classLabel: conflictClassSortLabel(item.schoolClass),
    title: item.activityLabel,
    label: `Activité présente sur plusieurs ${cycleLabel(true, true)}`,
    detail: `${item.cycleLabels}. Hors piscine/natation.`
  })), ...missingItems.map(item => ({
    key: [state.constructionBuildMode, "quality", "missing-details", item.rule.id || "", item.cycle.id || "", item.block.facilityId || "missing-facility", item.block.activityId || "missing-activity"].join("::"),
    family: "missingDetails",
    familyTitle: "Blocs incomplets",
    periodKey: `period:${conflictPeriodOrderFromCycle(item.cycle)}:${periodLabelForCycle(item.cycle)}`,
    periodTitle: periodLabelForCycle(item.cycle),
    groupTitle: `${compactClassName(classesForBlock(item.block)[0] || blockClassLabel(item.block) || "classe")} · bloc incomplet`,
    periodOrder: conflictPeriodOrderFromCycle(item.cycle),
    classLabel: conflictClassSortLabel(classesForBlock(item.block)[0] || blockClassLabel(item.block)),
    title: ruleRowLabel(item.rule.rowId),
    label: "Installation / activité à compléter",
    detail: item.detail
  }))];
}
export function constructionConflictGroupTitle(conflict) {
  if (conflict.type === "class") return `Classe ${compactClassName(conflict.schoolClass || "non renseignée")}`;
  if (state.constructionBuildMode === "cycleDetails") return constructionConflictTitle(conflict, false);
  return constructionConflictTitle(conflict);
}
export function constructionConflictPeriodInfo(conflict) {
  if (state.constructionBuildMode === "cycleDetails") {
    const itemCycles = (conflict.items || []).map(item => item.cycleId ? {
      id: item.cycleId,
      name: item.cycleName || item.cycleId
    } : null).filter(Boolean);
    const uniqueCycleKeys = [...new Map(itemCycles.map(cycle => [cycle.id || cycle.name, cycle])).values()];
    const cycle = uniqueCycleKeys[0] || (conflict.weekItem ? cycleForWeek(conflict.weekItem) : null);
    const title = uniqueCycleKeys.length === 1 ? periodLabelForCycle(cycle) : conflict.cycleLabel || (cycle ? periodLabelForCycle(cycle) : `${cycleLabel()} non renseigné`);
    const order = cycle ? conflictPeriodOrderFromCycle(cycle) : conflictPeriodOrder(conflict);
    return {
      key: `period:${order}:${title}`,
      title,
      order
    };
  }
  const cycle = conflict.weekItem ? cycleForWeek(conflict.weekItem) : null;
  const title = cycle ? periodLabelForCycle(cycle) : "Hors période";
  const order = cycle ? conflictPeriodOrderFromCycle(cycle) : 999;
  return {
    key: `period:${order}:${title}`,
    title,
    order
  };
}
export function constructionConflictFamilyTitle(conflict) {
  if (conflict.type === "teacher") return "Professeurs en conflit";
  if (conflict.type === "asTeacher") return "AS en conflit";
  if (conflict.type === "class") return "Classes en conflit";
  return "Installations en conflit";
}
export function constructionConflictFamilyOrder(conflict) {
  if (conflict.type === "class") return 2;
  if (conflict.type === "teacher") return 3;
  if (conflict.type === "asTeacher") return 4;
  return 1;
}
export function renderConflictValidationAction(key, title, label, detail, accepted) {
  return `<div class="conflictCardActions">
          ${accepted ? `<button class="ghostButton" data-revoke-conflict="${encodedConflictValue(key)}">Annuler</button>` : `<button class="ghostButton" data-accept-conflict="${encodedConflictValue(key)}" data-conflict-title="${encodedConflictValue(title)}" data-conflict-label="${encodedConflictValue(label)}" data-conflict-detail="${encodedConflictValue(detail)}">Valider</button>`}
        </div>`;
}
export function renderConstructionConflictLine(conflict, omitPeriod = false) {
  const details = constructionConflictDetails(conflict);
  const key = acceptedConflictKey(conflict, state.constructionBuildMode);
  const title = constructionConflictTitle(conflict, !omitPeriod);
  const accepted = acceptedConflictKeys().has(key);
  return `<div class="conflictLine ${accepted ? "acceptedConflictLine" : ""}">
          <b>${title}</b>
          <span>${details.label}</span>
          <span>${details.detail}</span>
          ${accepted ? `<span class="acceptedConflictBadge">Validé</span>` : ""}
          ${renderConflictValidationAction(key, title, details.label, details.detail, accepted)}
        </div>`;
}
export function renderQualityConflictLine(item) {
  const accepted = acceptedConflictKeys().has(item.key);
  return `<div class="conflictLine ${accepted ? "acceptedConflictLine" : ""}">
          <b>${item.title}</b>
          <span>${item.label}</span>
          <span>${item.detail}</span>
          ${accepted ? `<span class="acceptedConflictBadge">Validé</span>` : ""}
          ${renderConflictValidationAction(item.key, item.title, item.label, item.detail, accepted)}
        </div>`;
}
export function renderConflictProgressSummary(totalCount, acceptedCount) {
  const pendingCount = Math.max(0, totalCount - acceptedCount);
  const acceptedPercent = totalCount ? Math.round(acceptedCount / totalCount * 100) : 0;
  const pendingPercent = totalCount ? 100 - acceptedPercent : 0;
  return `<div class="conflictProgressSummary" title="${totalCount} conflit${totalCount > 1 ? "s" : ""} détecté${totalCount > 1 ? "s" : ""}, ${acceptedCount} validé${acceptedCount > 1 ? "s" : ""}, ${pendingCount} à traiter.">
          <div class="conflictProgressTrack" aria-label="${acceptedCount} conflits validés sur ${totalCount}">
            <div class="conflictProgressAccepted" style="width:${acceptedPercent}%">${acceptedCount ? `${acceptedCount} validé${acceptedCount > 1 ? "s" : ""}` : ""}</div>
            <div class="conflictProgressPending" style="width:${pendingPercent}%">${pendingCount ? `${pendingCount} à traiter` : ""}</div>
          </div>
          <div class="conflictProgressTotal">${totalCount} total</div>
        </div>`;
}
export function conflictGroupLabel(label, count) {
  return `${label}${count > 1 ? ` · ${count} conflits` : ""}`;
}
export function conflictPeriodLabel(label, count) {
  return `${label} · ${count} conflit${count > 1 ? "s" : ""}`;
}
export function conflictPeriodOrderForGroup(group) {
  return Math.min(...group.values.map(item => item.periodOrder ?? 999));
}
export function conflictFamilyOrderForGroup(group) {
  return Math.min(...group.values.map(item => item.familyOrder ?? 999));
}
export function constructionConflictSummaryItems(conflicts, qualityItems) {
  return [...conflicts.map(conflict => {
    const period = constructionConflictPeriodInfo(conflict);
    return {
      periodKey: period.key,
      periodTitle: period.title,
      periodOrder: period.order,
      familyTitle: constructionConflictFamilyTitle(conflict),
      familyOrder: constructionConflictFamilyOrder(conflict),
      groupTitle: constructionConflictGroupTitle(conflict),
      classLabel: conflictClassOrderLabel(conflict),
      title: constructionConflictTitle(conflict),
      render: () => renderConstructionConflictLine(conflict, true)
    };
  }), ...qualityItems.map(item => ({
    periodKey: item.periodKey || `period:${item.periodOrder ?? 999}:${item.groupTitle || "Période"}`,
    periodTitle: item.periodTitle || item.groupTitle || "Période",
    periodOrder: item.periodOrder ?? 999,
    familyTitle: item.familyTitle,
    familyOrder: item.family === "repeatedActivity" ? 5 : 6,
    groupTitle: item.groupTitle,
    classLabel: item.classLabel,
    title: item.title,
    render: () => renderQualityConflictLine(item)
  }))].sort((first, second) => (first.periodOrder ?? 999) - (second.periodOrder ?? 999) || compareConflictLabels(first.classLabel, second.classLabel) || compareConflictLabels(first.title, second.title));
}
export function renderConstructionConflictSummary() {
  const conflicts = allConflictsForBuildMode(state.constructionBuildMode);
  const hiddenReport = loadHiddenConstructionReport();
  const hiddenReportHtml = state.constructionBuildMode === "blocks" && hiddenReport?.items?.length ? `<section class="alertsPage">
          <h2>Blocs cachés trouvés</h2>
          ${hiddenReport.items.map(item => `<article class="alertCard">
            <strong>${item.day} ${item.slot} · ${item.rhythm}</strong>
            <span>${item.classes || "Classe non renseignée"} · ${item.teachers || "Prof non renseigné"}</span>
            <span>${item.reason}${item.hiddenSlots ? ` · ${item.hiddenSlots} créneau(x) masqué(s)` : ""}</span>
          </article>`).join("")}
        </section>` : "";
  const sortedConflicts = [...conflicts].sort(compareConstructionConflicts);
  const qualityItems = cycleDetailsQualityConflictItems().sort(compareQualityConflicts);
  if (!conflicts.length && !qualityItems.length) return hiddenReportHtml;
  const summaryItems = constructionConflictSummaryItems(sortedConflicts, qualityItems);
  const periodGroups = groupBy(summaryItems, item => item.periodKey).sort((left, right) => conflictPeriodOrderForGroup(left) - conflictPeriodOrderForGroup(right) || compareConflictLabels(left.values[0]?.periodTitle, right.values[0]?.periodTitle));
  const acceptedKeys = acceptedConflictKeys();
  const acceptedCount = conflicts.filter(conflict => acceptedKeys.has(acceptedConflictKey(conflict, state.constructionBuildMode))).length;
  const acceptedQualityCount = qualityItems.filter(item => acceptedKeys.has(item.key)).length;
  const totalCount = conflicts.length + qualityItems.length;
  const totalAcceptedCount = acceptedCount + acceptedQualityCount;
  const conflictProgressHtml = renderConflictProgressSummary(totalCount, totalAcceptedCount);
  if (state.constructionConflictsHidden) {
    return `${hiddenReportHtml}<section class="alertsPage compactAlertSection">
            <div class="alertsHeader">
              <h2>Conflits détectés</h2>
              ${conflictProgressHtml}
              <button class="ghostButton" data-toggle-construction-conflicts>Afficher</button>
            </div>
          </section>`;
  }
  return `${hiddenReportHtml}<section class="alertsPage">
          <div class="alertsHeader">
            <h2>Conflits détectés</h2>
            ${conflictProgressHtml}
            <button class="ghostButton" data-toggle-construction-conflicts>Masquer</button>
          </div>
          <div class="conflictGrid">
          ${periodGroups.map(period => {
    const families = groupBy(period.values, item => item.familyTitle).sort((left, right) => conflictFamilyOrderForGroup(left) - conflictFamilyOrderForGroup(right) || compareConflictLabels(left.key, right.key));
    return `<article class="alertCard inlineConflict">
              <strong>${conflictPeriodLabel(period.values[0]?.periodTitle || "Période", period.values.length)}</strong>
              <div class="conflictList">
                ${families.map(family => {
      const familyGroups = groupBy(family.values, item => item.groupTitle);
      return `<div class="conflictList">
                    <b>${conflictGroupLabel(family.key, family.values.length)}</b>
                    ${familyGroups.map(group => `<div class="conflictList"><b>${conflictGroupLabel(group.key, group.values.length)}</b>${group.values.map(item => item.render()).join("")}</div>`).join("")}
                  </div>`;
    }).join("")}
              </div>
            </article>`;
  }).join("")}
          </div>
        </section>`;
}
