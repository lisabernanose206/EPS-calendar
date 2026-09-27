import { render } from "./render.js";
import { state } from "./state.js";
import { acceptEtabInvite, cleanAuthUrl, ensureCurrentUserEtab, handleOAuthRedirect, isSignedIn, fetchAuthUser, saveAdminSession } from "../services/auth.js";
import { cloudReady, ensureCloudSessionFresh, hasPendingCloudSave, requestInitialCloudLoad, restartCloudAutoRefresh } from "../services/cloud.js";
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
    try {
      await ensureCloudSessionFresh();
      const user = await fetchAuthUser(state.adminSession.access_token);
      saveAdminSession({ ...state.adminSession, user });
      if (state.authInviteToken) {
        await acceptEtabInvite(state.authInviteToken, { preserveCurrent: false });
        cleanAuthUrl(true);
      }
      await ensureCurrentUserEtab();
      state.authReady = true;
      render();
      requestInitialCloudLoad(false, true);
    } catch {
      saveAdminSession(null);
      state.authStatus = "Connexion non vérifiée. Reconnectez-vous pour lire Supabase.";
      render();
    }
  }
  window.addEventListener("beforeunload", event => {
    if (!hasPendingCloudSave()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  if (!cloudReady() || !state.cloudConfig.autoLoad || !isSignedIn()) restartCloudAutoRefresh();
}
