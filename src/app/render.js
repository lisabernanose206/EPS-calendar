import { securityEvent } from "../security/log.js";
import { safeHtml } from "../security/html.js";
import { state } from "./state.js";
import { renderTeacherLegend } from "../domain/assignments.js";
import { generateCycle } from "../domain/schedule.js";
import { isAdmin, isSignedIn, renderEtabSwitchModal, renderShareInviteModal } from "../services/auth.js";
import { bindAccountEvents, renderAccountView } from "../tabs/account.js";
import { bindClassesEvents } from "../tabs/classes.js";
import { bindCloudEvents } from "../tabs/cloud.js";
import { bindConstructionEvents, renderConstructionView } from "../tabs/construction.js";
import { bindCycleEvents, renderCycleView } from "../tabs/cycle.js";
import { bindCycleSettingsEvents } from "../tabs/cycle-settings.js";
import { bindEstablishmentEvents } from "../tabs/establishment.js";
import { bindEventsEvents } from "../tabs/events.js";
import { bindFacilitiesActivitiesEvents } from "../tabs/facilities-activities.js";
import { renderGuideView } from "../tabs/guide.js";
import { bindHoursEvents } from "../tabs/hours.js";
import { bindPrerequisitesEvents } from "../tabs/prerequisites.js";
import { bindProgramEvents } from "../tabs/program.js";
import { bindRequestEvents, renderRequestView } from "../tabs/request.js";
import { bindSportAssociationEvents } from "../tabs/sport-association.js";
import { bindTeamEvents } from "../tabs/team.js";
import { bindTimetableEvents, renderCalendar } from "../tabs/timetable.js";
import { bindUnavailabilityEvents } from "../tabs/unavailability.js";
import { bindYearEvents, renderYearView } from "../tabs/year.js";
import { bindYearPrerequisitesEvents } from "../tabs/year-prerequisites.js";
import { bindDatePickerEvents } from "../ui/date-picker.js";
import { applyPrerequisitesLockState, renderAppError, renderValidationPopup } from "../ui/feedback.js";
import { attachAuthControls, renderAuthBox, renderLoggedOutHome, updateNavigationActive } from "../ui/navigation.js";

export function render() {
  if (state.week === "alerts" || state.week === "log") state.week = "current";
  if (!isAdmin() && state.week === "build") state.week = "current";
  const root = document.getElementById("root");
  const dateInfo = document.getElementById("dateInfo");
  const legend = document.getElementById("legend");
  if (!root || !dateInfo || !legend) return;
  const app = document.querySelector(".app");
  if (app) {
    app.classList.toggle("hasSidebar", isSignedIn());
    app.classList.toggle("sidebarCollapsed", isSignedIn() && state.sidebarCollapsed);
  }
  const sidebarToggle = document.getElementById("sidebarToggle");
  if (sidebarToggle) {
    sidebarToggle.textContent = state.sidebarCollapsed ? "›" : "‹";
    sidebarToggle.setAttribute("aria-label", state.sidebarCollapsed ? "Afficher le menu" : "Masquer le menu");
    sidebarToggle.setAttribute("title", state.sidebarCollapsed ? "Afficher le menu" : "Masquer le menu");
  }
  dateInfo.style.display = "none";
  dateInfo.innerHTML = safeHtml("");
  renderAuthBox();
  const adminNavGroup = document.getElementById("adminNavGroup");
  if (adminNavGroup) adminNavGroup.classList.toggle("locked", !isAdmin());
  if (!isSignedIn()) {
    updateNavigationActive();
    const top = document.querySelector(".top");
    if (top) top.style.display = "none";
    legend.style.display = "none";
    legend.innerHTML = safeHtml("");
    root.innerHTML = safeHtml(renderLoggedOutHome());
    root.insertAdjacentHTML("beforeend", safeHtml(renderValidationPopup()));
    root.insertAdjacentHTML("beforeend", safeHtml(renderShareInviteModal()));
    root.insertAdjacentHTML("beforeend", safeHtml(renderEtabSwitchModal()));
    attachAuthControls();
    return;
  }
  const top = document.querySelector(".top");
  if (top) top.style.display = "";
  try {
    updateNavigationActive();
    const cycle = generateCycle();
    const hideLegend = state.week === "build" || state.week === "guide" || state.week === "request" || state.week === "account" || state.week === "cycle" || state.week === "year" || state.week === "current";
    legend.style.display = hideLegend ? "none" : "flex";
    legend.innerHTML = safeHtml(hideLegend ? "" : renderTeacherLegend());
    if (state.week === "year") root.innerHTML = safeHtml(renderYearView(cycle));else if (state.week === "cycle") root.innerHTML = safeHtml(renderCycleView());else if (state.week === "build") root.innerHTML = safeHtml(renderConstructionView());else if (state.week === "guide") root.innerHTML = safeHtml(renderGuideView());else if (state.week === "request") root.innerHTML = safeHtml(renderRequestView());else if (state.week === "account") root.innerHTML = safeHtml(renderAccountView());else root.innerHTML = safeHtml(renderCalendar(cycle));
  } catch (error) {
    securityEvent("render_failed");
    legend.style.display = "none";
    legend.innerHTML = safeHtml("");
    root.innerHTML = safeHtml(renderAppError(error));
  }
  root.insertAdjacentHTML("beforeend", safeHtml(renderValidationPopup()));
  root.insertAdjacentHTML("beforeend", safeHtml(renderShareInviteModal()));
  root.insertAdjacentHTML("beforeend", safeHtml(renderEtabSwitchModal()));
  applyPrerequisitesLockState();
  bindAccountEvents();
  bindClassesEvents();
  bindCloudEvents();
  bindConstructionEvents();
  bindEstablishmentEvents();
  bindTeamEvents();
  bindFacilitiesActivitiesEvents();
  bindEventsEvents();
  bindUnavailabilityEvents();
  bindCycleEvents();
  bindCycleSettingsEvents();
  bindSportAssociationEvents();
  bindProgramEvents();
  bindHoursEvents();
  bindRequestEvents();
  bindYearEvents();
  bindYearPrerequisitesEvents();
  bindDatePickerEvents();
  bindTimetableEvents();
  bindPrerequisitesEvents();
}
