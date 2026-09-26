import { state } from "../app/state.js";

export function renderBugFixLogView() {
  const source = window.__EPS_BUG_FIX_LOG__ || state.fallbackBugFixLog;
  const entries = source.split("\n").map(line => line.trim()).filter(line => line.startsWith("- ")).map(line => {
    const text = line.slice(2).replace(/`/g, "");
    const separator = text.indexOf(" : ");
    return separator >= 0 ? {
      title: text.slice(0, separator),
      details: text.slice(separator + 3)
    } : {
      title: text,
      details: ""
    };
  });
  const groups = entries.reduce((items, entry) => {
    const title = entry.title || "General";
    if (!items[title]) items[title] = [];
    items[title].push(entry.details || entry.title);
    return items;
  }, {});
  return `<section class="logPage">
          <h2>Log des corrections</h2>
          <article class="alertHelp">
            <strong>Historique simple</strong>
            <span>Liste des corrections et améliorations apportées au logiciel au fil des mises à jour.</span>
          </article>
          ${Object.keys(groups).length ? `<div class="logGroupGrid">${Object.entries(groups).map(([title, items]) => `
              <details class="logGroup">
                <summary>${title}<span>${items.length}</span></summary>
                <div class="logEntries">
                  ${items.map(item => `<p class="logEntry">${item}</p>`).join("")}
                </div>
              </details>
            `).join("")}</div>` : `<div class="alertEmpty">Aucune entree pour le moment.</div>`}
        </section>`;
}
