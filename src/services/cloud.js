import { render } from "../app/render.js";
import { state } from "../app/state.js";
import { loadCycles, loadCyclesByLevel } from "../domain/cycles.js";
import { applyImportedClassLevels, classLevelsForEstablishmentType, defaultClassConfigForLevels } from "../domain/settings.js";
import { purgeConstructionForUnavailableItems } from "../domain/unavailability.js";
import { authEndpoint, isAdmin, isSignedIn, saveAdminSession } from "./auth.js";
import { invalidateConstructionChecksCache, loadYearPlan } from "./planning-storage.js";
import { buildConstructionPlanFromRules, classesFromConfig, loadAcceptedConflicts, loadActivities, loadActivityProgramByClass, loadActivityProgramByLevel, loadAsExclusions, loadAsSessions, loadBlockExclusions, loadClassConfig, loadConstructionLocks, loadConstructionRuleSettings, loadConstructionRules, loadConstructionVersions, loadConstructionWorkspaceMode, loadEventExclusions, loadFacilities, loadFacilityActivities, loadFacilityUnavailability, loadSchoolConstraints, loadServiceAssignments, loadServiceHoursByLevel, loadSportEvents, loadTeachers, normalizeAcceptedConflicts, normalizeActivityProgramByClass, normalizeActivityProgramByLevel, normalizeClassConfig, normalizeConstructionLocks, normalizeConstructionRuleClassReferences, normalizeConstructionRuleSettings, normalizeFacilities, normalizeLevelKeyedObject, normalizeSchoolConstraints, normalizeServiceAssignments, pruneClassReferences, pruneFacilityActivities, refreshConstructionPlanFromRulesLocalOnly } from "./settings-storage.js";
import { showValidationPopup } from "../ui/feedback.js";

