import { state } from "./state.js";
import { loadCycles, loadCyclesByLevel } from "../domain/cycles.js";
import { applyImportedClassLevels, classLevelsForEstablishmentType, defaultClassConfigForLevels } from "../domain/settings.js";
import { purgeConstructionForUnavailableItems } from "../domain/unavailability.js";
import { inviteTokenFromUrl, loadAdminSession } from "../services/auth.js";
import { cloudReady, cloudWriteAllowed, cloudWriteBlockedMessage, loadCloudConfig, loadCloudDirtyKeys, loadPrerequisiteLocks, loadYearPrerequisiteLocks, normalizePlanningItems } from "../services/cloud.js";
import { loadYearPlan, saveConstructionPlan } from "../services/planning-storage.js";
import { buildConstructionPlanFromRules, classesFromConfig, loadAcceptedConflicts, loadActivities, loadActivityProgramByClass, loadActivityProgramByLevel, loadAsExclusions, loadAsSessions, loadBlockExclusions, loadClassConfig, loadConstructionLocks, loadConstructionRuleSettings, loadConstructionRules, loadConstructionVersions, loadConstructionWorkspaceMode, loadEventExclusions, loadFacilities, loadFacilityActivities, loadFacilityUnavailability, loadSchoolConstraints, loadServiceAssignments, loadServiceHoursByLevel, loadSportEvents, loadTeachers, normalizeClassConfig, saveBlockExclusions } from "../services/settings-storage.js";

