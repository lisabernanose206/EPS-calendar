import { state } from "../app/state.js";
import { escapeHtml } from "../ui/format.js";

export function renderConstructionRulesView() {
  const establishmentCategory = "Règles définies par l’établissement";
  const systemCategory = "Règles système par défaut";
  const groupedRules = state.constructionRuleSettings.reduce((groups, rule) => {
    const category = rule.category === establishmentCategory ? establishmentCategory : systemCategory;
    groups[category] = [...(groups[category] || []), rule];
    return groups;
  }, {});
  const ruleGroups = [establishmentCategory, systemCategory].map(category => [category, [...(groupedRules[category] || [])].sort((first, second) => first.title.localeCompare(second.title, "fr"))]).filter(([, rules]) => rules.length);
  return `<section class="constructionRulesPage">
          <div class="constructionRulesList" style="grid-column:1 / -1">
            <div class="constructionRulesToolbar">
              <h3>Règles de construction</h3>
            </div>
            <div class="alertHelp"><strong>Règles système par défaut</strong><span>Ces règles sont pilotées par les onglets de pré-requis, les services, le programme, les indisponibilités et les installations.</span></div>
            ${ruleGroups.length ? `<div class="constructionRuleGroupsGrid">${ruleGroups.map(([category, rules]) => {
    const isEstablishmentGroup = category === establishmentCategory;
    const isOpen = state.expandedConstructionRuleCategory === category || !state.expandedConstructionRuleCategory && isEstablishmentGroup;
    return `<section class="unavailableGroup ${isEstablishmentGroup ? "establishmentRuleGroup" : ""}">
              <button class="${isOpen ? "active" : ""}" data-toggle-construction-rule-category="${escapeHtml(category)}">
                <span>${escapeHtml(category)}</span>
                <span>${rules.length} · ${isOpen ? "Masquer" : "Afficher"}</span>
              </button>
              ${isOpen ? `<div class="constructionRulesGrid">${rules.map(rule => `<article class="constructionRuleCard ${isEstablishmentGroup ? "establishmentRuleCard" : ""}">
                <div class="constructionRuleCardHead">
                  <strong>${escapeHtml(rule.title)}</strong>
                </div>
                <span>${escapeHtml(rule.detail)}</span>
              </article>`).join("")}</div>` : ""}
            </section>`;
  }).join("")}</div>` : `<div class="alertEmpty">Aucune règle active.</div>`}
          </div>
        </section>`;
}
