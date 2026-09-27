import { pageMemory } from "../services/page-memory.js";
import { safeHtml } from "../security/html.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { adminStepComplete, canAccessConstructionPlanning } from "../domain/readiness.js";
import { cycleLabel } from "../domain/settings.js";
import { currentEtabRoleLabel, currentLousticIconSrc, isAdmin, isSignedIn, renderBrandEtabName, renderShareInviteControl, setActiveEtabFromRow, setDefaultEtabId, signOutAdmin, startOAuthProvider } from "../services/auth.js";
import { clearPlanningMemoryForEtabSwitch, discardLocalChangesFromCloudSoon, hasPendingCloudSave, resetCloudLoadState, resetPlanningStateFromDefaults, requestInitialCloudLoad } from "../services/cloud.js";
import { showValidationPopup } from "./feedback.js";
import { escapeHtml } from "./format.js";

export function renderAuthBox() {
  const authBox = document.getElementById("authBox");
  renderBrandEtabName();
  if (!authBox) return;
  if (isSignedIn()) {
    authBox.innerHTML = safeHtml(`
            <div class="authStatus">Connecté : ${escapeHtml(state.adminSession.user?.email || "utilisateur Supabase")}${state.cloudConfig.etabId ? ` · ${currentEtabRoleLabel()}` : ""}</div>
            ${!state.cloudConfig.etabId && state.authInviteToken ? `<form class="authForm" id="acceptInviteForm"><button class="authButton" type="submit">Rejoindre l'équipe EPS</button></form>` : ""}
            ${state.cloudConfig.etabId && state.authInviteToken ? `<form class="authForm" id="acceptInviteForm"><button class="authButton" type="submit">Ajouter cet établissement</button></form>` : ""}
            ${!state.cloudConfig.etabId && !state.authInviteToken ? `<form class="authForm" id="joinInviteForm"><input id="authInviteCode" value="${escapeHtml(state.authInviteCodeDraft)}" placeholder="Lien ou code d’invitation" aria-label="Lien ou code d’invitation" /><button class="authButton" type="submit">Rejoindre l'équipe EPS</button></form><div class="authStatus">Collez le lien d'invitation envoyé par l'équipe EPS de l'établissement.</div>` : ""}
            ${state.cloudConfig.etabId && !state.currentEtabRole ? `<div class="authStatus">Vérification du rôle en cours...</div>` : ""}
            ${state.cloudConfig.etabId && isAdmin() ? `<div class="authForm">${renderShareInviteControl()}</div>` : ""}
            ${state.authStatus ? `<div class="authStatus">${escapeHtml(state.authStatus)}</div>` : ""}
            <button class="authButton secondary" id="logoutAdmin">Déconnexion</button>
          `);
    authBox.querySelector(".authStatus").innerHTML = safeHtml(`Connecté : ${escapeHtml(state.adminSession.user?.email || "utilisateur Supabase")}${state.cloudConfig.etabId ? ` &middot; ${currentEtabRoleLabel()}` : ""}`);
    authBox.querySelector("#logoutAdmin").innerHTML = safeHtml("Déconnexion");
    return;
  }
  authBox.innerHTML = safeHtml("");
}
export function renderLoggedOutHome() {
  return `<section class="homeShell">
          <div class="homeHero">
            <div class="homeHeroContent">
              <div class="homeBeforeAfter">
                <article class="homeComparisonCard">
                  <img src="./assets/before_loustic.png" alt="Avant Loustic" />
                  <strong>Avant Loustic</strong>
                  <span>Des contraintes partout, un planning difficile à stabiliser.</span>
                </article>
                <article class="homeComparisonCard">
                  <img src="./assets/after_loustic.png" alt="Après Loustic" />
                  <strong>Après Loustic</strong>
                  <span>Un espace clair pour construire, consulter et partager l'organisation EPS.</span>
                </article>
              </div>
            </div>
          </div>
          <aside class="homePanel">
            <div class="homePanelLogo">
              <img src="${currentLousticIconSrc()}" alt="Logo Loustic" />
              <div><strong>Loustic</strong><span>Planning EPS collaboratif</span></div>
            </div>
            <div>
              <div class="homeKicker">Planning EPS simplifie</div>
              <h3>Construisez votre planning sans y passer vos soirees.</h3>
            </div>
            <p>Loustic centralise l'emploi du temps EPS de l’établissement et aide l’équipe à garder une organisation claire, partagée et facile à ajuster.</p>
            ${state.authInviteToken ? `<div class="homeInviteNotice">Lien d’invitation détecté. Créez ou connectez votre compte pour rejoindre automatiquement l'équipe EPS de l'établissement.</div>` : ""}
            <button class="authButton googleAuthButton" type="button" data-oauth-provider="google"><span class="googleAuthIcon" aria-hidden="true">G</span><span>${state.authInviteToken ? "Créer / connecter mon compte et rejoindre l'équipe EPS" : "Connexion via Google"}</span></button>
            <div class="homeFeatures">
              <div class="homeFeature"><span class="homeFeatureIcon">✓</span><div class="homeFeatureText"><strong>Emploi du temps lisible</strong><span>Visualisez les semaines, les profs, les classes et les créneaux en un coup d'oeil.</span></div></div>
              <div class="homeFeature"><span class="homeFeatureIcon">↻</span><div class="homeFeatureText"><strong>Cycles et installations</strong><span>Construisez vos cycles avec les activités, les lieux disponibles et les contraintes de l’établissement.</span></div></div>
              <div class="homeFeature"><span class="homeFeatureIcon">+</span><div class="homeFeatureText"><strong>Travail d'équipe</strong><span>Invitez les collègues en consultation ou en admin, chacun dans le même espace EPS sécurisé.</span></div></div>
            </div>
            ${state.authInviteStatus ? `<div class="authStatus">${escapeHtml(state.authInviteStatus)}</div>` : ""}
            ${state.authStatus ? `<div class="authStatus">${escapeHtml(state.authStatus)}</div>` : ""}
          </aside>
        </section>`;
}
export function updateNavigationActive() {
  const cycleSummaryNavButton = document.getElementById("cycleSummaryNavButton");
  if (cycleSummaryNavButton) cycleSummaryNavButton.textContent = `Résumé ${cycleLabel(true)}`;
  document.querySelectorAll("[data-week]").forEach(item => {
    const buildMode = item.dataset.buildMode || "";
    const isActive = buildMode ? state.week === "build" && state.constructionMode === buildMode : item.dataset.week === state.week && state.week !== "build";
    item.classList.toggle("active", isActive);
    const tracksProgress = Boolean(buildMode && buildMode !== "planning");
    const complete = tracksProgress && adminStepComplete(buildMode);
    item.classList.toggle("stepComplete", complete);
    item.classList.toggle("stepIncomplete", tracksProgress && !complete);
    if (buildMode === "planning") {
      const locked = !canAccessConstructionPlanning();
      item.disabled = locked;
      item.title = locked ? "Complétez les prérequis avant d’accéder à Construction." : "";
    }
  });
}
export function attachAuthControls() {
  document.querySelectorAll("[data-oauth-provider]").forEach(button => {
    button.addEventListener("click", () => startOAuthProvider(button.dataset.oauthProvider));
  });
  const openEtabSwitch = document.getElementById("openEtabSwitch");
  if (openEtabSwitch) openEtabSwitch.addEventListener("click", () => {
    state.authSwitchModalOpen = true;
    render();
  });
  const shareInviteToggle = document.getElementById("shareInviteToggle");
  if (shareInviteToggle) shareInviteToggle.addEventListener("click", () => {
    state.authInviteModalOpen = true;
    state.authInviteMenuOpen = false;
    render();
  });
  const logoutAdmin = document.getElementById("logoutAdmin");
  if (logoutAdmin) logoutAdmin.addEventListener("click", signOutAdmin);
  document.querySelectorAll("[data-set-default-etab]").forEach(button => {
    button.addEventListener("click", async () => {
      const etabId = button.dataset.setDefaultEtab;
      const etab = state.currentUserEtabs.find(item => item.etab_id === etabId) || null;
      if (!etabId) return;
      try {
        await setDefaultEtabId(etabId);
      } catch (error) {
        showValidationPopup(error.message, "error");
        render();
        return;
      }
      state.authStatus = `Établissement par défaut : ${etab?.etab_name || etabId}`;
      showValidationPopup("Établissement défini par défaut");
      render();
    });
  });
  document.querySelectorAll("[data-close-switch-modal]").forEach(target => {
    target.addEventListener("click", event => {
      if (target.classList.contains("modalBackdrop") && event.target !== target) return;
      state.authSwitchModalOpen = false;
      render();
    });
  });
  document.querySelectorAll("[data-switch-etab]").forEach(button => {
    button.addEventListener("click", () => {
      const selected = state.currentUserEtabs.find(item => item.etab_id === button.dataset.switchEtab);
      if (!selected || selected.etab_id === state.cloudConfig.etabId) return;
      if (!window.confirm(`Changer vers ${selected.etab_name || selected.etab_id} ?\n\nLes données seront relues depuis Supabase pour cet établissement.`)) return;
      if (hasPendingCloudSave() && !window.confirm("Une sauvegarde cloud est encore en attente. Changer d'établissement peut ignorer cette modification locale. Continuer ?")) {
        return;
      }
      discardLocalChangesFromCloudSoon();
      setActiveEtabFromRow(selected);
      clearPlanningMemoryForEtabSwitch();
      resetCloudLoadState();
      state.authStatus = `Établissement actif : ${selected.etab_name || selected.etab_id}`;
      resetPlanningStateFromDefaults();
      state.authSwitchModalOpen = false;
      state.week = "current";
      render();
      requestInitialCloudLoad(false, true);
    });
  });
}
export function bindShellNavigation() {
  document.querySelectorAll("[data-week]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      if (!isAdmin() && button.dataset.week === "build") {
        state.authStatus = "Connexion Supabase requise.";
        render();
        return;
      }
      state.week = button.dataset.week;
      if (state.week === "current") state.displayedCurrentWeekRank = null;
      if (state.week === "build") state.constructionMode = button.dataset.buildMode || "planning";
      updateNavigationActive();
      render();
    });
  });
  state.sidebarToggle = document.getElementById("sidebarToggle");
  if (state.sidebarToggle) {
    state.sidebarToggle.addEventListener("click", () => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      pageMemory.setItem("planningEpsSidebarCollapsed2026", state.sidebarCollapsed ? "true" : "false");
      render();
    });
  }
}
