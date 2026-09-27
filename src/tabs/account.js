import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { acceptEtabInvite, cleanAuthUrl, createAndSwitchToNewEtab, createEtabInvite, currentEtabDisplayName, demoteEtabAdminToMember, etabMemberRoleLabel, getDefaultEtabId, isSignedIn, normalizeEtabRole, normalizeInviteToken, promoteEtabMemberToAdmin, refreshAccountMembersForRows, removeEtabMember, renameCurrentEtab, signInAdmin, signUpAdmin, transferEtabCreator } from "../services/auth.js";
import { readCloudConfigInputs, requestInitialCloudLoad, restartCloudAutoRefresh, saveCloudConfig } from "../services/cloud.js";
import { saveSchoolConstraints } from "../services/settings-storage.js";
import { showValidationPopup } from "../ui/feedback.js";
import { escapeHtml } from "../ui/format.js";
import { attachAuthControls } from "../ui/navigation.js";

export function renderAccountView() {
  if (!isSignedIn()) return "";
  const defaultEtabId = getDefaultEtabId();
  const rows = state.currentUserEtabs.length ? state.currentUserEtabs : state.cloudConfig.etabId ? [{
    etab_id: state.cloudConfig.etabId,
    role: state.currentEtabRole,
    etab_name: currentEtabDisplayName()
  }] : [];
  setTimeout(() => refreshAccountMembersForRows(rows), 0);
  const renderMembers = (etabId, canManageMembers) => {
    const members = state.accountMembersByEtabId[etabId];
    if (!members) return `<div class="etabMembersList"><span>${state.accountMembersLoading ? "Chargement des membres..." : "Membres à charger..."}</span></div>`;
    if (!members.length) return `<div class="etabMembersList"><span>Aucun membre trouvé.</span></div>`;
    const currentUserId = state.adminSession?.user?.id || "";
    const currentUserIsCreator = members.some(member => member.user_id === currentUserId && member.is_creator);
    const ownerCount = members.filter(member => member.role === "owner").length;
    return `<div class="etabMembersList">
            ${members.map(member => {
      const isLastOwner = member.role === "owner" && ownerCount <= 1;
      const canRemove = canManageMembers && member.user_id && member.user_id !== currentUserId && !isLastOwner && !member.is_creator;
      const canPromoteAdmin = canManageMembers && member.user_id && member.role !== "owner";
      const canDemoteAdmin = currentUserIsCreator && member.user_id && member.user_id !== currentUserId && member.role === "owner" && !member.is_creator;
      const canTransferCreator = currentUserIsCreator && member.user_id && member.user_id !== currentUserId && !member.is_creator;
      return `<div class="etabMemberRow">
              <span class="etabMemberEmail">${escapeHtml(member.email)}</span>
              <span class="etabMemberRole ${member.role === "owner" ? "owner" : ""}">${etabMemberRoleLabel(member.role)}</span>
              <span class="etabMemberActions">
                ${member.is_creator ? `<span class="etabMemberRole creator">créateur</span>` : ""}
                ${canPromoteAdmin ? `<button class="removeEtabMemberButton transferCreatorButton" type="button" data-promote-etab-member="${escapeHtml(member.user_id)}" data-promote-etab-id="${escapeHtml(etabId)}" data-promote-member-email="${escapeHtml(member.email)}">Passer admin</button>` : ""}
                ${canDemoteAdmin ? `<button class="removeEtabMemberButton transferCreatorButton" type="button" data-demote-etab-admin="${escapeHtml(member.user_id)}" data-demote-etab-id="${escapeHtml(etabId)}" data-demote-member-email="${escapeHtml(member.email)}">Rétrograder</button>` : ""}
                ${canTransferCreator ? `<button class="removeEtabMemberButton transferCreatorButton" type="button" data-transfer-etab-creator="${escapeHtml(member.user_id)}" data-transfer-etab-id="${escapeHtml(etabId)}" data-transfer-member-email="${escapeHtml(member.email)}">Passer créateur</button>` : ""}
                ${canRemove ? `<button class="removeEtabMemberButton" type="button" data-remove-etab-member="${escapeHtml(member.user_id)}" data-remove-etab-id="${escapeHtml(etabId)}" data-remove-member-email="${escapeHtml(member.email)}">Supprimer</button>` : ""}
              </span>
            </div>`;
    }).join("")}
          </div>`;
  };
  return `<section class="guidePage">
          <h2>Établissements</h2>
          <article class="alertHelp">
            <strong>Compte connecté</strong>
            <span>${escapeHtml(state.adminSession.user?.email || "utilisateur Supabase")}</span>
            <span>Établissement actif : ${escapeHtml(currentEtabDisplayName() || state.cloudConfig.etabId || "aucun")}</span>
            ${state.accountMembersStatus ? `<span>${escapeHtml(state.accountMembersStatus)}</span>` : ""}
          </article>
          <div class="guideGrid guideProfessorGrid accountEtabGrid">
            ${rows.map(item => {
    const active = item.etab_id === state.cloudConfig.etabId;
    const isDefault = item.etab_id === defaultEtabId;
    const canManageMembers = normalizeEtabRole(item.role) === "owner";
    return `<article class="guideCard">
                <strong>${escapeHtml(item.etab_name || item.etab_id)}</strong>
                <span>${item.role === "owner" ? "admin" : "consultation"}${active ? " · actif" : ""}${isDefault ? " · par défaut" : ""}</span>
                <button class="defaultEtabButton ${isDefault ? "active" : ""}" type="button" data-set-default-etab="${escapeHtml(item.etab_id)}" ${isDefault ? "disabled" : ""}>${isDefault ? "Par défaut" : "Définir par défaut"}</button>
                ${renderMembers(item.etab_id, canManageMembers)}
              </article>`;
  }).join("") || `<article class="guideCard"><strong>Aucun établissement</strong><span>Reconnectez-vous ou acceptez une invitation pour rattacher ce compte.</span></article>`}
          </div>
          <article class="alertHelp">
            <strong>Créer un autre établissement</strong>
            <span>Créez un nouvel espace indépendant pour une mutation ou une nouvelle équipe EPS. Les données restent étanches entre établissements.</span>
            <form class="authForm" id="createEtabForm">
              <input id="authEtabName" value="${escapeHtml(state.authEtabName)}" placeholder="Nom du nouvel établissement" aria-label="Nom du nouvel établissement" />
              <button class="authButton" type="submit">Créer un nouvel établissement</button>
            </form>
          </article>
        </section>`;
}
export function bindAccountEvents() {
  const adminLoginForm = document.getElementById("adminLoginForm");
  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", event => {
      event.preventDefault();
      state.authEmail = document.getElementById("adminEmail")?.value.trim() || "";
      state.authPassword = document.getElementById("adminPassword")?.value || "";
      state.authEtabName = document.getElementById("authEtabName")?.value.trim() || state.authEtabName;
      if (state.authMode === "signup") signUpAdmin();else signInAdmin();
    });
  }
  const toggleAuthMode = document.getElementById("toggleAuthMode");
  if (toggleAuthMode) toggleAuthMode.addEventListener("click", () => {
    state.authMode = state.authMode === "signup" ? "signin" : "signup";
    state.authStatus = "";
    render();
  });
  attachAuthControls();
  const adminEmailInput = document.getElementById("adminEmail");
  if (adminEmailInput) adminEmailInput.addEventListener("input", () => state.authEmail = adminEmailInput.value);
  const adminPasswordInput = document.getElementById("adminPassword");
  if (adminPasswordInput) adminPasswordInput.addEventListener("input", () => state.authPassword = adminPasswordInput.value);
  const authEtabNameInput = document.getElementById("authEtabName");
  if (authEtabNameInput) authEtabNameInput.addEventListener("input", () => state.authEtabName = authEtabNameInput.value);
  const authInviteCodeInput = document.getElementById("authInviteCode");
  if (authInviteCodeInput) authInviteCodeInput.addEventListener("input", () => state.authInviteCodeDraft = authInviteCodeInput.value);
  const joinInviteForm = document.getElementById("joinInviteForm");
  if (joinInviteForm) joinInviteForm.addEventListener("submit", async event => {
    event.preventDefault();
    const token = normalizeInviteToken(document.getElementById("authInviteCode")?.value || state.authInviteCodeDraft);
    if (!token) {
      state.authStatus = "Collez un lien ou un code d'invitation pour rejoindre l'équipe EPS.";
      render();
      return;
    }
    state.authInviteCodeDraft = "";
    state.authStatus = "Rattachement à l'équipe EPS...";
    render();
    try {
      await acceptEtabInvite(token, {
        preserveCurrent: false
      });
      state.authStatus = "Vous avez rejoint l'équipe EPS.";
      requestInitialCloudLoad(false, true);
    } catch (error) {
      state.authStatus = `Invitation impossible : ${error.message || "erreur inconnue"}`;
    }
    render();
  });
  const createEtabForm = document.getElementById("createEtabForm");
  if (createEtabForm) createEtabForm.addEventListener("submit", async event => {
    event.preventDefault();
    state.authEtabName = document.getElementById("authEtabName")?.value.trim() || "";
    state.authStatus = "Création de l’établissement...";
    render();
    try {
      await createAndSwitchToNewEtab(state.authEtabName);
      render();
      requestInitialCloudLoad(false, true);
    } catch (error) {
      state.authStatus = `Création impossible : ${error.message || "erreur inconnue"}`;
      render();
    }
  });
  document.querySelectorAll("[data-remove-etab-member]").forEach(button => {
    button.addEventListener("click", async () => {
      const etabId = button.dataset.removeEtabId || "";
      const userId = button.dataset.removeEtabMember || "";
      const email = button.dataset.removeMemberEmail || "ce membre";
      const etab = state.currentUserEtabs.find(item => item.etab_id === etabId);
      const etabName = etab?.etab_name || etabId;
      const confirmed = window.confirm(`Supprimer ${email} de l'établissement ${etabName} ?\n\nCette personne perdra l'accès aux données de cet établissement.`);
      if (!confirmed) return;
      state.authStatus = `Suppression de ${email}...`;
      render();
      try {
        await removeEtabMember(etabId, userId);
        state.accountMembersRequestKey = "";
        state.authStatus = `${email} a été retiré de l'établissement.`;
        showValidationPopup("Membre supprimé");
      } catch (error) {
        state.authStatus = `Suppression impossible : ${error.message || "erreur inconnue"}`;
      } finally {
        render();
      }
    });
  });
  document.querySelectorAll("[data-promote-etab-member]").forEach(button => {
    button.addEventListener("click", async () => {
      const etabId = button.dataset.promoteEtabId || "";
      const userId = button.dataset.promoteEtabMember || "";
      const email = button.dataset.promoteMemberEmail || "ce membre";
      const etab = state.currentUserEtabs.find(item => item.etab_id === etabId);
      const etabName = etab?.etab_name || etabId;
      const confirmed = window.confirm(`Donner le rôle admin à ${email} dans ${etabName} ?\n\nCette personne pourra modifier la configuration et gérer les membres de cet établissement.`);
      if (!confirmed) return;
      state.authStatus = `Promotion admin de ${email}...`;
      render();
      try {
        await promoteEtabMemberToAdmin(etabId, userId);
        state.accountMembersRequestKey = "";
        state.authStatus = `${email} est maintenant admin de l'établissement.`;
        showValidationPopup("Rôle admin ajouté");
      } catch (error) {
        state.authStatus = `Promotion impossible : ${error.message || "erreur inconnue"}`;
      } finally {
        render();
      }
    });
  });
  document.querySelectorAll("[data-demote-etab-admin]").forEach(button => {
    button.addEventListener("click", async () => {
      const etabId = button.dataset.demoteEtabId || "";
      const userId = button.dataset.demoteEtabAdmin || "";
      const email = button.dataset.demoteMemberEmail || "ce membre";
      const etab = state.currentUserEtabs.find(item => item.etab_id === etabId);
      const etabName = etab?.etab_name || etabId;
      const confirmed = window.confirm(`Rétrograder ${email} en consultation dans ${etabName} ?\n\nCette personne ne pourra plus modifier la configuration ni gérer les membres de cet établissement.`);
      if (!confirmed) return;
      state.authStatus = `Rétrogradation de ${email}...`;
      render();
      try {
        await demoteEtabAdminToMember(etabId, userId);
        state.accountMembersRequestKey = "";
        state.authStatus = `${email} est maintenant en consultation.`;
        showValidationPopup("Admin rétrogradé");
      } catch (error) {
        state.authStatus = `Rétrogradation impossible : ${error.message || "erreur inconnue"}`;
      } finally {
        render();
      }
    });
  });
  document.querySelectorAll("[data-transfer-etab-creator]").forEach(button => {
    button.addEventListener("click", async () => {
      const etabId = button.dataset.transferEtabId || "";
      const userId = button.dataset.transferEtabCreator || "";
      const email = button.dataset.transferMemberEmail || "ce membre";
      const etab = state.currentUserEtabs.find(item => item.etab_id === etabId);
      const etabName = etab?.etab_name || etabId;
      const confirmed = window.confirm(`Transférer le statut de créateur de ${etabName} à ${email} ?\n\nCette personne deviendra créateur et admin de l'établissement. Vous resterez admin, mais vous ne serez plus le créateur protégé.`);
      if (!confirmed) return;
      state.authStatus = `Transfert du créateur vers ${email}...`;
      render();
      try {
        await transferEtabCreator(etabId, userId);
        state.accountMembersRequestKey = "";
        state.authStatus = `${email} est maintenant créateur de l'établissement.`;
        showValidationPopup("Créateur transféré");
      } catch (error) {
        state.authStatus = `Transfert impossible : ${error.message || "erreur inconnue"}`;
      } finally {
        render();
      }
    });
  });
  const acceptInviteForm = document.getElementById("acceptInviteForm");
  if (acceptInviteForm) acceptInviteForm.addEventListener("submit", async event => {
    event.preventDefault();
    state.authStatus = "Rattachement à l'équipe EPS...";
    render();
    try {
      await acceptEtabInvite(state.authInviteToken, {
        preserveCurrent: false
      });
      state.authStatus = "Vous avez rejoint l'équipe EPS.";
      cleanAuthUrl(true);
      requestInitialCloudLoad(false, true);
    } catch (error) {
      state.authStatus = `Invitation impossible : ${error.message || "erreur inconnue"}`;
    } finally {
      render();
    }
  });
  document.querySelectorAll("[data-close-invite-modal]").forEach(target => {
    target.addEventListener("click", event => {
      if (target.classList.contains("modalBackdrop") && event.target !== target) return;
      state.authInviteModalOpen = false;
      render();
    });
  });
  const inviteLinkInput = document.getElementById("inviteLinkInput");
  if (inviteLinkInput && state.authInviteLink) inviteLinkInput.addEventListener("click", () => inviteLinkInput.select());
  const copyInviteLink = document.querySelector("[data-copy-invite-link]");
  if (copyInviteLink) copyInviteLink.addEventListener("click", async () => {
    if (!state.authInviteLink) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(state.authInviteLink);else if (inviteLinkInput) {
        inviteLinkInput.select();
        document.execCommand("copy");
      }
      state.authInviteStatus = "Lien copié.";
    } catch (error) {
      state.authInviteStatus = "Copie impossible : sélectionnez le lien puis copiez-le manuellement.";
    } finally {
      render();
    }
  });
  document.querySelectorAll("[data-create-invite-link]").forEach(button => {
    button.addEventListener("click", async () => {
      const role = button.dataset.createInviteLink === "owner" ? "owner" : "member";
      const label = role === "owner" ? "admin" : "consultation";
      state.authInviteRole = role;
      state.authInviteMenuOpen = false;
      state.authInviteStatus = `Generation du lien ${label}...`;
      state.authInviteLink = "";
      render();
      try {
        const link = await createEtabInvite(role);
        state.authInviteModalOpen = true;
        state.authInviteStatus = `Lien d'invitation ${label} à usage unique prêt à partager.`;
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(link).catch(() => {});
          state.authInviteStatus = `Lien d'invitation ${label} à usage unique prêt à partager et copié.`;
        }
      } catch (error) {
        state.authInviteStatus = `Invitation impossible : ${error.message || "erreur inconnue"}`;
      } finally {
        render();
      }
    });
  });
  const requestAuthorInput = document.getElementById("requestAuthor");
  if (requestAuthorInput) requestAuthorInput.addEventListener("input", () => state.requestAuthor = requestAuthorInput.value);
  const establishmentNameInput = document.getElementById("establishmentName");
  if (establishmentNameInput) {
    establishmentNameInput.addEventListener("input", () => {
      state.schoolConstraints = {
        ...state.schoolConstraints,
        establishmentName: establishmentNameInput.value
      };
      saveSchoolConstraints();
    });
    establishmentNameInput.addEventListener("change", async () => {
      const label = establishmentNameInput.value.trim();
      state.schoolConstraints = {
        ...state.schoolConstraints,
        establishmentName: label
      };
      saveSchoolConstraints();
      try {
        if (label) await renameCurrentEtab(label);
        state.authStatus = label ? `Établissement renommé : ${label}` : state.authStatus;
      } catch (error) {
        state.authStatus = `Renommage Supabase impossible : ${error.message || "erreur inconnue"}`;
      }
      render();
    });
  }
  ["cloudUrl", "cloudAnonKey", "cloudEtabId", "cloudPlanningId"].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("input", () => {
        readCloudConfigInputs();
        saveCloudConfig();
        restartCloudAutoRefresh();
      });
    }
  });
}
