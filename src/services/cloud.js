import { pageMemory } from "./page-memory.js";
import { fetchBackend } from "../security/fetch.js";
import { validatePlanningData } from "../security/data.js";
import { secureBackendUrl, isSecureBackend } from "../security/transport.js";
import { securityEvent } from "../security/log.js";
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
    const saved = pageMemory.getItem(state.CLOUD_CONFIG_KEY);
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
  state.cloudBaseData = null;
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
      return JSON.parse(pageMemory.getItem(state.CLOUD_CONFIG_KEY) || "null");
    } catch {
      return null;
    }
  })();
  const previousIdentity = cloudConfigIdentity(previousConfig);
  const nextIdentity = cloudConfigIdentity(state.cloudConfig);
  pageMemory.setItem(state.CLOUD_CONFIG_KEY, JSON.stringify(state.cloudConfig));
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
    const saved = pageMemory.getItem(state.PREREQUISITE_LOCKS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaultPrerequisiteLocks(false),
        ...parsed
      };
    }
    return defaultPrerequisiteLocks(pageMemory.getItem(state.PREREQUISITES_LOCK_KEY) === "true");
  } catch {
    return defaultPrerequisiteLocks(false);
  }
}
export function prerequisiteLocked(mode = state.prerequisiteMode) {
  return Boolean(state.prerequisiteLocks[mode]);
}
export function loadYearPrerequisiteLocks() {
  try {
    const saved = pageMemory.getItem(state.YEAR_PREREQUISITE_LOCKS_KEY);
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
  pageMemory.setItem(state.PREREQUISITE_LOCKS_KEY, JSON.stringify({
    ...defaultPrerequisiteLocks(false),
    ...state.prerequisiteLocks
  }));
  pageMemory.setItem(state.PREREQUISITES_LOCK_KEY, state.prerequisiteSubModes.every(mode => prerequisiteLocked(mode)) ? "true" : "false");
  saveLocksToCloudNow(["prerequisiteLocks"]);
}
export function saveYearPrerequisiteLocks() {
  pageMemory.setItem(state.YEAR_PREREQUISITE_LOCKS_KEY, JSON.stringify({
    ...defaultYearPrerequisiteLocks(false),
    ...state.yearPrerequisiteLocks
  }));
  saveLocksToCloudNow(["yearPrerequisiteLocks"]);
}
export function loadCloudDirtyKeys() {
  try {
    const saved = JSON.parse(pageMemory.getItem(state.CLOUD_DIRTY_KEYS_KEY) || "[]");
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
  pageMemory.setItem(state.CLOUD_LOCAL_UNSYNCED_KEY, state.localUnsyncedChanges);
  normalizeCloudDirtyKeys(keys).forEach(key => state.cloudDirtyKeys.add(key));
  pageMemory.setItem(state.CLOUD_DIRTY_KEYS_KEY, JSON.stringify([...state.cloudDirtyKeys]));
}
export function clearLocalChangedForCloud() {
  state.localUnsyncedChanges = "";
  state.cloudDirtyKeys = new Set();
  pageMemory.removeItem(state.CLOUD_LOCAL_UNSYNCED_KEY);
  pageMemory.removeItem(state.CLOUD_DIRTY_KEYS_KEY);
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
  if (!cloudSourceReadyForWrite()) {
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
  if (!cloudSourceReadyForWrite()) {
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
  return cloudReady() && isSecureBackend(state.cloudConfig.url) && !isLocalRuntime();
}
export function cloudSourceReadyForWrite() {
  return cloudWriteAllowed() && state.cloudSourceLoaded;
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
  const base = secureBackendUrl(state.cloudConfig.url);
  return `${base}/rest/v1/eps_plannings`;
}
export function feedbackEndpoint() {
  const base = secureBackendUrl(state.cloudConfig.url);
  return `${base}/rest/v1/eps_feedback`;
}
export function etabMembersEndpoint() {
  const base = secureBackendUrl(state.cloudConfig.url);
  return `${base}/rest/v1/etab_members`;
}
export function etabsEndpoint() {
  const base = secureBackendUrl(state.cloudConfig.url);
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
  const originalSession = state.adminSession;
  const scope = operationScope();
  if (!state.adminSession?.refresh_token || !state.cloudConfig.url || !state.cloudConfig.anonKey) return false;
  const response = await fetchBackend(`${authEndpoint("token")}?grant_type=refresh_token`, {
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
  if (!refreshed?.access_token || originalSession !== state.adminSession || scope !== operationScope()) return false;
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
  const scope = operationScope();
  if (new URL(url).origin !== secureBackendUrl(state.cloudConfig.url)) throw new Error("Destination réseau refusée.");
  await ensureCloudSessionFresh();
  assertOperationScope(scope);
  const buildOptions = () => ({
    ...options,
    headers: cloudHeaders(options.headers || {})
  });
  let response = await fetchBackend(url, buildOptions());
  if (!retryOnExpiredJwt || response.ok) return response;
  const errorText = await response.clone().text();
  if (!cloudErrorLooksLikeExpiredJwt(errorText)) return response;
  state.cloudStatus = "Session Supabase expirée : reconnexion automatique...";
  const refreshed = await refreshAdminSessionForCloud();
  if (!refreshed) return response;
  assertOperationScope(scope);
  return fetchBackend(url, buildOptions());
}
export function clearPlanningMemoryForEtabSwitch() {
  ["planningEpsTeachers2026", "planningEpsClassConfig2026", "planningEpsFacilities2026", "planningEpsActivities2026", "planningEpsFacilityActivities2026", "planningEpsActivityProgramByLevel2026", "planningEpsActivityProgramByClass2026", "planningEpsYearPlan2026", "planningEpsCycles2026", "planningEpsCyclesByLevel2026", "planningEpsServiceHoursByLevel2026", "planningEpsServiceAssignments2026", "planningEpsSchoolConstraints2026", state.PREREQUISITE_LOCKS_KEY, state.YEAR_PREREQUISITE_LOCKS_KEY, state.PREREQUISITES_LOCK_KEY, "planningEpsConstructionWorkspaceMode2026", "planningEpsConstructionVersions2026", "planningEpsConstructionLocks2026", "planningEpsConstructionRuleSettings2026", "planningEpsConstructionRules2026", "planningEpsConstruction2026", "planningEpsBlockExclusions2026", "planningEpsAcceptedConflicts2026", "planningEpsSportEvents2026", "planningEpsAsSessions2026", "planningEpsFacilityUnavailability2026", "planningEpsEventExclusions2026", "planningEpsAsExclusions2026", "planningEpsHiddenConstructionBlocksReport2026", state.CLOUD_LOCAL_UNSYNCED_KEY, state.CLOUD_DIRTY_KEYS_KEY].forEach(key => pageMemory.removeItem(key));
  state.localUnsyncedChanges = "";
  state.cloudDirtyKeys = new Set();
}
export function resetPlanningStateFromDefaults() {
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
  validatePlanningData(data);
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
  pageMemory.setItem("planningEpsTeachers2026", JSON.stringify(state.teachers));
  pageMemory.setItem("planningEpsClassConfig2026", JSON.stringify(state.classConfig));
  pageMemory.setItem("planningEpsFacilities2026", JSON.stringify(state.facilities));
  pageMemory.setItem("planningEpsActivities2026", JSON.stringify(state.activities));
  pageMemory.setItem("planningEpsFacilityActivities2026", JSON.stringify(state.facilityActivities));
  pageMemory.setItem("planningEpsActivityProgramByLevel2026", JSON.stringify(state.activityProgramByLevel));
  pageMemory.setItem("planningEpsActivityProgramByClass2026", JSON.stringify(state.activityProgramByClass));
  pageMemory.setItem("planningEpsYearPlan2026", JSON.stringify(state.yearPlan));
  pageMemory.setItem("planningEpsCycles2026", JSON.stringify(state.cycles));
  pageMemory.setItem("planningEpsCyclesByLevel2026", JSON.stringify(state.cyclesByLevel));
  pageMemory.setItem("planningEpsServiceHoursByLevel2026", JSON.stringify(state.serviceHoursByLevel));
  pageMemory.setItem("planningEpsServiceAssignments2026", JSON.stringify(state.serviceAssignments));
  pageMemory.setItem("planningEpsSchoolConstraints2026", JSON.stringify(state.schoolConstraints));
  pageMemory.setItem(state.PREREQUISITE_LOCKS_KEY, JSON.stringify(state.prerequisiteLocks));
  pageMemory.setItem(state.YEAR_PREREQUISITE_LOCKS_KEY, JSON.stringify(state.yearPrerequisiteLocks));
  pageMemory.setItem(state.PREREQUISITES_LOCK_KEY, state.prerequisiteSubModes.every(mode => prerequisiteLocked(mode)) ? "true" : "false");
  pageMemory.setItem("planningEpsConstructionWorkspaceMode2026", state.constructionWorkspaceMode);
  pageMemory.setItem("planningEpsConstructionVersions2026", JSON.stringify(state.constructionVersions));
  pageMemory.setItem("planningEpsConstructionLocks2026", JSON.stringify(state.constructionLocks));
  pageMemory.setItem("planningEpsConstructionRuleSettings2026", JSON.stringify(state.constructionRuleSettings));
  pageMemory.setItem("planningEpsConstructionRules2026", JSON.stringify(state.constructionRules));
  pageMemory.setItem("planningEpsConstruction2026", JSON.stringify(state.constructionPlan));
  pageMemory.setItem("planningEpsBlockExclusions2026", JSON.stringify(state.blockExclusions));
  pageMemory.setItem("planningEpsAcceptedConflicts2026", JSON.stringify(state.acceptedConflicts));
  pageMemory.setItem("planningEpsSportEvents2026", JSON.stringify(state.sportEvents));
  pageMemory.setItem("planningEpsAsSessions2026", JSON.stringify(state.asSessions));
  pageMemory.setItem("planningEpsFacilityUnavailability2026", JSON.stringify(state.facilityUnavailability));
  pageMemory.setItem("planningEpsEventExclusions2026", JSON.stringify(state.eventExclusions));
  pageMemory.setItem("planningEpsAsExclusions2026", JSON.stringify(state.asExclusions));
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
  if (!cloudSourceReadyForWrite()) {
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
  clearTimeout(state.cloudSaveTimer);
  state.cloudSaveTimer = null;
  if (state.cloudSyncing) { state.cloudSaveQueued = true; return; }
  if (state.signingOut || !isAdmin() || !cloudSourceReadyForWrite()) {
    state.cloudStatus = "Sauvegarde indisponible : vos modifications restent dans cet onglet jusqu'à sa fermeture.";
    if (shouldRender) render();
    return;
  }
  const changedKeys = [...state.cloudDirtyKeys].filter(key => state.cloudDataKeys.includes(key));
  if (!changedKeys.length) return;
  const scope = operationScope();
  const currentData = JSON.parse(JSON.stringify(collectPlanningData()));
  const baseData = state.cloudBaseData;
  state.cloudSyncing = true;
  state.cloudStatus = "Sauvegarde cloud en cours...";
  if (shouldRender) render();
  let succeeded = false;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      assertOperationScope(scope);
      const remoteResponse = await cloudFetchWithAuthRetry(`${cloudEndpoint()}?select=id,etab_id,data,updated_at&${planningQuery()}`);
      if (!remoteResponse.ok) throw new Error("Lecture avant sauvegarde impossible.");
      const rows = await remoteResponse.json();
      assertOperationScope(scope);
      const remoteRow = sortedPlanningRowsForCurrentEtab(rows)[0] || null;
      const remoteData = remoteRow?.data || null;
      if (remoteData) {
        assertPlanningDataMatchesActiveScope(remoteData, "Sauvegarde");
        if (!remoteRow.updated_at) throw new Error("Version distante absente : sauvegarde suspendue.");
        // Never overwrite a concurrent edit to the same section after a prior load.
        if (baseData && changedKeys.some(key => JSON.stringify(baseData[key]) !== JSON.stringify(remoteData[key]) && JSON.stringify(currentData[key]) !== JSON.stringify(remoteData[key]))) {
          throw new Error("Conflit : une même zone a été modifiée ailleurs. Vos modifications restent dans cet onglet ; comparez-les avant de recharger.");
        }
      }
      const updatedAt = new Date(Math.max(Date.now(), (Date.parse(remoteRow?.updated_at) || 0) + 1)).toISOString();
      const dataToSave = { ...(remoteData || currentData), savedAt: updatedAt, etabId: currentData.etabId, planningId: currentData.planningId };
      for (const key of changedKeys) dataToSave[key] = currentData[key];
      const rowPayload = { etab_id: currentData.etabId, id: remoteRow?.id || cloudPlanningRowId(), data: dataToSave, updated_at: updatedAt };
      const target = remoteRow ? `${cloudEndpoint()}?${planningRowQuery(remoteRow.id)}&updated_at=eq.${encodeURIComponent(remoteRow.updated_at)}` : cloudEndpoint();
      assertOperationScope(scope);
      const response = await cloudFetchWithAuthRetry(target, {
        method: remoteRow ? "PATCH" : "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(rowPayload)
      });
      assertOperationScope(scope);
      if (response.status === 409 && !remoteRow) continue;
      if (!response.ok) throw new Error("Sauvegarde refusée par le serveur. Vos modifications restent dans cet onglet jusqu'à sa fermeture.");
      const acknowledged = await response.json();
      assertOperationScope(scope);
      // A successful HTTP response with zero updated rows is a concurrency conflict.
      if (Array.isArray(acknowledged) && acknowledged.length === 0) continue;
      if (!Array.isArray(acknowledged) || acknowledged.length !== 1 || acknowledged[0].id !== rowPayload.id || acknowledged[0].etab_id !== rowPayload.etab_id) throw new Error("Sauvegarde non confirmée par le serveur.");
      state.cloudLastUpdatedAt = acknowledged[0].updated_at || updatedAt;
      state.cloudSourceLoaded = true;
      // Keep the old baseline for untouched local sections: these were not reloaded.
      if (baseData) {
        state.cloudBaseData = { ...baseData };
        for (const key of changedKeys) state.cloudBaseData[key] = currentData[key];
      }
      const latest = collectPlanningData();
      for (const key of changedKeys) {
        if (JSON.stringify(latest[key]) === JSON.stringify(currentData[key])) state.cloudDirtyKeys.delete(key);
      }
      if (state.cloudDirtyKeys.size) pageMemory.setItem(state.CLOUD_DIRTY_KEYS_KEY, JSON.stringify([...state.cloudDirtyKeys]));
      else clearLocalChangedForCloud();
      state.cloudStatus = `Sauvegarde confirmée à ${new Date(updatedAt).toLocaleTimeString("fr-FR")}.`;
      showValidationPopup(state.cloudStatus);
      succeeded = true;
      break;
    }
    if (!succeeded) throw new Error("Sauvegardes concurrentes : réessayez. Vos modifications restent dans cet onglet jusqu'à sa fermeture.");
  } catch (error) {
    securityEvent("save_failed");
    if (operationScope() === scope) {
      const networkFailure = /fetch|network|réseau/i.test(error.message || "");
      state.cloudStatus = networkFailure ? "Sauvegarde impossible : connexion à Supabase indisponible. Vos modifications restent dans cet onglet jusqu'à sa fermeture." : error.message || "Sauvegarde impossible. Vos modifications restent dans cet onglet jusqu'à sa fermeture.";
      showValidationPopup(state.cloudStatus, "error");
    }
  } finally {
    state.cloudSyncing = false;
    if (operationScope() === scope && state.cloudSaveQueued) {
      state.cloudSaveQueued = false;
      if (succeeded && state.cloudDirtyKeys.size) scheduleCloudSave();
    }
    if (operationScope() === scope) render();
    else if (!state.cloudSourceLoaded) requestInitialCloudLoad(false, true);
  }
}

function operationScope() {
  return cloudConfigIdentity(state.cloudConfig) + "|" + (state.adminSession?.user?.id || state.adminSession?.access_token || "") + "|" + Boolean(state.signingOut);
}
function assertOperationScope(scope) {
  if (operationScope() !== scope) throw new Error("Opération annulée : le compte ou l’établissement a changé.");
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
  if (state.cloudSyncing || state.cloudSaveTimer || state.cloudSaveQueued || state.cloudDirtyKeys.size) {
    if (!silent) state.cloudStatus = "Chargement reporté : une sauvegarde Supabase est en attente.";
    if (shouldRender) render();
    return;
  }
  const scope = operationScope();
  state.cloudSyncing = true;
  if (!silent) state.cloudStatus = "Chargement depuis le cloud...";
  if (shouldRender) render();
  try {
    const response = await cloudFetchWithAuthRetry(`${cloudEndpoint()}?select=id,etab_id,data,updated_at&${planningQuery()}`);
    if (!response.ok) throw new Error(await response.text());
    const received = await response.json();
    assertOperationScope(scope);
    const rows = sortedPlanningRowsForCurrentEtab(received);
    if (state.cloudDirtyKeys.size) {
      state.cloudSourceLoaded = true;
      state.cloudStatus = "Modifications locales conservées pendant le chargement.";
      return;
    }
    if (!rows.length) {
      if (!silent) state.cloudStatus = "Aucune sauvegarde cloud trouvée pour cet identifiant.";
      state.cloudSourceLoaded = true;
    } else if (!forceApply && !cloudRemoteIsNewer(rows[0].updated_at)) {
      if (!silent) state.cloudStatus = `Données déjà à jour (${new Date(rows[0].updated_at).toLocaleString("fr-FR")}).`;
      state.cloudSourceLoaded = true;
    } else {
      applyPlanningData(rows[0].data);
      state.cloudBaseData = JSON.parse(JSON.stringify(rows[0].data));
      state.cloudLastUpdatedAt = rows[0].updated_at;
      state.cloudSourceLoaded = true;
      state.cloudStatus = `Données cloud chargées (${new Date(rows[0].updated_at).toLocaleString("fr-FR")}).`;
    }
  } catch (error) {
    securityEvent("load_failed");
    if (!silent && operationScope() === scope) {
      const message = error.message || "chargement impossible";
      state.cloudStatus = cloudErrorLooksLikeExpiredJwt(message) ? "Erreur cloud : session Supabase expirée. Reconnectez-vous, puis rechargez le planning." : `Erreur cloud : ${message}`;
    }
  } finally {
    state.cloudSyncing = false;
    if (operationScope() === scope && state.cloudSaveQueued) {
      state.cloudSaveQueued = false;
      scheduleCloudSave();
    }
    if (operationScope() !== scope && !state.cloudSourceLoaded) requestInitialCloudLoad(false, true);
    if (shouldRender) render();
  }
}
export function restartCloudAutoRefresh() {
  clearInterval(state.cloudRefreshTimer);
  state.cloudRefreshTimer = null;
}