export function loadCloudConfig() {
  const defaults = {
    enabled: false,
    autoSave: false,
    autoLoad: true,
    url: "",
    anonKey: "",
    etabId: "",
    planningId: "planning-eps-2026-2027",
    ...state.BUILT_IN_CLOUD_CONFIG,
    ...(window.__EPS_CLOUD_CONFIG__ || {})
  };
  if (state.CLOUD_AUTO_LOAD_DISABLED) defaults.autoLoad = false;
  if (!defaults.planningId) defaults.planningId = "planning-eps-2026-2027";
  if (defaults.url && defaults.anonKey) defaults.enabled = defaults.enabled || true;
  try {
    const saved = localStorage.getItem(state.CLOUD_CONFIG_KEY);
    const savedConfig = saved ? JSON.parse(saved) : {};
    const merged = {
      ...defaults,
      ...savedConfig,
      autoLoad: state.CLOUD_AUTO_LOAD_DISABLED ? false : true
    };
    if (defaults.url && defaults.anonKey) {
      return {
        ...merged,
        enabled: true,
        autoSave: true,
        autoLoad: true,
        url: defaults.url,
        anonKey: defaults.anonKey,
        etabId: merged.etabId || defaults.etabId || "",
        planningId: defaults.planningId
      };
    }
    return merged;
  } catch {
    return defaults;
  }
}
export function cloudConfigIdentity(config) {
  return [config?.url || "", config?.etabId || "", config?.planningId || ""].join("|");
}
export function resetCloudLoadState() {
  state.cloudSourceLoaded = false;
  state.cloudInitialLoadKey = "";
  state.cloudLastUpdatedAt = "";
  clearTimeout(state.cloudSaveTimer);
  state.cloudSaveTimer = null;
  state.cloudSaveQueued = false;
}
export function saveCloudConfig() {
  const previousConfig = (() => {
    try {
      return JSON.parse(localStorage.getItem(state.CLOUD_CONFIG_KEY) || "null");
    } catch {
      return null;
    }
  })();
  const previousIdentity = cloudConfigIdentity(previousConfig);
  const nextIdentity = cloudConfigIdentity(state.cloudConfig);
  localStorage.setItem(state.CLOUD_CONFIG_KEY, JSON.stringify(state.cloudConfig));
  if (previousIdentity && previousIdentity !== nextIdentity) resetCloudLoadState();
}
export function defaultPrerequisiteLocks(value = false) {
  return Object.fromEntries(state.prerequisiteSubModes.map(mode => [mode, value]));
}
export function defaultYearPrerequisiteLocks(value = false) {
  return Object.fromEntries(state.yearPrerequisiteSubModes.map(mode => [mode, value]));
}
export function loadPrerequisiteLocks() {
  try {
    const saved = localStorage.getItem(state.PREREQUISITE_LOCKS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaultPrerequisiteLocks(false),
        ...parsed
      };
    }
    return defaultPrerequisiteLocks(localStorage.getItem(state.PREREQUISITES_LOCK_KEY) === "true");
  } catch {
    return defaultPrerequisiteLocks(false);
  }
}
export function prerequisiteLocked(mode = state.prerequisiteMode) {
  return Boolean(state.prerequisiteLocks[mode]);
}
export function loadYearPrerequisiteLocks() {
  try {
    const saved = localStorage.getItem(state.YEAR_PREREQUISITE_LOCKS_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      ...defaultYearPrerequisiteLocks(false),
      ...parsed
    };
  } catch {
    return defaultYearPrerequisiteLocks(false);
  }
}
export function yearPrerequisiteLocked(mode = state.yearPrerequisiteMode) {
  return Boolean(state.yearPrerequisiteLocks[mode]);
}
export function savePrerequisiteLocks() {
  localStorage.setItem(state.PREREQUISITE_LOCKS_KEY, JSON.stringify({
    ...defaultPrerequisiteLocks(false),
    ...state.prerequisiteLocks
  }));
  localStorage.setItem(state.PREREQUISITES_LOCK_KEY, state.prerequisiteSubModes.every(mode => prerequisiteLocked(mode)) ? "true" : "false");
  saveLocksToCloudNow(["prerequisiteLocks"]);
}
export function saveYearPrerequisiteLocks() {
  localStorage.setItem(state.YEAR_PREREQUISITE_LOCKS_KEY, JSON.stringify({
    ...defaultYearPrerequisiteLocks(false),
    ...state.yearPrerequisiteLocks
  }));
  saveLocksToCloudNow(["yearPrerequisiteLocks"]);
}
export function loadCloudDirtyKeys() {
  try {
    const saved = JSON.parse(localStorage.getItem(state.CLOUD_DIRTY_KEYS_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(key => state.cloudDataKeys.includes(key)) : [];
  } catch {
    return [];
  }
}
export function normalizeCloudDirtyKeys(keys = []) {
  const list = Array.isArray(keys) ? keys : [keys];
  return list.filter(key => state.cloudDataKeys.includes(key));
}
export function markLocalChangedForCloud(keys = []) {
  state.localUnsyncedChanges = new Date().toISOString();
  localStorage.setItem(state.CLOUD_LOCAL_UNSYNCED_KEY, state.localUnsyncedChanges);
  normalizeCloudDirtyKeys(keys).forEach(key => state.cloudDirtyKeys.add(key));
  localStorage.setItem(state.CLOUD_DIRTY_KEYS_KEY, JSON.stringify([...state.cloudDirtyKeys]));
}
export function clearLocalChangedForCloud() {
  state.localUnsyncedChanges = "";
  state.cloudDirtyKeys = new Set();
  localStorage.removeItem(state.CLOUD_LOCAL_UNSYNCED_KEY);
  localStorage.removeItem(state.CLOUD_DIRTY_KEYS_KEY);
}
export function hasPendingCloudSave() {
  return Boolean(state.cloudSaveTimer || state.cloudSaveQueued || state.cloudDirtyKeys.size);
}
export function discardLocalChangesFromCloudSoon() {
  clearTimeout(state.cloudSaveTimer);
  state.cloudSaveTimer = null;
  state.cloudSaveQueued = false;
  clearLocalChangedForCloud();
}
export function cloudCurrentLoadKey() {
  return [state.adminSession?.user?.id || "", state.cloudConfig.etabId || "", state.cloudConfig.planningId || ""].join("|");
}
export function requestInitialCloudLoad(silent = false, forceApply = true) {
  if (!cloudReady() || !state.cloudConfig.autoLoad || !isSignedIn()) return false;
  const loadKey = cloudCurrentLoadKey();
  if (!loadKey || state.cloudInitialLoadKey === loadKey || state.cloudSourceLoaded || state.cloudSyncing) return false;
  state.cloudInitialLoadKey = loadKey;
  setTimeout(() => cloudLoadFromRemote(true, silent, forceApply), 0);
  return true;
}
export function saveCloudNowIfPossible(keys = []) {
  if (!isAdmin()) {
    state.cloudStatus = "Modification refusée : rechargement de la source Supabase.";
    discardLocalChangesFromCloudSoon();
    return false;
  }
  if (!cloudReady()) {
    state.cloudStatus = "Modification refusée : cloud non configuré.";
    return false;
  }
  if (!state.cloudConfig.autoSave) {
    state.cloudStatus = "Modification refusée : autosauvegarde cloud désactivée.";
    discardLocalChangesFromCloudSoon();
    return false;
  }
  if (!cloudWriteAllowed()) {
    state.cloudStatus = cloudWriteBlockedMessage();
    return false;
  }
  markLocalChangedForCloud(keys);
  clearTimeout(state.cloudSaveTimer);
  state.cloudSaveTimer = null;
  if (state.cloudSyncing) {
    state.cloudSaveQueued = true;
    showValidationPopup("Synchronisation Supabase en attente...");
    return true;
  }
  showValidationPopup("Synchronisation Supabase en cours...");
  cloudSaveToRemote(false, {
    allowBeforeSourceLoaded: true
  });
  return true;
}
export function saveCloudPatchNow(keys = []) {
  const normalizedKeys = normalizeCloudDirtyKeys(keys);
  if (!isAdmin() || !cloudReady() || !state.cloudConfig.autoSave) {
    return saveCloudNowIfPossible(normalizedKeys);
  }
  if (!cloudWriteAllowed()) {
    state.cloudStatus = cloudWriteBlockedMessage();
    return false;
  }
  markLocalChangedForCloud(normalizedKeys);
  clearTimeout(state.cloudSaveTimer);
  state.cloudSaveTimer = null;
  if (state.cloudSyncing) {
    state.cloudSaveQueued = true;
    return true;
  }
  cloudSaveToRemote(false, {
    allowBeforeSourceLoaded: true
  });
  return true;
}
export function saveLocksToCloudNow(keys = ["prerequisiteLocks", "yearPrerequisiteLocks"]) {
  return saveCloudPatchNow(keys);
}
export function readCloudConfigInputs() {
  const urlInput = document.getElementById("cloudUrl");
  const anonKeyInput = document.getElementById("cloudAnonKey");
  const etabIdInput = document.getElementById("cloudEtabId");
  const planningIdInput = document.getElementById("cloudPlanningId");
  if (!urlInput && !anonKeyInput && !etabIdInput && !planningIdInput) return state.cloudConfig;
  state.cloudConfig = {
    ...state.cloudConfig,
    url: urlInput?.value.trim() || state.cloudConfig.url || "",
    anonKey: anonKeyInput?.value.trim() || state.cloudConfig.anonKey || "",
    etabId: etabIdInput?.value.trim() || state.cloudConfig.etabId || "",
    planningId: planningIdInput?.value.trim() || state.cloudConfig.planningId || "planning-eps-2026-2027"
  };
  return state.cloudConfig;
}
export function cloudReady() {
  return Boolean(state.cloudConfig.enabled && state.cloudConfig.url && state.cloudConfig.anonKey && state.cloudConfig.etabId && state.cloudConfig.planningId);
}
export function isLocalRuntime() {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local");
}
export function cloudWriteAllowed() {
  return cloudReady() && !isLocalRuntime();
}
export function cloudSourceReadyForWrite() {
  return cloudWriteAllowed() && (!state.cloudConfig.autoLoad || state.cloudSourceLoaded);
}
export function cloudWriteBlockedMessage() {
  if (cloudReady() && state.cloudConfig.autoLoad && !state.cloudSourceLoaded) return "Chargement Supabase requis avant toute sauvegarde.";
  return "Mode local : lecture cloud possible, ecriture Supabase bloquee. Seul le vrai site peut sauvegarder dans le cloud.";
}
export function cloudConfigSavedMessage() {
  if (!cloudReady()) return "Cloud non configuré.";
  return cloudWriteAllowed() ? "Configuration cloud enregistrée." : cloudWriteBlockedMessage();
}
export function criticalCloudNotice(label = "Modifications") {
  if (!cloudReady()) return "";
  const message = hasPendingCloudSave() ? `${label} en cours d'envoi Supabase.` : state.cloudStatus;
  return `<div class="cloudStatus">${message}</div>`;
}
export function cloudEndpoint() {
  const base = state.cloudConfig.url.replace(/\/$/, "");
  return `${base}/rest/v1/eps_plannings`;
}
export function feedbackEndpoint() {
  const base = state.cloudConfig.url.replace(/\/$/, "");
  return `${base}/rest/v1/eps_feedback`;
}
export function etabMembersEndpoint() {
  const base = state.cloudConfig.url.replace(/\/$/, "");
  return `${base}/rest/v1/etab_members`;
}
export function etabsEndpoint() {
  const base = state.cloudConfig.url.replace(/\/$/, "");
  return `${base}/rest/v1/etabs`;
}
export function etabByIdQuery(etabId = state.cloudConfig.etabId) {
  return `id=eq.${encodeURIComponent(etabId)}`;
}
export function planningQuery() {
  return `etab_id=eq.${encodeURIComponent(state.cloudConfig.etabId)}`;
}
export function cloudPlanningRowId() {
  return state.cloudConfig.etabId || state.cloudConfig.planningId || "planning-eps";
}
export function planningRowQuery(rowId) {
  return `etab_id=eq.${encodeURIComponent(state.cloudConfig.etabId)}&id=eq.${encodeURIComponent(rowId)}`;
}
export function sortedPlanningRowsForCurrentEtab(rows = []) {
  const preferredId = cloudPlanningRowId();
  return rows.filter(row => row?.etab_id === state.cloudConfig.etabId || row?.data?.etabId === state.cloudConfig.etabId).sort((first, second) => {
    const firstPreferred = first.id === preferredId ? 0 : 1;
    const secondPreferred = second.id === preferredId ? 0 : 1;
    if (firstPreferred !== secondPreferred) return firstPreferred - secondPreferred;
    return new Date(second.updated_at || 0).getTime() - new Date(first.updated_at || 0).getTime();
  });
}
export function cloudHeaders(extra = {}) {
  const token = state.adminSession?.access_token || state.cloudConfig.anonKey;
  return {
    apikey: state.cloudConfig.anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra
  };
}
export function cloudAnonAuthHeaders(extra = {}) {
  return {
    apikey: state.cloudConfig.anonKey,
    Authorization: `Bearer ${state.cloudConfig.anonKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}
export function cloudErrorLooksLikeExpiredJwt(message = "") {
  const text = String(message || "").toLowerCase();
  return text.includes("jwt expired") || text.includes("token is expired") || text.includes("invalid jwt") || text.includes("expired token");
}
export async function refreshAdminSessionForCloud() {
  if (!state.adminSession?.refresh_token || !state.cloudConfig.url || !state.cloudConfig.anonKey) return false;
  const response = await fetch(`${authEndpoint("token")}?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: state.cloudConfig.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      refresh_token: state.adminSession.refresh_token
    })
  });
  if (!response.ok) return false;
  const refreshed = await response.json();
  if (!refreshed?.access_token) return false;
  saveAdminSession({
    ...state.adminSession,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || state.adminSession.refresh_token,
    token_type: refreshed.token_type || state.adminSession.token_type || "bearer",
    expires_at: Math.floor(Date.now() / 1000) + (Number(refreshed.expires_in) || 3600),
    user: refreshed.user || state.adminSession.user
  });
  return true;
}
export async function ensureCloudSessionFresh() {
  const expiresAt = Number(state.adminSession?.expires_at || 0);
  if (!expiresAt || expiresAt > Math.floor(Date.now() / 1000) + 60) return true;
  return refreshAdminSessionForCloud();
}
export async function cloudFetchWithAuthRetry(url, options = {}, retryOnExpiredJwt = true) {
  await ensureCloudSessionFresh();
  const buildOptions = () => ({
    ...options,
    headers: cloudHeaders(options.headers || {})
  });
  let response = await fetch(url, buildOptions());
  if (!retryOnExpiredJwt || response.ok) return response;
  const errorText = await response.clone().text();
  if (!cloudErrorLooksLikeExpiredJwt(errorText)) return response;
  state.cloudStatus = "Session Supabase expirée : reconnexion automatique...";
  const refreshed = await refreshAdminSessionForCloud();
  if (!refreshed) return response;
  return fetch(url, buildOptions());
}
export function clearLocalPlanningStorageForEtabSwitch() {
  ["planningEpsTeachers2026", "planningEpsClassConfig2026", "planningEpsFacilities2026", "planningEpsActivities2026", "planningEpsFacilityActivities2026", "planningEpsActivityProgramByLevel2026", "planningEpsActivityProgramByClass2026", "planningEpsYearPlan2026", "planningEpsCycles2026", "planningEpsCyclesByLevel2026", "planningEpsServiceHoursByLevel2026", "planningEpsServiceAssignments2026", "planningEpsSchoolConstraints2026", state.PREREQUISITE_LOCKS_KEY, state.YEAR_PREREQUISITE_LOCKS_KEY, state.PREREQUISITES_LOCK_KEY, "planningEpsConstructionWorkspaceMode2026", "planningEpsConstructionVersions2026", "planningEpsConstructionLocks2026", "planningEpsConstructionRuleSettings2026", "planningEpsConstructionRules2026", "planningEpsConstruction2026", "planningEpsBlockExclusions2026", "planningEpsAcceptedConflicts2026", "planningEpsSportEvents2026", "planningEpsAsSessions2026", "planningEpsFacilityUnavailability2026", "planningEpsEventExclusions2026", "planningEpsAsExclusions2026", "planningEpsHiddenConstructionBlocksReport2026", state.CLOUD_LOCAL_UNSYNCED_KEY, state.CLOUD_DIRTY_KEYS_KEY].forEach(key => localStorage.removeItem(key));
  state.localUnsyncedChanges = "";
  state.cloudDirtyKeys = new Set();
}
export function resetPlanningStateFromLocalDefaults() {
  state.teachers = loadTeachers();
  state.schoolConstraints = loadSchoolConstraints();
  state.classLevels = classLevelsForEstablishmentType(state.schoolConstraints.establishmentType);
  state.defaultClassConfig = defaultClassConfigForLevels();
  state.classConfig = loadClassConfig();
  state.classes = classesFromConfig();
  state.facilities = loadFacilities();
  state.activities = loadActivities();
  state.facilityActivities = loadFacilityActivities();
  state.activityProgramByLevel = loadActivityProgramByLevel();
  state.activityProgramByClass = loadActivityProgramByClass();
  state.slots = state.schoolConstraints.courseSlots;
  state.yearPlan = loadYearPlan();
  state.cycles = loadCycles();
  state.cyclesByLevel = loadCyclesByLevel();
  state.activeCycleId = state.cycles[0]?.id || "cycle-1";
  state.activeConstructionCycleId = state.cycles[0]?.id || "cycle-1";
  state.constructionRules = loadConstructionRules();
  state.eventExclusions = loadEventExclusions();
  state.asExclusions = loadAsExclusions();
  state.blockExclusions = loadBlockExclusions();
  state.acceptedConflicts = loadAcceptedConflicts();
  state.constructionPlan = buildConstructionPlanFromRules();
  state.constructionWorkspaceMode = loadConstructionWorkspaceMode();
  state.constructionVersions = loadConstructionVersions();
  state.constructionLocks = loadConstructionLocks();
  state.constructionRuleSettings = loadConstructionRuleSettings();
  state.prerequisiteLocks = loadPrerequisiteLocks();
  state.yearPrerequisiteLocks = loadYearPrerequisiteLocks();
  state.serviceHoursByLevel = loadServiceHoursByLevel();
  state.serviceAssignments = loadServiceAssignments();
  state.serviceLevelByTeacher = {};
  state.serviceClassByTeacher = {};
  state.serviceDraftHours = {};
  state.serviceFreeDrafts = {};
  state.sportEvents = loadSportEvents();
  state.asSessions = loadAsSessions();
  state.facilityUnavailability = loadFacilityUnavailability();
  state.selectedTeacherIds = state.teachers.map(teacher => teacher.id);
  state.cycleTeacherIds = state.teachers.map(teacher => teacher.id);
  state.cycleFacilityIds = state.facilities.map(facility => facility.id);
  state.constructionOptimizationResult = null;
  invalidateConstructionChecksCache();
}
export function withCurrentPlanningId(item) {
  return {
    ...item,
    planningId: state.cloudConfig.planningId
  };
}
export function normalizePlanningItems(items) {
  return Array.isArray(items) ? items.map(withCurrentPlanningId) : [];
}
export function collectPlanningData() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    etabId: state.cloudConfig.etabId,
    planningId: state.cloudConfig.planningId,
    teachers: state.teachers,
    classConfig: state.classConfig,
    facilities: state.facilities,
    activities: state.activities,
    facilityActivities: state.facilityActivities,
    activityProgramByLevel: state.activityProgramByLevel,
    activityProgramByClass: state.activityProgramByClass,
    yearPlan: state.yearPlan,
    cycles: state.cycles,
    cyclesByLevel: state.cyclesByLevel,
    serviceHoursByLevel: state.serviceHoursByLevel,
    serviceAssignments: state.serviceAssignments,
    schoolConstraints: state.schoolConstraints,
    prerequisiteLocks: state.prerequisiteLocks,
    yearPrerequisiteLocks: state.yearPrerequisiteLocks,
    constructionWorkspaceMode: state.constructionWorkspaceMode,
    constructionVersions: state.constructionVersions,
    constructionLocks: state.constructionLocks,
    constructionRuleSettings: state.constructionRuleSettings,
    constructionRules: state.constructionRules,
    constructionPlan: state.constructionPlan,
    blockExclusions: state.blockExclusions,
    acceptedConflicts: state.acceptedConflicts,
    sportEvents: normalizePlanningItems(state.sportEvents),
    asSessions: normalizePlanningItems(state.asSessions),
    facilityUnavailability: state.facilityUnavailability,
    eventExclusions: state.eventExclusions,
    asExclusions: state.asExclusions
  };
}
export function planningDataMatchesActiveScope(data) {
  if (!data || typeof data !== "object") return false;
  const dataEtabId = String(data.etabId || "");
  const dataPlanningId = String(data.planningId || "");
  return (!dataEtabId || dataEtabId === state.cloudConfig.etabId) && (!dataPlanningId || dataPlanningId === state.cloudConfig.planningId);
}
export function assertPlanningDataMatchesActiveScope(data, actionLabel = "Operation") {
  if (!planningDataMatchesActiveScope(data)) {
    throw new Error(`${actionLabel} bloquee : donnees d'un autre etablissement ou planning.`);
  }
}
export function applyPlanningData(data) {
  if (!data || typeof data !== "object") return;
  assertPlanningDataMatchesActiveScope(data, "Chargement Supabase");
  state.teachers = Array.isArray(data.teachers) ? data.teachers : state.teachers;
  state.schoolConstraints = data.schoolConstraints && typeof data.schoolConstraints === "object" ? normalizeSchoolConstraints(data.schoolConstraints) : state.schoolConstraints;
  state.classLevels = classLevelsForEstablishmentType(state.schoolConstraints.establishmentType);
  state.defaultClassConfig = defaultClassConfigForLevels();
  applyImportedClassLevels(data.classConfig || {});
  state.classConfig = normalizeClassConfig(data.classConfig || state.classConfig);
  state.classes = classesFromConfig();
  state.facilities = Array.isArray(data.facilities) ? normalizeFacilities(data.facilities) : normalizeFacilities(state.facilities);
  state.activities = Array.isArray(data.activities) ? data.activities : state.activities;
  state.facilityActivities = data.facilityActivities && typeof data.facilityActivities === "object" ? data.facilityActivities : {};
  state.activityProgramByLevel = normalizeActivityProgramByLevel(data.activityProgramByLevel || state.activityProgramByLevel);
  state.activityProgramByClass = normalizeActivityProgramByClass(data.activityProgramByClass || state.activityProgramByClass);
  pruneFacilityActivities();
  state.yearPlan = data.yearPlan || state.yearPlan;
  state.cycles = Array.isArray(data.cycles) && data.cycles.length ? data.cycles : state.cycles;
  state.cyclesByLevel = data.cyclesByLevel && typeof data.cyclesByLevel === "object" ? normalizeLevelKeyedObject(data.cyclesByLevel, state.cyclesByLevel) : state.cyclesByLevel;
  state.serviceHoursByLevel = data.serviceHoursByLevel && typeof data.serviceHoursByLevel === "object" ? normalizeLevelKeyedObject(data.serviceHoursByLevel, state.defaultServiceHours, value => Math.max(0, Number(value) || 0)) : state.serviceHoursByLevel;
  state.serviceAssignments = data.serviceAssignments && typeof data.serviceAssignments === "object" ? normalizeServiceAssignments(data.serviceAssignments) : state.serviceAssignments;
  state.prerequisiteLocks = data.prerequisiteLocks && typeof data.prerequisiteLocks === "object" ? {
    ...defaultPrerequisiteLocks(false),
    ...data.prerequisiteLocks
  } : typeof data.prerequisitesLocked === "boolean" ? defaultPrerequisiteLocks(data.prerequisitesLocked) : state.prerequisiteLocks;
  state.yearPrerequisiteLocks = data.yearPrerequisiteLocks && typeof data.yearPrerequisiteLocks === "object" ? {
    ...defaultYearPrerequisiteLocks(false),
    ...data.yearPrerequisiteLocks
  } : state.yearPrerequisiteLocks;
  state.slots = state.schoolConstraints.courseSlots;
  state.activeCycleId = state.cycles[0]?.id || state.activeCycleId;
  state.constructionWorkspaceMode = ["manual", "optimized"].includes(data.constructionWorkspaceMode) ? data.constructionWorkspaceMode : state.constructionWorkspaceMode;
  state.constructionVersions = Array.isArray(data.constructionVersions) ? data.constructionVersions : state.constructionVersions;
  state.constructionLocks = normalizeConstructionLocks(data.constructionLocks || state.constructionLocks);
  state.constructionRuleSettings = normalizeConstructionRuleSettings(data.constructionRuleSettings || state.constructionRuleSettings);
  state.constructionRules = Array.isArray(data.constructionRules) ? data.constructionRules.map(normalizeConstructionRuleClassReferences) : state.constructionRules;
  state.blockExclusions = data.blockExclusions || state.blockExclusions;
  state.acceptedConflicts = normalizeAcceptedConflicts(data.acceptedConflicts || state.acceptedConflicts);
  state.sportEvents = Array.isArray(data.sportEvents) ? normalizePlanningItems(data.sportEvents) : normalizePlanningItems(state.sportEvents);
  state.asSessions = Array.isArray(data.asSessions) ? normalizePlanningItems(data.asSessions) : normalizePlanningItems(state.asSessions);
  state.facilityUnavailability = Array.isArray(data.facilityUnavailability) ? data.facilityUnavailability : state.facilityUnavailability;
  state.eventExclusions = data.eventExclusions || state.eventExclusions;
  state.asExclusions = data.asExclusions || state.asExclusions;
  pruneClassReferences();
  purgeConstructionForUnavailableItems(state.facilityUnavailability);
  refreshConstructionPlanFromRulesLocalOnly();
  state.selectedTeacherIds = state.teachers.map(teacher => teacher.id);
  state.cycleTeacherIds = state.teachers.map(teacher => teacher.id);
  state.cycleFacilityIds = state.facilities.map(facility => facility.id);
  localStorage.setItem("planningEpsTeachers2026", JSON.stringify(state.teachers));
  localStorage.setItem("planningEpsClassConfig2026", JSON.stringify(state.classConfig));
  localStorage.setItem("planningEpsFacilities2026", JSON.stringify(state.facilities));
  localStorage.setItem("planningEpsActivities2026", JSON.stringify(state.activities));
  localStorage.setItem("planningEpsFacilityActivities2026", JSON.stringify(state.facilityActivities));
  localStorage.setItem("planningEpsActivityProgramByLevel2026", JSON.stringify(state.activityProgramByLevel));
  localStorage.setItem("planningEpsActivityProgramByClass2026", JSON.stringify(state.activityProgramByClass));
  localStorage.setItem("planningEpsYearPlan2026", JSON.stringify(state.yearPlan));
  localStorage.setItem("planningEpsCycles2026", JSON.stringify(state.cycles));
  localStorage.setItem("planningEpsCyclesByLevel2026", JSON.stringify(state.cyclesByLevel));
  localStorage.setItem("planningEpsServiceHoursByLevel2026", JSON.stringify(state.serviceHoursByLevel));
  localStorage.setItem("planningEpsServiceAssignments2026", JSON.stringify(state.serviceAssignments));
  localStorage.setItem("planningEpsSchoolConstraints2026", JSON.stringify(state.schoolConstraints));
  localStorage.setItem(state.PREREQUISITE_LOCKS_KEY, JSON.stringify(state.prerequisiteLocks));
  localStorage.setItem(state.YEAR_PREREQUISITE_LOCKS_KEY, JSON.stringify(state.yearPrerequisiteLocks));
  localStorage.setItem(state.PREREQUISITES_LOCK_KEY, state.prerequisiteSubModes.every(mode => prerequisiteLocked(mode)) ? "true" : "false");
  localStorage.setItem("planningEpsConstructionWorkspaceMode2026", state.constructionWorkspaceMode);
  localStorage.setItem("planningEpsConstructionVersions2026", JSON.stringify(state.constructionVersions));
  localStorage.setItem("planningEpsConstructionLocks2026", JSON.stringify(state.constructionLocks));
  localStorage.setItem("planningEpsConstructionRuleSettings2026", JSON.stringify(state.constructionRuleSettings));
  localStorage.setItem("planningEpsConstructionRules2026", JSON.stringify(state.constructionRules));
  localStorage.setItem("planningEpsConstruction2026", JSON.stringify(state.constructionPlan));
  localStorage.setItem("planningEpsBlockExclusions2026", JSON.stringify(state.blockExclusions));
  localStorage.setItem("planningEpsAcceptedConflicts2026", JSON.stringify(state.acceptedConflicts));
  localStorage.setItem("planningEpsSportEvents2026", JSON.stringify(state.sportEvents));
  localStorage.setItem("planningEpsAsSessions2026", JSON.stringify(state.asSessions));
  localStorage.setItem("planningEpsFacilityUnavailability2026", JSON.stringify(state.facilityUnavailability));
  localStorage.setItem("planningEpsEventExclusions2026", JSON.stringify(state.eventExclusions));
  localStorage.setItem("planningEpsAsExclusions2026", JSON.stringify(state.asExclusions));
  invalidateConstructionChecksCache();
}
export function scheduleCloudSave(keys = []) {
  if (!isAdmin()) {
    state.cloudStatus = "Modification refusée : rechargement de la source Supabase.";
    discardLocalChangesFromCloudSoon();
    return;
  }
  if (!cloudReady()) {
    state.cloudStatus = "Modification refusée : cloud non configuré.";
    return;
  }
  if (!state.cloudConfig.autoSave) {
    state.cloudStatus = "Modification refusée : autosauvegarde cloud désactivée.";
    discardLocalChangesFromCloudSoon();
    return;
  }
  if (!cloudWriteAllowed()) {
    state.cloudStatus = cloudWriteBlockedMessage();
    return;
  }
  markLocalChangedForCloud(keys);
  if (state.cloudSyncing) {
    state.cloudSaveQueued = true;
    showValidationPopup("Synchronisation Supabase en attente...");
    return;
  }
  clearTimeout(state.cloudSaveTimer);
  state.cloudStatus = "Sauvegarde cloud en attente...";
  showValidationPopup("Synchronisation Supabase en cours...");
  state.cloudSaveTimer = setTimeout(() => cloudSaveToRemote(false, {
    allowBeforeSourceLoaded: true
  }), 900);
}
export async function cloudSaveToRemote(shouldRender = true, options = {}) {
  const allowBeforeSourceLoaded = Boolean(options.allowBeforeSourceLoaded);
  clearTimeout(state.cloudSaveTimer);
  state.cloudSaveTimer = null;
  let cloudSaveSucceeded = false;
  let shouldDiscardLocalChanges = false;
  const changedKeys = [...state.cloudDirtyKeys].filter(key => state.cloudDataKeys.includes(key));
  if (!isAdmin()) {
    state.cloudStatus = "Lecture seule : connexion admin requise pour sauvegarder.";
    discardLocalChangesFromCloudSoon();
    if (shouldRender) render();
    return;
  }
  if (!cloudReady()) {
    state.cloudStatus = "Cloud non configuré.";
    if (shouldRender) render();
    return;
  }
  if (!cloudWriteAllowed() || state.cloudConfig.autoLoad && !state.cloudSourceLoaded && !allowBeforeSourceLoaded) {
    state.cloudStatus = cloudWriteBlockedMessage();
    discardLocalChangesFromCloudSoon();
    if (shouldRender) render();
    return;
  }
  if (!changedKeys.length) {
    state.cloudStatus = "Aucune modification locale recente a envoyer. Supabase reste la source officielle.";
    clearLocalChangedForCloud();
    if (shouldRender) render();
    return;
  }
  state.cloudSyncing = true;
  state.cloudStatus = "Sauvegarde cloud en cours...";
  if (shouldRender) render();
  try {
    const updatedAt = new Date().toISOString();
    const currentData = collectPlanningData();
    const remoteResponse = await cloudFetchWithAuthRetry(`${cloudEndpoint()}?select=id,etab_id,data,updated_at&${planningQuery()}`);
    if (!remoteResponse.ok) throw new Error(await remoteResponse.text());
    const remoteRows = sortedPlanningRowsForCurrentEtab(await remoteResponse.json());
    const remoteRow = remoteRows[0] || null;
    const remoteData = remoteRow?.data && typeof remoteRow.data === "object" ? remoteRow.data : null;
    if (remoteData) assertPlanningDataMatchesActiveScope(remoteData, "Sauvegarde Supabase");
    const dataToSave = remoteData ? {
      ...remoteData,
      version: currentData.version,
      etabId: state.cloudConfig.etabId,
      planningId: state.cloudConfig.planningId,
      savedAt: updatedAt
    } : {
      ...currentData,
      savedAt: updatedAt
    };
    if (remoteData) {
      changedKeys.forEach(key => {
        dataToSave[key] = currentData[key];
      });
    }
    dataToSave.etabId = state.cloudConfig.etabId;
    dataToSave.planningId = state.cloudConfig.planningId;
    assertPlanningDataMatchesActiveScope(dataToSave, "Sauvegarde Supabase");
    const rowPayload = {
      etab_id: state.cloudConfig.etabId,
      id: remoteRow?.id || cloudPlanningRowId(),
      data: dataToSave,
      updated_at: updatedAt
    };
    const response = await cloudFetchWithAuthRetry(remoteRow ? `${cloudEndpoint()}?${planningRowQuery(remoteRow.id)}` : cloudEndpoint(), {
      method: remoteRow ? "PATCH" : "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify(rowPayload)
    });
    if (!response.ok) throw new Error(await response.text());
    cloudSaveSucceeded = true;
    if (allowBeforeSourceLoaded) state.cloudSourceLoaded = true;
    state.cloudLastUpdatedAt = updatedAt;
    const savedDate = new Date(updatedAt);
    const savedTimeLabel = savedDate.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit"
    });
    const savedDateLabel = savedDate.toLocaleDateString("fr-FR");
    state.cloudStatus = `Sauvegardé dans le cloud à ${savedTimeLabel} le ${savedDateLabel} (${changedKeys.length} zone${changedKeys.length > 1 ? "s" : ""}).`;
    showValidationPopup(`Sauvegardé dans le cloud à ${savedTimeLabel} le ${savedDateLabel}`);
  } catch (error) {
    const message = error.message || "sauvegarde impossible";
    state.cloudStatus = cloudErrorLooksLikeExpiredJwt(message) ? "Erreur cloud : session Supabase expirée. Reconnectez-vous, puis relancez la sauvegarde." : message.includes("42501") || message.includes("permission denied") ? "Erreur cloud : droits Supabase/RLS manquants. Verifiez que l'utilisateur est membre de cet etab_id." : `Erreur cloud : ${message}`;
    showValidationPopup(state.cloudStatus, "error");
    shouldDiscardLocalChanges = false;
  } finally {
    state.cloudSyncing = false;
    if (cloudSaveSucceeded && !state.cloudSaveQueued) clearLocalChangedForCloud();
    if (state.cloudSaveQueued) {
      state.cloudSaveQueued = false;
      scheduleCloudSave();
    } else if (shouldDiscardLocalChanges) {
      discardLocalChangesFromCloudSoon();
    }
    if (shouldRender || cloudSaveSucceeded) render();
  }
}
export function cloudRemoteIsNewer(updatedAt) {
  if (!updatedAt) return true;
  if (!state.cloudLastUpdatedAt) return true;
  return updatedAt !== state.cloudLastUpdatedAt;
}
export async function cloudLoadFromRemote(shouldRender = true, silent = false, forceApply = false) {
  if (!cloudReady()) {
    state.cloudStatus = "Cloud non configuré.";
    if (shouldRender) render();
    return;
  }
  if (state.cloudSaveTimer || state.cloudSaveQueued) {
    if (!silent) state.cloudStatus = "Chargement reporte : une sauvegarde locale est en attente.";
    if (shouldRender) render();
    return;
  }
  clearLocalChangedForCloud();
  state.cloudSyncing = true;
  if (!silent) state.cloudStatus = "Chargement depuis le cloud...";
  if (shouldRender) render();
  try {
    const response = await cloudFetchWithAuthRetry(`${cloudEndpoint()}?select=id,etab_id,data,updated_at&${planningQuery()}`);
    if (!response.ok) throw new Error(await response.text());
    const rows = sortedPlanningRowsForCurrentEtab(await response.json());
    if (!rows.length) {
      if (!silent) state.cloudStatus = "Aucune sauvegarde cloud trouvée pour cet identifiant.";
      state.cloudSourceLoaded = true;
    } else if (!forceApply && !cloudRemoteIsNewer(rows[0].updated_at)) {
      if (!silent) state.cloudStatus = `Données déjà à jour (${new Date(rows[0].updated_at).toLocaleString("fr-FR")}).`;
      state.cloudSourceLoaded = true;
    } else {
      applyPlanningData(rows[0].data);
      state.cloudLastUpdatedAt = rows[0].updated_at;
      state.cloudSourceLoaded = true;
      state.cloudStatus = `Données cloud chargées (${new Date(rows[0].updated_at).toLocaleString("fr-FR")}).`;
    }
  } catch (error) {
    if (!silent) {
      const message = error.message || "chargement impossible";
      state.cloudStatus = cloudErrorLooksLikeExpiredJwt(message) ? "Erreur cloud : session Supabase expirée. Reconnectez-vous, puis rechargez le planning." : `Erreur cloud : ${message}`;
    }
  } finally {
    state.cloudSyncing = false;
    if (shouldRender) render();
  }
}
export function restartCloudAutoRefresh() {
  clearInterval(state.cloudRefreshTimer);
  state.cloudRefreshTimer = null;
}
