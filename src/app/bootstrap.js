import { render } from "./render.js";
import { state } from "./state.js";
import { acceptEtabInvite, cleanAuthUrl, ensureCurrentUserEtab, handleOAuthRedirect, isSignedIn } from "../services/auth.js";
import { cloudReady, requestInitialCloudLoad, restartCloudAutoRefresh } from "../services/cloud.js";
import { refreshConstructionPlanFromRulesLocalOnly } from "../services/settings-storage.js";

export async function bootstrapApp() {
  refreshConstructionPlanFromRulesLocalOnly();
  try {
    await handleOAuthRedirect();
  } catch (error) {
    state.authStatus = `Retour OAuth impossible : ${error.message || "erreur inconnue"}`;
  }
  const logoutWarning = sessionStorage.getItem("planningEpsLogoutWarning");
  if (logoutWarning) {
    state.authStatus = logoutWarning;
    sessionStorage.removeItem("planningEpsLogoutWarning");
  }
  render();
  if (isSignedIn()) {
    setTimeout(async () => {
      if (state.authInviteToken) {
        try {
          state.authStatus = "Invitation équipe EPS détectée...";
          render();
          await acceptEtabInvite(state.authInviteToken, {
            preserveCurrent: false
          });
          state.authStatus = "Invitation acceptée. Vous avez rejoint l'équipe EPS.";
          cleanAuthUrl(true);
        } catch (error) {
          state.authStatus = `Invitation impossible : ${error.message || "erreur inconnue"}`;
        }
      } else {
        await ensureCurrentUserEtab();
      }
      render();
      requestInitialCloudLoad(false, true);
    }, 0);
  }
  if (!cloudReady() || !state.cloudConfig.autoLoad || !isSignedIn()) {
    restartCloudAutoRefresh();
  }
}
