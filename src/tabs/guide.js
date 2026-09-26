import { isAdmin } from "../services/auth.js";
import { renderConstructionRulesView } from "./rules.js";

export function renderGuideView() {
  const adminSteps = [["1. Pré-requis établissement", "Renseignez l’établissement, les profs, les classes, les installations et les activités via les sous-onglets. Verrouillez cette partie une fois stabilisée."], ["2. Pré-requis année scolaire", "Renseignez les indisponibilités, cycles, AS, événements sportifs et le service via les sous-onglets."], ["3. Construction", "Cliquez sur une case du tableau pour créer un créneau de cours quand les pré-requis sont valides et déverrouillés si besoin."], ["Vérification", "Consultez Année scolaire, Emploi du temps et Résumé cycle avant export."]];
  const professorSteps = [["Emploi du temps", "Consultez la semaine sélectionnée avec les cours, AS et événements visibles."], ["Année scolaire", "Visualisez toute l'année, sélectionnez une semaine et ouvrez le détail des cases."], ["Résumé cycle", "Contrôlez rapidement les cours d'un cycle par installation et par semaine A/B."]];
  const adminGuide = isAdmin() ? `
          <div class="guideOverviewColumn">
            <article class="alertHelp">
              <strong>Parcours Admin conseillé</strong>
              <span>Suivez ces étapes pour éviter les oublis et les conflits au moment de construire l'emploi du temps.</span>
            </article>
            <div class="guideGrid">
              ${adminSteps.map(([title, detail]) => `<article class="guideCard"><strong>${title}</strong><span>${detail}</span></article>`).join("")}
            </div>
          </div>` : "";
  return `<section class="guidePage">
          <h2>Mode d'emploi</h2>
          <div class="guideOverviewGrid">
            ${adminGuide}
            <div class="guideOverviewColumn">
              <article class="alertHelp">
                <strong>Vue Professeur</strong>
                <span>${isAdmin() ? "Ces onglets servent surtout à consulter le planning construit." : "Vous voyez ici les onglets utiles pour consulter le planning construit."}</span>
              </article>
              <div class="guideGrid guideProfessorGrid">
                ${professorSteps.map(([title, detail]) => `<article class="guideCard"><strong>${title}</strong><span>${detail}</span></article>`).join("")}
              </div>
            </div>
          </div>
          ${renderConstructionRulesView()}
        </section>`;
}
