import { pageMemory } from "./page-memory.js";
import { fetchBackend } from "../security/fetch.js";
import { createOAuthChallenge, consumeOAuthVerifier, clearOAuthVerifier } from "../security/oauth.js";
import { secureBackendUrl } from "../security/transport.js";
import { securityEvent } from "../security/log.js";
import { safeHtml } from "../security/html.js";
import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { conflictsForBuildMode } from "../domain/assignments.js";
import { adminStepComplete, constructionBlocksStepComplete, constructionCycleDetailsStepComplete } from "../domain/readiness.js";
import { clearPlanningMemoryForEtabSwitch, cloudAnonAuthHeaders, cloudFetchWithAuthRetry, cloudReady, etabByIdQuery, etabMembersEndpoint, etabsEndpoint, requestInitialCloudLoad, resetCloudLoadState, resetPlanningStateFromDefaults, saveCloudConfig } from "./cloud.js";
import { escapeHtml } from "../ui/format.js";

export function authEndpoint(path) {
  const base = secureBackendUrl(state.cloudConfig.url);
  return `${base}/auth/v1/${path}`;
}
export function rpcEndpoint(name) {
  const base = secureBackendUrl(state.cloudConfig.url);
  return `${base}/rest/v1/rpc/${name}`;
}
export function inviteTokenFromUrl() {
  try {
    const token = new URL(window.location.href).searchParams.get("invite") || "";
    if (token) pageMemory.setItem(state.AUTH_INVITE_KEY, token);
    return token;
  } catch {
    return "";
  }
}
export function normalizeInviteToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).searchParams.get("invite") || raw;
  } catch {
    return raw;
  }
}
export function inviteLinkForToken(token) {
  const url = new URL(window.location.href);
  url.searchParams.set("invite", token);
  return url.toString();
}
export function cleanAuthUrl(removeInvite = false) {
  try {
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.delete("code");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    if (removeInvite) url.searchParams.delete("invite");
    window.history.replaceState({}, document.title, url.toString());
  } catch {}
}
export function oauthRedirectUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  for (const key of ["code", "error", "error_description"]) url.searchParams.delete(key);
  return url.toString();
}
export async function startOAuthProvider(provider) {
  try {
    if (provider !== "google" || !state.cloudConfig.anonKey) throw new Error("Configuration de connexion invalide.");
    if (state.authInviteToken) pageMemory.setItem(state.AUTH_INVITE_KEY, state.authInviteToken);
    const redirect = oauthRedirectUrl();
    const challenge = await createOAuthChallenge(state.cloudConfig.url, redirect);
    const target = new URL(authEndpoint("authorize"));
    target.search = new URLSearchParams({ provider, redirect_to: redirect, code_challenge: challenge, code_challenge_method: "s256" }).toString();
    window.location.assign(target.toString());
  } catch {
    securityEvent("oauth_failed");
    state.authStatus = "Connexion impossible. Ouvrez le site en HTTPS et réessayez.";
    render();
  }
}
export async function fetchAuthUser(accessToken) {
  const response = await fetchBackend(authEndpoint("user"), {
    headers: { apikey: state.cloudConfig.anonKey, Authorization: "Bearer " + accessToken, "Content-Type": "application/json" }
  });
  if (!response.ok) throw new Error("Session refusée. Relancez la connexion.");
  const user = await response.json();
  if (!user || typeof user.id !== "string" || !user.id) throw new Error("Utilisateur non vérifié.");
  return user;
}
export async function handleOAuthRedirect() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const error = url.searchParams.get("error_description") || url.searchParams.get("error") || hash.get("error_description") || hash.get("error");
  const code = url.searchParams.get("code");
  if (!error && !code && !hash.has("access_token")) return false;
  const redirect = oauthRedirectUrl();
  // Remove credentials from the address immediately, including on network errors.
  cleanAuthUrl(false);
  try {
    if (error) throw new Error("Connexion OAuth refusée : " + error);
    if (!code) throw new Error("Ancien lien de connexion refusé. Relancez la connexion Google.");
    const verifier = consumeOAuthVerifier(state.cloudConfig.url, redirect);
    const response = await fetchBackend(authEndpoint("token") + "?grant_type=pkce", {
      method: "POST",
      headers: { apikey: state.cloudConfig.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier })
    });
    if (!response.ok) throw new Error("Échange de connexion refusé. Relancez la connexion.");
    const result = await response.json();
    if (typeof result.access_token !== "string" || !result.access_token || typeof result.refresh_token !== "string" || !result.refresh_token) throw new Error("Session incomplète.");
    const user = await fetchAuthUser(result.access_token);
    saveAdminSession({ access_token: result.access_token, refresh_token: result.refresh_token, token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + (Number(result.expires_in) || 3600), user });
    const token = state.authInviteToken || pageMemory.getItem(state.AUTH_INVITE_KEY) || "";
    if (token) {
      await acceptEtabInvite(token, { preserveCurrent: false });
      state.authStatus = "Invitation acceptée. Vous avez rejoint l'équipe EPS.";
      cleanAuthUrl(true);
    } else {
      await ensureCurrentUserEtab();
      state.authStatus = "";
    }
    requestInitialCloudLoad(false, true);
  } catch (error) {
    securityEvent("oauth_failed");
    state.authStatus = error.message || "Connexion impossible.";
  } finally {
    clearOAuthVerifier();
  }
  return true;
}
export function loadAdminSession() {
  try {
    const saved = sessionStorage.getItem(state.AUTH_SESSION_KEY);
    if (!saved) return null;
    const session = JSON.parse(saved);
    const expiresAt = Number(session.expires_at || 0) * 1000;
    return session.access_token && (!expiresAt || expiresAt > Date.now() || session.refresh_token) ? session : null;
  } catch {
    return null;
  }
}
export function saveAdminSession(session) {
  state.adminSession = session;
  if (session) {
    // Persist authentication only, never planning, roles or user preferences.
    const { access_token, refresh_token, expires_at, expires_in, token_type } = session;
    const user = session.user ? { id: session.user.id, email: session.user.email } : null;
    sessionStorage.setItem(state.AUTH_SESSION_KEY, JSON.stringify({ access_token, refresh_token, expires_at, expires_in, token_type, user }));
  } else {
    sessionStorage.removeItem(state.AUTH_SESSION_KEY);
    state.currentEtabRole = "";
    state.currentEtabName = "";
    state.currentUserEtabs = [];
    pageMemory.removeItem(state.AUTH_ROLE_KEY);
    pageMemory.removeItem(state.AUTH_ETAB_NAME_KEY);
  }
}
export function isSignedIn() {
  return Boolean(state.adminSession?.access_token);
}
export function normalizeEtabRole(role) {
  return role === "owner" ? "owner" : role ? "member" : "";
}
export function setCurrentEtabRole(role) {
  state.currentEtabRole = normalizeEtabRole(role);
  if (state.currentEtabRole) pageMemory.setItem(state.AUTH_ROLE_KEY, state.currentEtabRole);else pageMemory.removeItem(state.AUTH_ROLE_KEY);
  return state.currentEtabRole;
}
export function setCurrentEtabName(name) {
  state.currentEtabName = normalizeEtabDisplayName(name);
  if (state.currentEtabName) pageMemory.setItem(state.AUTH_ETAB_NAME_KEY, state.currentEtabName);else pageMemory.removeItem(state.AUTH_ETAB_NAME_KEY);
  return state.currentEtabName;
}
export function currentAuthUserId() {
  return state.adminSession?.user?.id || state.adminSession?.user?.email || "";
}
export function getDefaultEtabId() {
  return String(state.adminSession?.user?.user_metadata?.eps_default_etab_id || "");
}
export async function setDefaultEtabId(etabId) {
  const userId = currentAuthUserId();
  if (!userId || !state.currentUserEtabs.some(item => item.etab_id === etabId)) throw new Error("Établissement non autorisé.");
  const response = await cloudFetchWithAuthRetry(authEndpoint("user"), {
    method: "PUT",
    body: JSON.stringify({ data: { eps_default_etab_id: etabId } })
  });
  if (!response.ok) throw new Error("Préférence non enregistrée dans Supabase.");
  const user = await response.json();
  if (currentAuthUserId() !== userId || user.id !== userId) throw new Error("Le compte a changé.");
  if (user.user_metadata?.eps_default_etab_id !== etabId) throw new Error("Préférence non confirmée par Supabase.");
  state.adminSession.user = user;
  return etabId;
}
export function isAdmin() {
  return isSignedIn() && state.currentEtabRole === "owner";
}
export function currentEtabRoleLabel() {
  if (!state.cloudConfig.etabId) return "";
  return state.currentEtabRole || "non lie";
}
export function currentEtabDisplayName() {
  return normalizeEtabDisplayName(state.currentEtabName || state.schoolConstraints.establishmentName || state.cloudConfig.etabId || "");
}
export function constructionFinalizedForLousticMood() {
  try {
    return constructionBlocksStepComplete() && constructionCycleDetailsStepComplete() && !conflictsForBuildMode("blocks").length && !conflictsForBuildMode("cycleDetails").length;
  } catch (error) {
    return false;
  }
}
export function currentLousticIconSrc() {
  const prerequisitesReady = adminStepComplete("prerequisites");
  const yearReady = prerequisitesReady && adminStepComplete("yearPrerequisites");
  const constructionReady = yearReady && constructionFinalizedForLousticMood();
  const step = constructionReady ? 3 : yearReady ? 2 : prerequisitesReady ? 1 : 0;
  const fileName = step ? `icon_app_small_step${step}.png` : "icon_app_small.png";
  return `./assets/${fileName}?v=${step || "base"}`;
}
export function normalizeEtabDisplayName(name) {
  const value = String(name || "").trim();
  if (/^louise\s+michele$/i.test(value)) return "Louise Michel";
  return value;
}
export function inviteMailtoLink() {
  if (!state.authInviteLink) return "";
  const etabName = currentEtabDisplayName() || "l'équipe EPS";
  const subject = `Invitation équipe EPS - ${etabName}`;
  const body = ["Bonjour,", "", `Je t'invite a rejoindre l'espace EPS de l’établissement ${etabName}.`, "Ce lien est personnel et utilisable une seule fois.", "", "Lien d'acces :", state.authInviteLink, "", "Tu pourras te connecter avec ton compte Google."].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function renderShareInviteControl() {
  if (!state.cloudConfig.etabId || !isAdmin()) return "";
  return `<div class="shareInviteWrap">
          <button class="shareInviteButton" type="button" id="shareInviteToggle" aria-label="Partager une invitation" title="Partager une invitation">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 1.17 2.37l-7.1 3.55a3 3 0 1 0 0 4.16l7.1 3.55A3 3 0 1 0 17 16.1l-7.1-3.55a3.2 3.2 0 0 0 0-1.1l7.1-3.55c.32.06.65.08 1 .08Z" fill="currentColor"/>
            </svg>
          </button>
        </div>`;
}
export function renderShareInviteModal() {
  if (!state.authInviteModalOpen || !state.cloudConfig.etabId || !isAdmin()) return "";
  const selectedRoleLabel = state.authInviteRole === "owner" ? "admin" : "consultation";
  return `<div class="modalBackdrop" data-close-invite-modal role="presentation">
          <div class="modal inviteModalCard" role="dialog" aria-modal="true" aria-label="Partager une invitation équipe EPS" data-modal-card>
            <div class="modalHeader">
              <div>
                <h3>Partager l'accès à ${escapeHtml(currentEtabDisplayName() || "l'établissement")}</h3>
                <p class="muted">Créez un lien d'invitation unique, utilisable une seule fois, puis copiez-le ou envoyez-le directement par mail.</p>
              </div>
              <button class="modalClose" type="button" data-close-invite-modal aria-label="Fermer">x</button>
            </div>
            <div class="inviteModalBody">
              <div class="inviteRoleGrid">
                <button class="inviteRoleButton ${state.authInviteRole === "member" ? "active" : ""}" type="button" data-create-invite-link="member">
                  <strong>Consultation</strong>
                  <span>Accès professeur uniquement, sans partie Admin.</span>
                </button>
                <button class="inviteRoleButton ${state.authInviteRole === "owner" ? "active" : ""}" type="button" data-create-invite-link="owner">
                  <strong>Admin</strong>
                  <span>Accès complet à la configuration de l'équipe EPS.</span>
                </button>
              </div>
              <div class="inviteLinkBox">
                <label class="muted">Lien ${selectedRoleLabel}</label>
                <input id="inviteLinkInput" value="${escapeHtml(state.authInviteLink)}" readonly placeholder="Choisissez Consultation ou Admin pour générer un lien." aria-label="Lien d'invitation équipe EPS" />
              </div>
              ${state.authInviteStatus ? `<div class="authStatus">${escapeHtml(state.authInviteStatus)}</div>` : ""}
              <div class="inviteActions">
                <button class="ghostButton" type="button" data-copy-invite-link ${state.authInviteLink ? "" : "disabled"}>Copier le lien</button>
                <a class="mailInviteButton ${state.authInviteLink ? "" : "disabled"}" ${state.authInviteLink ? `href="${inviteMailtoLink()}"` : `aria-disabled="true"`}>Envoyer par mail</a>
              </div>
            </div>
          </div>
        </div>`;
}
export function renderEtabSwitchModal() {
  if (!state.authSwitchModalOpen || !isSignedIn() || state.currentUserEtabs.length <= 1) return "";
  const defaultEtabId = getDefaultEtabId();
  const otherEtabs = state.currentUserEtabs.filter(item => item.etab_id !== state.cloudConfig.etabId);
  return `<div class="modalBackdrop" data-close-switch-modal role="presentation">
          <div class="modal inviteModalCard" role="dialog" aria-modal="true" aria-label="Changer d'établissement" data-modal-card>
            <div class="modalHeader">
              <div>
                <h3>Changer d'établissement</h3>
                <p class="muted">Établissement actif : ${escapeHtml(currentEtabDisplayName() || state.cloudConfig.etabId)}. Le changement recharge les données depuis Supabase.</p>
              </div>
              <button class="modalClose" type="button" data-close-switch-modal aria-label="Fermer">x</button>
            </div>
            <div class="inviteModalBody">
              <div class="inviteRoleGrid">
                ${otherEtabs.map(item => `<button class="inviteRoleButton" type="button" data-switch-etab="${escapeHtml(item.etab_id)}">
                  <strong>${escapeHtml(item.etab_name || item.etab_id)}</strong>
                  <span>${item.role === "owner" ? "admin" : "consultation"}${item.etab_id === defaultEtabId ? " · établissement par défaut" : ""}</span>
                </button>`).join("")}
              </div>
              <div class="authStatus">Chaque établissement reste indépendant : les données seront relues depuis Supabase pour l'établissement choisi.</div>
            </div>
          </div>
        </div>`;
}
export function renderBrandEtabName() {
  const label = document.getElementById("brandEtabName");
  const logo = document.querySelector(".brandTitle .brandLogo");
  const iconSrc = currentLousticIconSrc();
  if (logo) logo.src = iconSrc;
  if (label) {
    if (isSignedIn() && state.currentUserEtabs.length > 1) {
      label.innerHTML = safeHtml(`<span>${escapeHtml(currentEtabDisplayName())}</span><button class="brandSwitchButton" type="button" id="openEtabSwitch" aria-label="Changer d'établissement" title="Changer d'établissement"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 3h10a4 4 0 0 1 4 4v2h-2V7a2 2 0 0 0-2-2H7.83l2.58 2.59L9 9 4 4l5-5 1.41 1.41L7.83 3Zm10 18H7a4 4 0 0 1-4-4v-2h2v2a2 2 0 0 0 2 2h9.17l-2.58-2.59L15 15l5 5-5 5-1.41-1.41L16.17 21Z"/></svg></button>`);
      label.title = currentEtabDisplayName();
    } else {
      label.textContent = state.cloudConfig.etabId ? currentEtabDisplayName() : "";
      label.title = label.textContent;
    }
  }
  document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']").forEach(link => {
    link.href = iconSrc;
  });
}
export async function refreshCurrentEtabRole() {
  if (!isSignedIn() || !state.cloudConfig.etabId) return "";
  const knownEtab = state.currentUserEtabs.find(item => item.etab_id === state.cloudConfig.etabId || item.id === state.cloudConfig.etabId);
  if (knownEtab) {
    setCurrentEtabName(knownEtab.etab_name || knownEtab.name || state.currentEtabName);
    return setCurrentEtabRole(knownEtab.role || "");
  }
  const userEtabResponse = await cloudFetchWithAuthRetry(rpcEndpoint("get_current_user_etab"), {
    method: "POST",
    body: JSON.stringify({})
  });
  if (userEtabResponse.ok) {
    const userEtab = await userEtabResponse.json().catch(() => null);
    const userEtabId = userEtab?.etab_id || userEtab?.id || "";
    if (userEtabId === state.cloudConfig.etabId) {
      setCurrentEtabName(userEtab?.etab_name || userEtab?.name || state.currentEtabName);
      return setCurrentEtabRole(userEtab?.role || "");
    }
  }
  const rpcResponse = await cloudFetchWithAuthRetry(rpcEndpoint("get_current_etab_role"), {
    method: "POST",
    body: JSON.stringify({
      check_etab_id: state.cloudConfig.etabId
    })
  });
  if (rpcResponse.ok) {
    const result = await rpcResponse.json().catch(() => "");
    const role = typeof result === "string" ? result : result?.role || "";
    return setCurrentEtabRole(role);
  }
  const response = await cloudFetchWithAuthRetry(`${etabMembersEndpoint()}?select=role&etab_id=eq.${encodeURIComponent(state.cloudConfig.etabId)}&limit=1`);
  if (!response.ok) throw new Error(await response.text());
  const rows = await response.json();
  return setCurrentEtabRole(rows[0]?.role || "");
}
export function normalizeUserEtabRow(row) {
  const etabId = row?.etab_id || row?.id || "";
  if (!etabId) return null;
  const joinedEtab = Array.isArray(row.etabs) ? row.etabs[0] : row.etabs;
  return {
    etab_id: etabId,
    role: normalizeEtabRole(row.role || ""),
    etab_name: normalizeEtabDisplayName(row.etab_name || row.name || joinedEtab?.name || etabId)
  };
}
export function uniqueUserEtabs(rows = []) {
  const byId = new Map();
  rows.map(normalizeUserEtabRow).filter(Boolean).forEach(item => {
    if (!byId.has(item.etab_id)) byId.set(item.etab_id, item);
  });
  return [...byId.values()];
}
export async function fetchCurrentUserEtabsFromTables() {
  if (!isSignedIn()) return [];
  const userId = state.adminSession?.user?.id || "";
  if (!userId) return [];
  const membersResponse = await cloudFetchWithAuthRetry(`${etabMembersEndpoint()}?select=etab_id,role,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc`);
  if (!membersResponse.ok) throw new Error(await membersResponse.text());
  const memberships = await membersResponse.json().catch(() => []);
  if (!memberships.length) return [];
  const etabIds = memberships.map(item => item.etab_id).filter(Boolean);
  let namesById = {};
  if (etabIds.length) {
    try {
      const etabsResponse = await cloudFetchWithAuthRetry(`${etabsEndpoint()}?select=id,name&id=in.(${etabIds.join(",")})`);
      if (etabsResponse.ok) {
        const etabs = await etabsResponse.json().catch(() => []);
        namesById = Object.fromEntries(etabs.map(item => [item.id, item.name]));
      }
    } catch {
      namesById = {};
    }
  }
  return uniqueUserEtabs(memberships.map(item => ({
    ...item,
    etab_name: namesById[item.etab_id] || item.etab_id
  })));
}
export async function fetchCurrentUserEtabs() {
  if (!isSignedIn()) return [];
  let rpcRows = [];
  try {
    const response = await cloudFetchWithAuthRetry(rpcEndpoint("list_current_user_etabs"), {
      method: "POST",
      body: JSON.stringify({})
    });
    if (response.ok) {
      const result = await response.json().catch(() => []);
      const parsed = typeof result === "string" ? JSON.parse(result) : result;
      const rows = Array.isArray(parsed) ? parsed : parsed?.items || [];
      rpcRows = uniqueUserEtabs(rows);
    }
  } catch (error) {
    // Fallback below for projects where the RPC has not been installed yet.
  }
  try {
    const tableRows = await fetchCurrentUserEtabsFromTables();
    if (tableRows.length >= rpcRows.length) return tableRows;
  } catch (error) {
    // Fallback below.
  }
  if (rpcRows.length) return rpcRows;
  try {
    const response = await cloudFetchWithAuthRetry(`${etabMembersEndpoint()}?select=etab_id,role,etabs(name)&user_id=eq.${encodeURIComponent(state.adminSession?.user?.id || "")}&order=created_at.asc`);
    if (response.ok) {
      const rows = await response.json().catch(() => []);
      return uniqueUserEtabs(rows);
    }
  } catch (error) {
    // Fallback below.
  }
  const fallbackId = await resolveCurrentUserEtabLegacy();
  return fallbackId ? [{
    etab_id: fallbackId,
    role: state.currentEtabRole,
    etab_name: state.currentEtabName || fallbackId
  }] : [];
}
export function etabMemberRoleLabel(role) {
  return normalizeEtabRole(role) === "owner" ? "admin" : "consultation";
}
export function normalizeEtabMemberRow(row) {
  const email = String(row?.email || row?.user_email || row?.mail || row?.user_id || "").trim();
  if (!email) return null;
  return {
    user_id: String(row?.user_id || row?.id || "").trim(),
    email,
    role: normalizeEtabRole(row?.role || "member"),
    is_creator: Boolean(row?.is_creator)
  };
}
export async function fetchEtabMembers(etabId) {
  if (!isSignedIn() || !etabId) return [];
  const response = await cloudFetchWithAuthRetry(rpcEndpoint("list_etab_members"), {
    method: "POST",
    body: JSON.stringify({
      check_etab_id: etabId
    })
  });
  const responseText = await response.text();
  const result = responseText ? (() => {
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  })() : [];
  if (!response.ok) throw new Error(result?.message || result?.error_description || result?.msg || responseText);
  const parsed = typeof result === "string" ? JSON.parse(result) : result;
  const rows = Array.isArray(parsed) ? parsed : parsed?.items || [];
  return rows.map(normalizeEtabMemberRow).filter(Boolean);
}
export async function removeEtabMember(etabId, userId) {
  if (!isSignedIn() || !etabId || !userId) throw new Error("membre introuvable");
  const response = await cloudFetchWithAuthRetry(rpcEndpoint("remove_etab_member"), {
    method: "POST",
    body: JSON.stringify({
      target_etab_id: etabId,
      target_user_id: userId
    })
  });
  const responseText = await response.text();
  const result = responseText ? (() => {
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  })() : null;
  if (!response.ok) throw new Error(result?.message || result?.error_description || result?.msg || responseText);
  state.accountMembersByEtabId = {
    ...state.accountMembersByEtabId,
    [etabId]: (state.accountMembersByEtabId[etabId] || []).filter(member => member.user_id !== userId)
  };
  state.currentUserEtabs = await fetchCurrentUserEtabs();
  return result;
}
export async function promoteEtabMemberToAdmin(etabId, userId) {
  if (!isSignedIn() || !etabId || !userId) throw new Error("membre introuvable");
  const response = await cloudFetchWithAuthRetry(rpcEndpoint("promote_etab_member_to_owner"), {
    method: "POST",
    body: JSON.stringify({
      target_etab_id: etabId,
      target_user_id: userId
    })
  });
  const responseText = await response.text();
  const result = responseText ? (() => {
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  })() : null;
  if (!response.ok) throw new Error(result?.message || result?.error_description || result?.msg || responseText);
  state.accountMembersByEtabId = {
    ...state.accountMembersByEtabId,
    [etabId]: await fetchEtabMembers(etabId)
  };
  state.currentUserEtabs = await fetchCurrentUserEtabs();
  return result;
}
export async function demoteEtabAdminToMember(etabId, userId) {
  if (!isSignedIn() || !etabId || !userId) throw new Error("membre introuvable");
  const response = await cloudFetchWithAuthRetry(rpcEndpoint("demote_etab_owner_to_member"), {
    method: "POST",
    body: JSON.stringify({
      target_etab_id: etabId,
      target_user_id: userId
    })
  });
  const responseText = await response.text();
  const result = responseText ? (() => {
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  })() : null;
  if (!response.ok) throw new Error(result?.message || result?.error_description || result?.msg || responseText);
  state.accountMembersByEtabId = {
    ...state.accountMembersByEtabId,
    [etabId]: await fetchEtabMembers(etabId)
  };
  state.currentUserEtabs = await fetchCurrentUserEtabs();
  return result;
}
export async function transferEtabCreator(etabId, userId) {
  if (!isSignedIn() || !etabId || !userId) throw new Error("membre introuvable");
  const response = await cloudFetchWithAuthRetry(rpcEndpoint("transfer_etab_creator"), {
    method: "POST",
    body: JSON.stringify({
      target_etab_id: etabId,
      target_user_id: userId
    })
  });
  const responseText = await response.text();
  const result = responseText ? (() => {
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  })() : null;
  if (!response.ok) throw new Error(result?.message || result?.error_description || result?.msg || responseText);
  state.accountMembersByEtabId = {
    ...state.accountMembersByEtabId,
    [etabId]: await fetchEtabMembers(etabId)
  };
  state.currentUserEtabs = await fetchCurrentUserEtabs();
  return result;
}
export function refreshAccountMembersForRows(rows = []) {
  if (!isSignedIn()) return;
  const etabIds = rows.map(item => item.etab_id).filter(Boolean);
  if (!etabIds.length) return;
  const key = `${state.adminSession?.user?.id || state.adminSession?.user?.email || ""}::${etabIds.join("|")}`;
  if (state.accountMembersLoading || state.accountMembersRequestKey === key) return;
  state.accountMembersRequestKey = key;
  state.accountMembersLoading = true;
  state.accountMembersStatus = "";
  Promise.all(etabIds.map(async etabId => [etabId, await fetchEtabMembers(etabId)])).then(entries => {
    state.accountMembersByEtabId = {
      ...state.accountMembersByEtabId,
      ...Object.fromEntries(entries)
    };
    state.accountMembersStatus = "";
  }).catch(error => {
    const rawMessage = String(error.message || "");
    const missingFunction = rawMessage.includes("list_etab_members") || rawMessage.includes("schema cache");
    state.accountMembersStatus = missingFunction ? "Membres non chargés : appliquez le SQL cloud mis à jour dans Supabase, puis rechargez le cache/API." : `Membres non chargés : ${rawMessage || "erreur Supabase"}`;
  }).finally(() => {
    state.accountMembersLoading = false;
    if (state.week === "account") render();
  });
}
export function setActiveEtabFromRow(row) {
  const item = normalizeUserEtabRow(row);
  if (!item) return "";
  state.cloudConfig = {
    ...state.cloudConfig,
    etabId: item.etab_id
  };
  saveCloudConfig();
  setCurrentEtabRole(item.role || "");
  setCurrentEtabName(item.etab_name || "");
  return item.etab_id;
}
export async function renameCurrentEtab(name) {
  const label = normalizeEtabDisplayName(name);
  if (!label || !state.cloudConfig.etabId || !isAdmin()) return false;
  const response = await cloudFetchWithAuthRetry(`${etabsEndpoint()}?${etabByIdQuery()}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      name: label
    })
  });
  if (!response.ok) throw new Error(await response.text());
  setCurrentEtabName(label);
  state.currentUserEtabs = state.currentUserEtabs.map(item => item.etab_id === state.cloudConfig.etabId ? {
    ...item,
    etab_name: label
  } : item);
  return true;
}
export function choosePreferredUserEtab(rows = []) {
  const defaultEtabId = getDefaultEtabId();
  return rows.find(item => item.etab_id === state.cloudConfig.etabId) || rows.find(item => item.etab_id === defaultEtabId) || rows[0] || null;
}
export async function refreshCurrentEtabRoleSafe() {
  try {
    return await refreshCurrentEtabRole();
  } catch (error) {
    state.authStatus = `Rôle Établissement non relu : ${error.message || "erreur Supabase"}`;
    setCurrentEtabRole("");
    return "";
  }
}
export async function resolveCurrentUserEtabLegacy() {
  if (!isSignedIn()) return "";
  const response = await cloudFetchWithAuthRetry(rpcEndpoint("get_current_user_etab"), {
    method: "POST",
    body: JSON.stringify({})
  });
  if (!response.ok) {
    if (response.status === 404) return "";
    throw new Error(await response.text());
  }
  const result = await response.json().catch(() => null);
  const etabId = result?.etab_id || result?.id || "";
  if (!etabId) return "";
  state.cloudConfig = {
    ...state.cloudConfig,
    etabId
  };
  saveCloudConfig();
  setCurrentEtabRole(result?.role || "");
  setCurrentEtabName(result?.etab_name || result?.name || "");
  return etabId;
}
export async function resolveCurrentUserEtabs() {
  state.currentUserEtabs = await fetchCurrentUserEtabs();
  if (!state.currentUserEtabs.length) return "";
  const active = choosePreferredUserEtab(state.currentUserEtabs);
  return setActiveEtabFromRow(active);
}
export async function ensureCurrentUserEtab() {
  if (!isSignedIn()) return "";
  try {
    const resolvedEtabId = await resolveCurrentUserEtabs();
    if (resolvedEtabId) return resolvedEtabId;
  } catch (error) {
    state.authStatus = `Établissement non retrouvé automatiquement : ${error.message || "erreur Supabase"}`;
  }
  if (state.cloudConfig.etabId) {
    await refreshCurrentEtabRoleSafe();
    return state.cloudConfig.etabId;
  }
  return "";
}
export async function acceptEtabInvite(token = state.authInviteToken, options = {}) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return "";
  const previousEtab = {
    etab_id: state.cloudConfig.etabId,
    role: state.currentEtabRole,
    etab_name: state.currentEtabName
  };
  const shouldPreserveCurrent = options.preserveCurrent ?? Boolean(previousEtab.etab_id);
  const response = await cloudFetchWithAuthRetry(rpcEndpoint("accept_etab_invite"), {
    method: "POST",
    body: JSON.stringify({
      invite_token: cleanToken
    })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || result?.error_description || result?.msg || (await response.text()));
  const etabId = typeof result === "string" ? result : result?.id || result;
  if (!etabId) throw new Error("etab_id non retourné par Supabase");
  state.currentUserEtabs = await fetchCurrentUserEtabs();
  const invitedEtab = state.currentUserEtabs.find(item => item.etab_id === etabId) || {
    etab_id: etabId,
    role: result?.role || "member",
    etab_name: result?.etab_name || result?.name || etabId
  };
  if (shouldPreserveCurrent && previousEtab.etab_id) {
    const previousKnownEtab = state.currentUserEtabs.find(item => item.etab_id === previousEtab.etab_id) || previousEtab;
    setActiveEtabFromRow(previousKnownEtab);
  } else {
    setActiveEtabFromRow(invitedEtab);
  }
  state.authInviteToken = "";
  pageMemory.removeItem(state.AUTH_INVITE_KEY);
  return etabId;
}
export async function createEtabInvite(role = "member") {
  if (!state.cloudConfig.etabId) throw new Error("aucun Établissement actif");
  const response = await cloudFetchWithAuthRetry(rpcEndpoint("create_etab_invite"), {
    method: "POST",
    body: JSON.stringify({
      invite_etab_id: state.cloudConfig.etabId,
      invite_role: role === "owner" ? "owner" : "member"
    })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || result?.error_description || result?.msg || (await response.text()));
  const token = typeof result === "string" ? result : result?.token || result;
  if (!token) throw new Error("invitation non retournée par Supabase");
  state.authInviteLink = inviteLinkForToken(token);
  return state.authInviteLink;
}
export async function signInAdmin() {
  state.authStatus = "Connexion en cours...";
  render();
  try {
    if (!state.cloudConfig.url || !state.cloudConfig.anonKey) throw new Error("configuration Supabase incomplete");
    const response = await fetchBackend(authEndpoint("token?grant_type=password"), {
      method: "POST",
      headers: cloudAnonAuthHeaders(),
      body: JSON.stringify({
        email: state.authEmail.trim(),
        password: state.authPassword
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error_description || result.msg || result.message || "connexion impossible");
    saveAdminSession(result);
    const hadInvite = Boolean(state.authInviteToken);
    if (hadInvite) await acceptEtabInvite(state.authInviteToken, {
      preserveCurrent: false
    });else await resolveCurrentUserEtabs();
    state.authPassword = "";
    state.authStatus = hadInvite ? "Connexion Supabase active. Vous avez rejoint l'équipe EPS." : cloudReady() ? "Connexion Supabase active." : "Connexion Supabase active. Renseignez l'etab_id pour charger les données.";
    requestInitialCloudLoad(false, true);
  } catch (error) {
    saveAdminSession(null);
    state.authStatus = `Connexion refusée : ${error.message || "identifiants incorrects"}`;
  } finally {
    render();
  }
}
export function etabSlugFromName(name) {
  return String(name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "Établissement";
}
export async function createEtabForCurrentUser(name) {
  const label = String(name || "").trim();
  if (!label) throw new Error("nom d’établissement requis");
  const response = await cloudFetchWithAuthRetry(rpcEndpoint("create_etab_for_current_user"), {
    method: "POST",
    body: JSON.stringify({
      etab_name: label,
      etab_slug: etabSlugFromName(label)
    })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const rawMessage = result?.message || result?.error_description || result?.msg || (await response.text());
    const normalized = String(rawMessage || "").toLowerCase();
    if (normalized.includes("create_etab_for_current_user") || normalized.includes("schema cache")) {
      throw new Error("fonction Supabase create_etab_for_current_user manquante. Lancez le SQL de création des fonctions dans Supabase, puis rechargez le cache/API.");
    }
    throw new Error(rawMessage);
  }
  const etabId = typeof result === "string" ? result : result?.id || result;
  if (!etabId) throw new Error("etab_id non retourné par Supabase");
  state.cloudConfig = {
    ...state.cloudConfig,
    etabId
  };
  saveCloudConfig();
  setCurrentEtabName(label);
  setCurrentEtabRole("owner");
  state.currentUserEtabs = await fetchCurrentUserEtabs();
  return etabId;
}
export async function createAndSwitchToNewEtab(name) {
  const etabId = await createEtabForCurrentUser(name);
  setCurrentEtabRole("owner");
  clearPlanningMemoryForEtabSwitch();
  resetCloudLoadState();
  resetPlanningStateFromDefaults();
  state.authStatus = "Nouvel établissement créé. Chargement de son espace indépendant...";
  return etabId;
}
export async function signUpAdmin() {
  state.authStatus = "Création du compte...";
  render();
  try {
    if (!state.cloudConfig.url || !state.cloudConfig.anonKey) throw new Error("configuration Supabase incomplete");
    if (!state.authInviteToken && !state.authEtabName.trim()) throw new Error("renseignéz le nom de l’établissement");
    const response = await fetchBackend(authEndpoint("signup"), {
      method: "POST",
      headers: cloudAnonAuthHeaders(),
      body: JSON.stringify({
        email: state.authEmail.trim(),
        password: state.authPassword,
        data: {
          etablissement: state.authEtabName.trim()
        }
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error_description || result.msg || result.message || "creation impossible");
    if (!result.access_token) {
      state.authPassword = "";
      state.authStatus = state.authInviteToken ? "Compte créé. Validez l'email si Supabase le demande, puis connectez-vous avec ce lien pour rejoindre l'équipe." : "Compte créé. Validez l'email si Supabase le demande, puis connectez-vous pour creer l’établissement.";
      return;
    }
    saveAdminSession(result);
    const hadInvite = Boolean(state.authInviteToken);
    if (hadInvite) await acceptEtabInvite(state.authInviteToken, {
      preserveCurrent: false
    });else {
      await createEtabForCurrentUser(state.authEtabName);
      setCurrentEtabRole("owner");
    }
    state.authPassword = "";
    state.authStatus = hadInvite ? "Compte créé. Vous avez rejoint l'équipe EPS." : "Compte et Établissement créés. Vous pouvez sauvegarder ce planning.";
    state.authReady = true;
    requestInitialCloudLoad(true, true);
  } catch (error) {
    saveAdminSession(null);
    state.authStatus = `Création impossible : ${error.message || "erreur inconnue"}`;
  } finally {
    render();
  }
}
export async function signOutAdmin() {
  if (state.signingOut) return;
  state.signingOut = true;
  clearTimeout(state.cloudSaveTimer);
  state.cloudSaveTimer = null;
  state.cloudSaveQueued = false;
  try {
    const response = await cloudFetchWithAuthRetry(authEndpoint("logout") + "?scope=local", { method: "POST", signal: AbortSignal.timeout(8000) });
    if (!response.ok && response.status !== 401 && response.status !== 403) throw new Error("Revocation failed");
  } catch {
    securityEvent("logout_failed");
    sessionStorage.setItem("planningEpsLogoutWarning", "Déconnexion locale effectuée. La révocation de la session distante n’a pas pu être confirmée (réseau indisponible).");
  }
  clearOAuthVerifier();
  const keptCloudConfig = {
    ...state.cloudConfig,
    etabId: "",
    autoLoad: true
  };
  saveAdminSession(null);
  ["planningEpsTeachers2026", "planningEpsClassConfig2026", "planningEpsFacilities2026", "planningEpsActivities2026", "planningEpsFacilityActivities2026", "planningEpsActivityProgramByLevel2026", "planningEpsActivityProgramByClass2026", "planningEpsYearPlan2026", "planningEpsCycles2026", "planningEpsCyclesByLevel2026", "planningEpsServiceHoursByLevel2026", "planningEpsServiceAssignments2026", "planningEpsSchoolConstraints2026", state.PREREQUISITE_LOCKS_KEY, state.YEAR_PREREQUISITE_LOCKS_KEY, state.PREREQUISITES_LOCK_KEY, "planningEpsConstructionWorkspaceMode2026", "planningEpsConstructionVersions2026", "planningEpsConstructionLocks2026", "planningEpsConstructionRuleSettings2026", "planningEpsConstructionRules2026", "planningEpsConstruction2026", "planningEpsBlockExclusions2026", "planningEpsAcceptedConflicts2026", "planningEpsSportEvents2026", "planningEpsAsSessions2026", "planningEpsFacilityUnavailability2026", "planningEpsEventExclusions2026", "planningEpsAsExclusions2026", "planningEpsHiddenConstructionBlocksReport2026", state.CLOUD_LOCAL_UNSYNCED_KEY, state.CLOUD_DIRTY_KEYS_KEY, state.AUTH_INVITE_KEY, state.AUTH_ETAB_NAME_KEY, state.AUTH_ROLE_KEY].forEach(key => pageMemory.removeItem(key));
  state.cloudConfig = keptCloudConfig;
  saveCloudConfig();
  state.authPassword = "";
  state.authStatus = "";
  state.authInviteLink = "";
  state.authInviteStatus = "";
  state.authInviteMenuOpen = false;
  state.currentEtabRole = "";
  state.currentEtabName = "";
  state.currentUserEtabs = [];
  state.accountMembersByEtabId = {};
  state.accountMembersRequestKey = "";
  state.accountMembersLoading = false;
  state.accountMembersStatus = "";
  if (state.week === "build" || state.week === "alerts" || state.week === "log") state.week = "current";
  window.location.reload();
}
