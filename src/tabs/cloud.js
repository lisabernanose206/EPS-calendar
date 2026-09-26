import { escapeHtml } from "../ui/format.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { cloudConfigSavedMessage, cloudLoadFromRemote, cloudReady, cloudSaveToRemote, cloudSourceReadyForWrite, cloudWriteBlockedMessage, markLocalChangedForCloud, readCloudConfigInputs, restartCloudAutoRefresh, saveCloudConfig } from "../services/cloud.js";

export function renderCloudSettings() {
  return `<section class="cloudPage">
          <div class="cloudPanel">
            <h3>Synchronisation cloud</h3>
            <p class="muted">Les modifications faites sur le vrai site sont sauvegardées dans Supabase. Au démarrage, le planning cloud est rechargé ; ensuite, seuls les ajouts et suppressions déclenchent une sauvegarde.</p>
            <div class="cloudGrid">
              <div class="cloudField">
                <label>URL Supabase</label>
                <input id="cloudUrl" value="${escapeHtml((state.cloudConfig.url || ""))}" placeholder="https://xxxxx.supabase.co" />
              </div>
              <div class="cloudField">
                <label>Clé publique anon</label>
                <input id="cloudAnonKey" value="${escapeHtml((state.cloudConfig.anonKey || ""))}" placeholder="eyJhbGci..." />
              </div>
              <div class="cloudField">
                <label>etab_id</label>
                <input id="cloudEtabId" value="${escapeHtml((state.cloudConfig.etabId || ""))}" placeholder="UUID de l’établissement" />
              </div>
              <div class="cloudField">
                <label>Identifiant du planning</label>
                <input id="cloudPlanningId" value="${escapeHtml((state.cloudConfig.planningId || "planning-eps-2026-2027"))}" />
              </div>
              <div class="cloudField">
                <label>Options</label>
                <div class="choiceGrid">
                  <button class="choiceButton ${state.cloudConfig.enabled ? "active" : ""}" data-cloud-toggle="enabled">${state.cloudConfig.enabled ? "Cloud actif" : "Cloud inactif"}</button>
                  <button class="choiceButton ${state.cloudConfig.autoSave ? "active" : ""}" data-cloud-toggle="autoSave">Autosauvegarde</button>
                  <button class="choiceButton active" data-cloud-toggle="autoLoad" disabled>Chargement au demarrage</button>
                </div>
              </div>
            </div>
            <div class="cloudActions">
              <button class="ghostButton" id="saveCloudConfig">Enregistrer la configuration</button>
              <button class="ghostButton" id="pushCloudNow" ${!cloudSourceReadyForWrite() || state.cloudSyncing ? "disabled" : ""} title="${cloudSourceReadyForWrite() ? "Envoyer vers Supabase" : cloudWriteBlockedMessage()}">Envoyer ce planning vers le cloud</button>
              <button class="ghostButton" id="pullCloudNow" ${!cloudReady() || state.cloudSyncing ? "disabled" : ""}>Charger le planning cloud</button>
            </div>
            <div class="cloudStatus">${escapeHtml(state.cloudStatus)}</div>
          </div>
          <div class="cloudPanel">
            <h3>Configuration du serveur</h3>
            <p class="muted">La configuration des tables et des autorisations est réservée à l’administrateur Supabase. Consultez la documentation du projet.</p>
          </div>
        </section>`;
}
export function bindCloudEvents() {
  document.querySelectorAll("[data-cloud-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.cloudToggle;
      readCloudConfigInputs();
      state.cloudConfig = {
        ...state.cloudConfig,
        [key]: !state.cloudConfig[key]
      };
      saveCloudConfig();
      state.cloudStatus = cloudConfigSavedMessage();
      restartCloudAutoRefresh();
      render();
    });
  });
  const saveCloudConfigButton = document.getElementById("saveCloudConfig");
  if (saveCloudConfigButton) {
    saveCloudConfigButton.addEventListener("click", () => {
      readCloudConfigInputs();
      saveCloudConfig();
      state.cloudStatus = cloudConfigSavedMessage();
      restartCloudAutoRefresh();
      render();
    });
  }
  const pushCloudNow = document.getElementById("pushCloudNow");
  if (pushCloudNow) pushCloudNow.addEventListener("click", () => {
    readCloudConfigInputs();
    saveCloudConfig();
    markLocalChangedForCloud(state.cloudDataKeys);
    cloudSaveToRemote(true);
  });
  const pullCloudNow = document.getElementById("pullCloudNow");
  if (pullCloudNow) pullCloudNow.addEventListener("click", () => {
    readCloudConfigInputs();
    saveCloudConfig();
    cloudLoadFromRemote(true, false, true);
  });
}