export function initializeState() {
  state.defaultTeachers = [{
    id: "p1",
    name: "Prof A",
    color: "#bfdbfe",
    border: "#2563eb",
    monthlyTarget: 68,
    weeklyReference: 17,
    weekTargets: {
      A: 18,
      B: 16
    }
  }, {
    id: "p2",
    name: "Prof B",
    color: "#bbf7d0",
    border: "#16a34a",
    monthlyTarget: 68,
    weeklyReference: 17,
    weekTargets: {
      A: 16,
      B: 18
    }
  }, {
    id: "p3",
    name: "Prof C",
    color: "#fecaca",
    border: "#dc2626",
    monthlyTarget: 68,
    weeklyReference: 17,
    weekTargets: {
      A: 18,
      B: 16
    }
  }, {
    id: "p4",
    name: "Prof D",
    color: "#ddd6fe",
    border: "#7c3aed",
    monthlyTarget: 68,
    weeklyReference: 17,
    weekTargets: {
      A: 16,
      B: 18
    }
  }, {
    id: "p5",
    name: "Prof E agrégé",
    color: "#fde68a",
    border: "#d97706",
    monthlyTarget: 56,
    weeklyReference: 14,
    weekTargets: {
      A: 14,
      B: 14
    }
  }];
  state.teacherPalette = [{
    color: "#93c5fd",
    border: "#1d4ed8"
  }, {
    color: "#60a5fa",
    border: "#1d4ed8"
  }, {
    color: "#38bdf8",
    border: "#0369a1"
  }, {
    color: "#818cf8",
    border: "#4338ca"
  }, {
    color: "#86efac",
    border: "#15803d"
  }, {
    color: "#fca5a5",
    border: "#b91c1c"
  }, {
    color: "#f87171",
    border: "#b91c1c"
  }, {
    color: "#fb7185",
    border: "#be123c"
  }, {
    color: "#f43f5e",
    border: "#9f1239"
  }, {
    color: "#c4b5fd",
    border: "#6d28d9"
  }, {
    color: "#fcd34d",
    border: "#b45309"
  }, {
    color: "#f9a8d4",
    border: "#be185d"
  }, {
    color: "#5eead4",
    border: "#0f766e"
  }, {
    color: "#fdba74",
    border: "#c2410c"
  }, {
    color: "#d6b47f",
    border: "#92400e"
  }, {
    color: "#7dd3fc",
    border: "#0369a1"
  }, {
    color: "#6ee7b7",
    border: "#047857"
  }, {
    color: "#e879f9",
    border: "#a21caf"
  }, {
    color: "#a78bfa",
    border: "#5b21b6"
  }, {
    color: "#fde047",
    border: "#a16207"
  }, {
    color: "#fda4af",
    border: "#be123c"
  }, {
    color: "#67e8f9",
    border: "#0e7490"
  }, {
    color: "#bef264",
    border: "#4d7c0f"
  }, {
    color: "#fb923c",
    border: "#9a3412"
  }, {
    color: "#d8b4fe",
    border: "#7e22ce"
  }, {
    color: "#f0abfc",
    border: "#86198f"
  }, {
    color: "#99f6e4",
    border: "#0f766e"
  }, {
    color: "#bfdbfe",
    border: "#1e40af"
  }, {
    color: "#fbcfe8",
    border: "#9d174d"
  }, {
    color: "#bae6fd",
    border: "#075985"
  }, {
    color: "#bbf7d0",
    border: "#166534"
  }, {
    color: "#fed7aa",
    border: "#c2410c"
  }, {
    color: "#ddd6fe",
    border: "#4c1d95"
  }, {
    color: "#fecdd3",
    border: "#be123c"
  }, {
    color: "#fde68a",
    border: "#92400e"
  }, {
    color: "#a7f3d0",
    border: "#047857"
  }, {
    color: "#f5d0fe",
    border: "#86198f"
  }];
  state.teachers = loadTeachers();
  state.days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
  state.defaultCourseSlots = [{
    id: "8",
    label: "8h-10h",
    hours: 2
  }, {
    id: "10",
    label: "10h-12h",
    hours: 2
  }, {
    id: "13",
    label: "13h30-15h30",
    hours: 2
  }, {
    id: "15",
    label: "15h30-16h30",
    hours: 1
  }];
  state.defaultAsSlots = [{
    id: "as",
    label: "AS 12h30-13h15",
    days: ["Lundi", "Mardi", "Jeudi", "Vendredi"],
    hours: 0.75
  }, {
    id: "as",
    label: "AS 12h30-15h30",
    days: ["Mercredi"],
    hours: 3
  }];
  state.defaultSchoolConstraints = {
    establishmentName: "",
    establishmentType: "collège",
    schoolZone: "B",
    courseSlots: state.defaultCourseSlots,
    asSlots: state.defaultAsSlots,
    asWeekdayLabel: "AS 12h30-13h15",
    asWednesdayLabel: "AS 12h30-15h30"
  };
  state.schoolConstraints = loadSchoolConstraints();
  state.slots = state.schoolConstraints.courseSlots;
  state.defaultFacilities = [{
    id: "gym",
    label: "Salle de gym",
    type: "external",
    locationType: "indoor"
  }, {
    id: "boxe",
    label: "Salle de boxe",
    type: "external",
    locationType: "indoor"
  }, {
    id: "bad",
    label: "Salle de badminton",
    type: "external",
    locationType: "indoor"
  }, {
    id: "piscine",
    label: "Piscine",
    type: "external",
    locationType: "indoor"
  }, {
    id: "cour",
    label: "Cour",
    type: "internal",
    locationType: "outdoor"
  }, {
    id: "terrains",
    label: "Petits terrains",
    type: "internal",
    locationType: "outdoor"
  }, {
    id: "basketball",
    label: "Basketball",
    type: "internal",
    locationType: "outdoor"
  }];
  state.facilities = loadFacilities();
  state.activities = loadActivities();
  state.facilityActivities = loadFacilityActivities();
  state.classLevelsByEstablishmentType = {
    "collège": ["6e", "5e", "4e", "3e"],
    "lycée": ["2de", "1ere", "Tle"]
  };
  state.classLevels = classLevelsForEstablishmentType(state.schoolConstraints.establishmentType);
  state.activityProgramByLevel = loadActivityProgramByLevel();
  state.classNumbers = ["1", "2", "3", "4", "5", "6", "7"];
  state.defaultClassConfig = defaultClassConfigForLevels();
  state.classGroups = [{
    id: "whole",
    label: "Classe entiere",
    short: ""
  }, {
    id: "A",
    label: "Demi-groupe A",
    short: "A"
  }, {
    id: "B",
    label: "Demi-groupe B",
    short: "B"
  }];
  state.classConfig = loadClassConfig();
  applyImportedClassLevels(state.classConfig);
  state.classConfig = normalizeClassConfig(state.classConfig);
  state.classes = classesFromConfig();
  state.activityProgramByClass = loadActivityProgramByClass();
  state.defaultServiceHours = {
    "6e": 4,
    "5e": 3,
    "4e": 3,
    "3e": 3,
    "CAP1": 2,
    "CAP2": 2,
    "2de": 2,
    "1ere": 2,
    "Tle": 2,
    "BTS1": 2,
    "BTS2": 2
  };
  state.defaultConstructionRuleSettings = [{
    id: "facility-unavailable",
    category: "Conflit installation",
    title: "Installation disponible",
    detail: "Impossible de placer une classe sur une installation indiquée indisponible sur le créneau."
  }, {
    id: "teacher-unavailable",
    category: "Conflit prof",
    title: "Prof disponible",
    detail: "Impossible de placer un cours avec un professeur indisponible sur le créneau."
  }, {
    id: "class-unavailable",
    category: "Conflit classe",
    title: "Classe disponible",
    detail: "Impossible de placer une classe indiquée indisponible sur le créneau."
  }, {
    id: "teacher-single-place",
    category: "Conflit prof",
    title: "Un prof, un seul cours",
    detail: "Un professeur ne peut pas être affecté à deux cours différents sur le même créneau."
  }, {
    id: "facility-single-place",
    category: "Conflit installation",
    title: "Une installation, un seul cours",
    detail: "Une installation ne peut pas accueillir deux cours sur le même créneau, sauf co-intervention explicite."
  }, {
    id: "class-single-place",
    category: "Conflit classe",
    title: "Une classe, un seul cours",
    detail: "Une classe ou un demi-groupe ne peut pas etre place sur deux cours qui se chevauchent."
  }, {
    id: "service-theorique",
    category: "Service",
    title: "Respect du service théorique",
    detail: "En construction, les classes proposees pour un prof doivent correspondre a son service théorique."
  }, {
    id: "facility-activity-link",
    category: "Installations / activités",
    title: "Activités compatibles",
    detail: "Une installation ne propose que les activités qui lui sont reliées dans Installations & activités."
  }, {
    id: "seasonal-location-preference",
    category: "Règles définies par l’établissement",
    title: "Saisonnalité des lieux",
    detail: "Privilégier les lieux en extérieur au premier et au dernier cycle, et les lieux en intérieur sur les cycles intermédiaires."
  }, {
    id: "class-activity-program",
    category: "Installations / activités",
    title: "Programme annuel des classes",
    detail: "Chaque classe doit faire toutes les activités prévues dans son programme annuel."
  }, {
    id: "class-single-activity-per-cycle",
    category: "Règles définies par l’établissement",
    title: "Activité unique hors 6e",
    detail: "Sur un même cycle, les classes de 5e, 4e et 3e font une seule activité. Les 6e suivent leur règle spécifique."
  }, {
    id: "sixth-grade-dual-activity-swimming",
    category: "Règles définies par l’établissement",
    title: "Programme spécifique 6e",
    detail: "Les classes de 6e font exactement deux activités distinctes par cycle. La natation, associée à la piscine, est obligatoire sur les trois premiers cycles."
  }, {
    id: "twenty-four-hours",
    category: "Rythme classe",
    title: "24h entre deux cours EPS",
    detail: "Une classe ne devrait pas refaire EPS à moins de 24h d'intervalle."
  }, {
    id: "cycle-week-type",
    category: "Cycle",
    title: "Construction par semaine type",
    detail: "Un bloc construit sur la semaine type doit se répercuter sur les semaines du cycle concerné."
  }, {
    id: "annual-skeleton",
    category: "Cycle",
    title: "Socle annuel profs/classes",
    detail: "Les duos prof-classe et le type de semaine sont fixés sur l'année ; seules les installations et activités varient par cycle."
  }, {
    id: "cycle-details-required",
    category: "Installations / activités",
    title: "Détails par cycle",
    detail: "Chaque bloc annuel doit recevoir une installation et une activité par cycle quand l'installation propose des activités."
  }, {
    id: "cointervention-full-slot",
    category: "Co-intervention",
    title: "Co-intervention sur tout le créneau",
    detail: "En co-intervention, les deux professeurs sont présents sur toute la durée du créneau, dans la même installation, avec des classes différentes."
  }, {
    id: "option-blocks",
    category: "Options",
    title: "Blocs option sans classe obligatoire",
    detail: "Les horaires libres du service théorique peuvent devenir des blocs Option sans classe obligatoire, avec une durée précisée dans le bloc profs/classes."
  }, {
    id: "class-weekly-volume",
    category: "Service",
    title: "Volume hebdomadaire par classe",
    detail: "Les blocs profs/classes doivent permettre a chaque classe d’atteindre son volume EPS hebdomadaire : 4h en 6e, 3h en 5e, 4e et 3e."
  }, {
    id: "supabase-source",
    category: "Sauvegarde",
    title: "Supabase source officielle",
    detail: "Les données de construction, versions, verrous et liens installations/activités sont rechargées depuis Supabase comme source de référence."
  }];
  state.constructionRuleCategoryChoices = ["Conflit prof", "Conflit classe", "Conflit installation", "Service", "Installations / activités", "Règles définies par l’établissement", "Rythme classe", "Cycle", "Co-intervention", "Options", "Sauvegarde", "Autre"];
  state.schoolYear = {
    label: "2026/2027",
    start: new Date(2026, 8, 1),
    end: new Date(2027, 6, 31)
  };
  state.calendarDisplayEnd = new Date(2027, 6, 11);
  state.seed = 0;
  state.view = "calendar";
  state.week = "current";
  state.selectedYearWeekRank = null;
  state.selectedYearCellKey = "";
  state.displayedCurrentWeekRank = null;
  state.selectedTeacherIds = state.teachers.map(teacher => teacher.id);
  state.sidebarCollapsed = localStorage.getItem("planningEpsSidebarCollapsed2026") === "true";
  state.yearPlan = loadYearPlan();
  state.cycles = loadCycles();
  state.cyclesByLevel = loadCyclesByLevel();
  state.activeCycleScope = "default";
  state.activeCycleId = state.cycles[0].id;
  state.activeConstructionCycleId = state.cycles[0]?.id || "cycle-1";
  state.constructionBuildMode = "blocks";
  state.constructionHelpOpen = false;
  state.cycleSaveStatus = "";
  state.constructionRules = loadConstructionRules();
  state.eventExclusions = loadEventExclusions();
  state.asExclusions = loadAsExclusions();
  state.blockExclusions = loadBlockExclusions();
  state.acceptedConflicts = loadAcceptedConflicts();
  state.constructionPlan = {};
  state.constructionMode = "planning";
  state.constructionWorkspaceMode = loadConstructionWorkspaceMode();
  state.constructionVersions = loadConstructionVersions();
  state.constructionLocks = loadConstructionLocks();
  state.constructionOptimizeConfirmOpen = false;
  state.constructionServiceSummaryHidden = localStorage.getItem("planningEpsConstructionServiceSummaryHidden2026") === "true";
  state.constructionConflictsHidden = localStorage.getItem("planningEpsConstructionConflictsHidden2026") === "true";
  state.constructionVersionPanelOpen = false;
  state.constructionVersionDraftName = "";
  state.constructionVersionDraftParts = [];
  state.constructionRuleSettings = loadConstructionRuleSettings();
  state.expandedConstructionRuleCategory = "";
  state.constructionOptimizationResult = null;
  state.constructionChecksRevision = 0;
  state.constructionChecksCache = {
    revision: -1
  };
  state.prerequisiteMode = "establishment";
  state.yearPrerequisiteMode = "unavailable";
  state.prerequisiteLocks = {};
  state.yearPrerequisiteLocks = {};
  state.constructionZoom = 1;
  state.constructionPrintTrimesterExport = false;
  state.cycleViewZoom = 0.6;
  state.clearConstructionPanelOpen = false;
  state.activeHomeCycleId = null;
  state.activeCycleLetter = "A";
  state.cycleTeacherIds = state.teachers.map(teacher => teacher.id);
  state.cycleFacilityIds = state.facilities.map(facility => facility.id);
  state.serviceHoursByLevel = loadServiceHoursByLevel();
  state.serviceAssignments = loadServiceAssignments();
  state.serviceLevelByTeacher = {};
  state.serviceClassByTeacher = {};
  state.serviceDraftHours = {};
  state.serviceFreeDrafts = {};
  state.blockTeacherIds = [];
  state.blockClass = "";
  state.blockClassLevel = "";
  state.blockTeacherClasses = {};
  state.blockTeacherClassLevels = {};
  state.blockFacilityId = "";
  state.blockActivityId = "";
  state.blockWeekLetter = "all";
  state.blockSecondTeacherHours = "";
  state.blockCoIntervention = false;
  state.blockIsOption = false;
  state.blockOptionId = "";
  state.blockOptionHours = "";
  state.blockOptionCycleIds = [];
  state.facilityDraftName = "";
  state.facilityDraftType = "";
  state.facilityDraftLocationType = "";
  state.activityDraftName = "";
  state.specialClassDraftName = "";
  state.specialClassDraftBaseIds = [];
  state.teacherDraftName = "";
  state.teacherDraftColor = state.teacherPalette[0].color;
  state.teacherDraftStatus = "";
  state.expandedTeacherColorId = "";
  state.activeBuildCell = null;
  state.activeBuildCycleId = null;
  state.editingBuildBlock = null;
  state.movingBuildBlock = null;
  state.ignoreNextMoveCellClick = false;
  state.pendingBlockDelete = null;
  state.sportEvents = loadSportEvents();
  state.asSessions = loadAsSessions();
  state.eventName = "";
  state.eventStart = "2026-10-05";
  state.eventEnd = "2026-10-09";
  state.eventHalfDay = "all";
  state.eventTeacherIds = [];
  state.eventClasses = [];
  state.eventClassLevelFilter = "";
  state.editingEventId = null;
  state.asName = "";
  state.asStart = "2026-09-14";
  state.asEnd = "2027-06-04";
  state.asWeekdays = [];
  state.asTeacherIds = [];
  state.editingAsId = null;
  state.facilityUnavailability = loadFacilityUnavailability();
  state.unavailablePurgeOnLoad = purgeConstructionForUnavailableItems(state.facilityUnavailability);
  state.constructionPlan = buildConstructionPlanFromRules();
  state.unavailableName = "Installation occupée";
  state.unavailableType = "facility";
  state.unavailableFacilityIds = [];
  state.unavailableClassIds = [];
  state.unavailableTeacherIds = [];
  state.unavailableClassLevelFilter = "";
  state.unavailablePeriodMode = "dates";
  state.unavailableCycleIds = [];
  state.unavailableStart = "2026-09-01";
  state.unavailableEnd = "2027-07-02";
  state.unavailableWeekdays = [];
  state.unavailableSlotIds = [];
  state.unavailableCells = [];
  state.expandedUnavailableGroup = "";
  state.editingUnavailableId = null;
  state.requestKind = "bug";
  state.requestAuthor = "";
  state.requestMessage = "";
  state.requestStatus = "";
  state.requestSubmitting = false;
  state.validationPopupMessage = "";
  state.validationPopupType = "success";
  state.validationPopupTimer = null;
  state.activeDateRangePicker = "";
  state.dateRangeDraftStart = "";
  state.dateRangeDraftEnd = "";
  state.dateRangeMonth = "";
  state.dateRangeSelectionError = "";
  state.CLOUD_CONFIG_KEY = "planningEpsCloudConfig2026";
  state.CLOUD_LOCAL_UNSYNCED_KEY = "planningEpsLocalUnsyncedChanges2026";
  state.CLOUD_DIRTY_KEYS_KEY = "planningEpsDirtyCloudKeys2026";
  state.CLOUD_AUTO_LOAD_DISABLED = false;
  state.cloudDataKeys = ["teachers", "classConfig", "facilities", "activities", "facilityActivities", "activityProgramByLevel", "activityProgramByClass", "yearPlan", "cycles", "cyclesByLevel", "serviceHoursByLevel", "serviceAssignments", "schoolConstraints", "prerequisiteLocks", "yearPrerequisiteLocks", "constructionWorkspaceMode", "constructionVersions", "constructionLocks", "constructionRuleSettings", "constructionRules", "constructionPlan", "blockExclusions", "acceptedConflicts", "sportEvents", "asSessions", "facilityUnavailability", "eventExclusions", "asExclusions"];
  state.PREREQUISITES_LOCK_KEY = "planningEpsPrerequisitesLocked2026";
  state.PREREQUISITE_LOCKS_KEY = "planningEpsPrerequisiteLocks2026";
  state.YEAR_PREREQUISITE_LOCKS_KEY = "planningEpsYearPrerequisiteLocks2026";
  state.prerequisiteSubModes = ["establishment", "team", "classes", "facilitiesActivities", "program"];
  state.yearPrerequisiteSubModes = ["unavailable", "cycles", "as", "events", "hours"];
  state.prerequisiteLocks = loadPrerequisiteLocks();
  state.yearPrerequisiteLocks = loadYearPrerequisiteLocks();
  state.BUILT_IN_CLOUD_CONFIG = {
    enabled: true,
    autoSave: true,
    autoLoad: true,
    url: "https://kgmhuwuiswabbmeyqibp.supabase.co",
    anonKey: "sb_publishable_dJcG78XPNikpRqKGDB_0tw_ZZO7QAgj",
    etabId: "",
    planningId: "planning-eps-2026-2027"
  };
  state.AUTH_SESSION_KEY = "planningEpsAdminSession2026";
  state.AUTH_INVITE_KEY = "planningEpsInviteToken2026";
  state.AUTH_ROLE_KEY = "planningEpsEtabRole2026";
  state.AUTH_ETAB_NAME_KEY = "planningEpsEtabName2026";
  state.AUTH_DEFAULT_ETAB_BY_USER_KEY = "planningEpsDefaultEtabByUser2026";
  state.fallbackBugFixLog = `# Log des corrections

- Navigation : en-tête compacté pour éviter que les onglets masquent le contenu de la page.
- Navigation : liens Mode d'emploi, Alertes, Log et Une question placés sous l'icône chat.
- Établissement : colonne Créneaux AS élargie et typographie harmonisée avec les créneaux de cours.
- Navigation : libellés Professeur et Admin passés en noir.
- Navigation : liens Mode d'emploi, Alertes, Log et Une question rapprochés de l'icône chat.
- Pré-requis établissement : verrous individuels par sous-onglet avec cadenas visible au-dessus de la coche ou croix.
- Établissement : bloc Application automatique retiré du sous-onglet.
- Mode d'emploi : ajout de la mention des sous-onglets et du verrou des pré-requis établissement.
- Établissement : description sous Créneaux AS retirée.
- Navigation : libellés Professeur/Admin rapproches de leurs onglets.
- Pré-requis établissement : ajout d'un verrou de consultation pour empêcher les modifications tout en gardant les sous-onglets accessibles.
- Navigation : blocs Professeur/Admin déplacés dans l’en-tête entre le logo chat et la connexion.
- Établissement : créneaux de cours et créneaux AS affichés côte à côte dans le sous-onglet.
- Navigation Admin : espacement augmente entre le texte des sous-onglets et leur indicateur de validation.
- HTML : correction de l'echappement des coches et des separateurs du Service libre.
- Service libre : correction du symbole de validation et retour des indicateurs coche/croix dans les sous-onglets.
- Navigation Admin : bouton Construction replacé directement à côté de Pré-requis année scolaire.
- Navigation Admin : anciens onglets conservés comme sous-onglets dans les deux pages de pré-requis.
- Navigation Admin : regroupement des onglets 6 a 10 dans Pré-requis année scolaire et navigation réduite à trois étapes.
- Navigation Admin : regroupement des cinq premiers onglets dans Pré-requis établissement.
- Établissement : configuration générale conservée à gauche et créneaux cours/AS regroupés à droite.
- Choix des dates : validation possible pour les périodes qui traversent week-ends, jours fériés ou vacances, tout en gardant ces jours non sélectionnables comme bornes.
- Service libre : saisie stabilisée sans rechargement du panneau a chaque caractere.
- Établissement : créneaux de cours et AS configurés par heures de début/fin, avec durée calculée automatiquement.
- Établissement : ajout du nom d’établissement, du type collège et de la zone scolaire A/B/C avec vacances 2026-2027 mises à jour automatiquement selon la zone.
- Établissement : renommage de l'onglet Contraintes Établissement.
- Choix des dates : calendrier maintenu ouvert jusqu'a validation explicite par bouton.
- Service théorique : ajout du service libre pour affecter des heures non rattachées à une classe.
- Contraintes Établissement : créneaux cours et AS rendus ajoutables/supprimables avec format horaire explicite.
- Service théorique : champ heures signale en rouge tant qu'il n'est pas valide et bouton de validation ajoute.
- Synchronisation cloud : sauvegardes mises en file d'attente, recuperation automatique des changements distants et droits SQL eps_plannings ajoutes.
- Choix des dates : correction du decalage d'un jour lie au fuseau horaire dans le calendrier.
- Confirmations utilisateur : messages d'ajout et de suppression generalises sur les actions principales.
- Confirmations utilisateur : popup de validation adaptee apres ajout ou modification d'un element.
- Classes en duo : durée paramétrable pour le deuxième professeur et prise en compte dans le service réel.
- Contraintes Établissement : nouvel onglet Admin avant Profs pour paramêtrer les créneaux de cours et les horaires d'AS.
- Navigation Admin : bouton Construction replacé à droite de la ligne des prérequis.
- Sélection dates : week-ends, jours fériés et vacances grisés et bloqués dans les calendriers de paramétrage.
- Vidage sélectif de la construction : construction, AS, événements sportifs, ou plusieurs éléments à la fois.
- AS et événements sportifs rattachés au planning courant dans eps_plannings.data avec planningId.
- Installations : plus de type coche par défaut, libellés Externe/Interne, suppression possible de toutes les installations.
- Profs : palette pastel imposee, couleur modifiable, remplacant possible.
- Indisponibilités : choix de n'importe quelle installation, dates libres ou cycles sélectionnés.`;
  state.cloudConfig = loadCloudConfig();
  state.cloudStatus = cloudReady() ? cloudWriteAllowed() ? "Supabase actif. Sauvegarde cloud active, chargement automatique actif." : cloudWriteBlockedMessage() : "Cloud non configuré.";
  state.cloudSaveTimer = null;
  state.cloudSaveQueued = false;
  state.cloudLastUpdatedAt = "";
  state.localUnsyncedChanges = localStorage.getItem(state.CLOUD_LOCAL_UNSYNCED_KEY) || "";
  state.cloudDirtyKeys = new Set(loadCloudDirtyKeys());
  state.cloudRefreshTimer = null;
  state.cloudSyncing = false;
  state.cloudSourceLoaded = false;
  state.cloudInitialLoadKey = "";
  state.adminSession = loadAdminSession();
  state.authEmail = "";
  state.authPassword = "";
  state.authMode = "signin";
  state.authEtabName = "";
  state.authInviteToken = inviteTokenFromUrl() || localStorage.getItem(state.AUTH_INVITE_KEY) || "";
  state.authInviteCodeDraft = "";
  state.authInviteLink = "";
  state.authInviteStatus = state.authInviteToken ? "Invitation équipe détectée." : "";
  state.authInviteMenuOpen = false;
  state.authInviteModalOpen = false;
  state.authInviteRole = "member";
  state.authSwitchModalOpen = false;
  state.currentEtabRole = localStorage.getItem(state.AUTH_ROLE_KEY) || "";
  state.currentEtabName = localStorage.getItem(state.AUTH_ETAB_NAME_KEY) || "";
  state.currentUserEtabs = [];
  state.accountMembersByEtabId = {};
  state.accountMembersRequestKey = "";
  state.accountMembersLoading = false;
  state.accountMembersStatus = "";
  state.authStatus = "";
  if (state.adminSession && state.currentEtabRole === "owner") {
    state.week = "build";
    state.constructionMode = "planning";
  }
  state.sportEvents = normalizePlanningItems(state.sportEvents);
  state.asSessions = normalizePlanningItems(state.asSessions);
  localStorage.setItem("planningEpsSportEvents2026", JSON.stringify(state.sportEvents));
  localStorage.setItem("planningEpsAsSessions2026", JSON.stringify(state.asSessions));
  if (state.unavailablePurgeOnLoad) {
    saveBlockExclusions();
    saveConstructionPlan();
  }
  state.schoolVacationCalendars = {
    A: [{
      name: "Vacances Toussaint",
      start: "2026-10-17",
      end: "2026-11-01"
    }, {
      name: "Vacances Noel",
      start: "2026-12-19",
      end: "2027-01-03"
    }, {
      name: "Vacances hiver zone A",
      start: "2027-02-13",
      end: "2027-02-28"
    }, {
      name: "Vacances printemps zone A",
      start: "2027-04-10",
      end: "2027-04-25"
    }, {
      name: "Vacances ete",
      start: "2027-07-03",
      end: "2027-08-31"
    }],
    B: [{
      name: "Vacances Toussaint",
      start: "2026-10-17",
      end: "2026-11-01"
    }, {
      name: "Vacances Noel",
      start: "2026-12-19",
      end: "2027-01-03"
    }, {
      name: "Vacances hiver zone B",
      start: "2027-02-20",
      end: "2027-03-07"
    }, {
      name: "Vacances printemps zone B",
      start: "2027-04-17",
      end: "2027-05-02"
    }, {
      name: "Vacances ete",
      start: "2027-07-03",
      end: "2027-08-31"
    }],
    C: [{
      name: "Vacances Toussaint",
      start: "2026-10-17",
      end: "2026-11-01"
    }, {
      name: "Vacances Noel",
      start: "2026-12-19",
      end: "2027-01-03"
    }, {
      name: "Vacances hiver zone C",
      start: "2027-02-06",
      end: "2027-02-21"
    }, {
      name: "Vacances printemps zone C",
      start: "2027-04-03",
      end: "2027-04-18"
    }, {
      name: "Vacances ete",
      start: "2027-07-03",
      end: "2027-08-31"
    }]
  };
}
