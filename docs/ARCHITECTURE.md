# Architecture — EPS Loustic

État des sources au 27 septembre 2026. La configuration des comptes hébergés n'est pas vérifiée ici.

## Architecture générale

Navigateur → modules JavaScript et stockage local → API HTTPS Supabase Auth / REST / RPC → PostgreSQL avec RLS, fonctions et triggers.

L'hébergement est statique. Aucun serveur Node applicatif, aucune Edge Function et aucun SDK Supabase ne sont utilisés dans le périmètre examiné : les échanges passent par `fetch`.

| Couche | Mise en œuvre |
| --- | --- |
| Interface | JavaScript ES modules, HTML généré, CSS partagé |
| Compilation | Vite 6 ; esbuild pour le standalone ; Node.js 22 dans la CI |
| Dépendances | DOMPurify ; React, React DOM, Lucide et le plugin React sont déclarés mais ne structurent pas le rendu actuel |
| État | Objet partagé `state`, privé aux modules |
| Persistance locale | `localStorage` ; `sessionStorage` pour la preuve OAuth temporaire |
| Backend | Supabase Auth, REST PostgreSQL et RPC |
| Publication | GitHub Pages publie le standalone généré comme `index.html` |
| Tests | Playwright, assertions Node et PostgreSQL embarqué PGlite |

## Structure réelle du dépôt

| Emplacement | Responsabilité |
| --- | --- |
| `AGENTS.md`, `README.md` | Consignes agent et point d'entrée humain |
| `docs/` | Six documents de référence du projet, audit et corrections inclus |
| `src/main.jsx` | Entrée Vite : styles, configuration et démarrage ; pas de composant React |
| `src/standalone.js`, `src/standalone.template.html` | Entrée et gabarit autonomes |
| `src/app/` | Structure HTML, état, initialisation, bootstrap et coordination du rendu |
| `src/tabs/` | Affichage et événements des onglets |
| `src/domain/` | Dates, cycles, affectations, conflits, service et optimisation |
| `src/services/` | Authentification, stockage local et synchronisation |
| `src/security/` | HTML, validation, OAuth, transport, fetch et diagnostic |
| `src/ui/` | Navigation, modales, tableaux, dates et messages |
| `src/styles.css`, `assets/` | Styles, images et icônes partagés |
| `supabase/schema.sql` | Installation neuve sécurisée |
| `supabase/migrations/` | Migration ciblée pour base existante |
| `tests/` | Tests fonctionnels Playwright ; sous-dossier dédié à la sécurité |
| `tests/security/` | Tests de sécurité, fixtures et diagnostic SQL en lecture seule |
| `scripts/` | Copie des assets et génération du standalone |
| `.github/workflows/` | Publication Pages et contrôles de sécurité/régression |
| `standalone.html` | Livrable généré et versionné ; ne pas éditer directement |
| `dist/` | Build généré, ignoré par Git |

Réutiliser ces dossiers. Ne pas créer une arborescence React, `backend/`, `public/` ou `src/db/` pour suivre un template. Conserver un seul `README.md`, à la racine du projet. Intégrer les guides techniques dans les six documents de `docs/` : migration dans ARCHITECTURE, tests et audit dans SECURITY. Ne pas créer de README dans les sous-dossiers ni de document supplémentaire dans `docs/`.

## Démarrage et rendu

`startApp()` monte `shell.html` via le filtre HTML, initialise l'état puis appelle le bootstrap, qui traite notamment OAuth et le chargement initial.

Les fonctions `render…` produisent l'interface ; les fonctions `bind…Events` raccordent ses actions après rendu. Certains modules s'importent mutuellement : éviter les calculs dépendant de l'état au chargement des modules. Ne pas recopier `state` par onglet et ne pas l'exposer sur `window`.

## Modèle de données

| Table | Données et relations principales |
| --- | --- |
| `auth.users` | Identité gérée par Supabase Auth |
| `etabs` | UUID, nom, slug et créateur lié à l'utilisateur |
| `etab_members` | Clé établissement/utilisateur ; rôle `owner` ou `member` |
| `etab_invites` | Jeton, établissement, émetteur, rôle, expiration et compteur |
| `eps_plannings` | Identifiant texte, établissement, JSONB et `updated_at` ; unicité d'établissement dans le schéma neuf |
| `eps_feedback` | Établissement, planning, type, message, auteur affiché, identité serveur, contexte et statut |
| `eps_security_audit` | Opérations validées et changements de gouvernance ; accès opérateur |

Le document JSON regroupe référentiels, cycles, règles/blocs, verrous, versions, indisponibilités, AS et événements. Ce ne sont pas des tables métier indépendantes.

La migration conserve les différences historiques prises en charge, notamment les jetons UUID et certaines lignes sans établissement. Ne pas supposer que la production possède toutes les contraintes du schéma neuf. Voir [la procédure de migration](#migration-supabase).

## Synchronisation et fonctionnement local

1. Une modification actualise l'état et le stockage local, puis marque les clés modifiées.
2. Le service capture le compte, l'établissement, le planning et les données.
3. Il lit la version distante et conditionne le PATCH à `updated_at`.
4. Il vérifie l'accusé serveur, conserve les modifications survenues pendant l'envoi et limite les tentatives à trois.
5. Une collision sur une même zone est refusée ; des zones distinctes peuvent être conciliées avec la référence en mémoire.

Les chargements ne doivent pas écraser les changements en attente. Les triggers SQL du dépôt imposent l'horodatage serveur.

Limites : pas de service worker, d'IndexedDB, de file persistante complète multi-onglet ni de fusion automatique sur une même zone. La référence de comparaison est perdue au rechargement. Les clés locales ne sont pas toutes isolées par compte/établissement ; des purges sont réalisées à la déconnexion et au changement d'établissement.

Le standalone ouvre ses ressources compilées sans serveur ; authentification, données distantes et polices externes nécessitent le réseau. Les sauvegardes de planning et demandes sont bloquées par le client depuis `file:`, localhost et les hôtes locaux reconnus. Ce blocage n'est pas une protection serveur générale de toutes les RPC.

## Configuration et livrables

Vite accepte `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ETAB_ID` et `VITE_SUPABASE_PLANNING_ID`. Des valeurs publiques par défaut existent dans les sources. Le standalone accepte `window.__EPS_CLOUD_CONFIG__` avant son script, sous réserve de respecter la CSP.

Les variables `VITE_*` sont publiques dans le bundle : aucun secret serveur.

| Commande | Résultat |
| --- | --- |
| `npm run dev` | Vite sur 127.0.0.1:5173 |
| `npm run build:web` | Build Vite et copie des assets dans `dist/` |
| `npm run build:standalone` | HTML autonome avec JS, CSS et empreinte CSP |
| `npm run build` | Les deux livrables |
| `npm run preview` | Prévisualisation sur 127.0.0.1:4173 |

Conserver `assets/` à côté du standalone pour les images. Le build ne modifie pas Supabase.

## Déploiement et exploitation

Pages s'exécute sur les pushes de `main` ou manuellement, génère le standalone et le publie avec les assets. La CI de tests exécute build, trois suites SQL, contrôles frontend et tests fonctionnels. Les deux workflows sont indépendants : leur présence ne prouve pas que les tests bloquent une publication.

Restent à confirmer : recette distincte, version publiée, migration appliquée, protections de branche, supervision, sauvegardes/PITR, restauration et responsables d'exploitation.

## Décisions à préserver

Sources communes web/standalone ; autorisations serveur ; installation neuve distincte de la migration ; pas de réorganisation cosmétique. Le dossier `docs/` conserve uniquement PRD, ARCHITECTURE, DESIGN, SECURITY, TASKS et MEMORY. [SECURITY.md](SECURITY.md) intègre l'audit et le suivi des corrections.

## Retrouver un écran

Les fichiers ci-dessous sont dans `src/tabs/`.

| Écran | Module |
| --- | --- |
| Emploi du temps / Année scolaire / Résumé période | `timetable.js` / `year.js` / `cycle.js` |
| Pré-requis établissement | `prerequisites.js` |
| Établissement / Profs / Classes | `establishment.js` / `team.js` / `classes.js` |
| Installations et activités / Programme | `facilities-activities.js` / `program.js` |
| Pré-requis année scolaire | `year-prerequisites.js` |
| Indisponibilités / Cycles | `unavailability.js` / `cycle-settings.js` |
| AS / Événements / Service | `sport-association.js` / `events.js` / `hours.js` |
| Construction | `construction.js` |
| Mode d'emploi / Une question ? | `guide.js` / `request.js` |
| Établissements du compte | `account.js` |

Les vues secondaires restent dans `alerts.js`, `rules.js`, `changelog.js` et `cloud.js`.

## Migration Supabase

`schema.sql` décrit une installation neuve. Une modification de ce fichier ou un push GitHub ne modifie pas la base hébergée.

Pour une base existante, utiliser **[migrations/20260926_security_hardening.sql](../supabase/migrations/20260926_security_hardening.sql)** dans le SQL Editor du bon projet Supabase. Ce fichier n'a pas été exécuté sur la production par l'assistant.

### Appliquer la correction

1. Conserver un export ou un point de restauration de la base avant la migration. Le [diagnostic en lecture seule](../tests/security/production-readonly.sql) aide à comparer les fonctions et permissions existantes.
2. Copier **tout le contenu du fichier de migration**, de `begin;` à `commit;`, dans une nouvelle requête du SQL Editor et l'exécuter avec le rôle propriétaire de la base. Ne pas recopier tout `schema.sql` sur une base existante.
3. Si une erreur apparaît, ne pas poursuivre avec des morceaux isolés : la transaction annule les changements. Une politique supplémentaire inconnue est signalée explicitement pour éviter d'écraser une personnalisation. Examiner cette politique avant d'adapter la migration, plutôt que de supprimer le contrôle.
4. Après réussite, tester sur le site : connexion, renommage de l'établissement, sauvegarde d'un planning, création d'une invitation « consultation » et acceptation par un compte de test. Vérifier qu'un membre ne devient pas administrateur et qu'un lien consommé est refusé.

La migration peut être réexécutée. Elle ajoute les colonnes manquantes `max_uses`, `used_count`, `eps_feedback.etab_id` et `author_user_id`, conserve les plannings et les membres, et ne modifie pas la configuration OAuth. Si d'autres colonnes/fonctions diffèrent du schéma attendu, PostgreSQL peut refuser la migration : transmettre alors le message exact avant d'appliquer d'autres changements.

Les anciens liens avec `max_uses` nul sont désormais traités comme des liens à usage unique. Un lien déjà utilisé peut donc être refusé : générer un nouveau lien. Les liens ayant une limite explicite conservent cette limite.

Les protections et limites de sécurité sont décrites dans [SECURITY.md](SECURITY.md). La migration conserve les données historiques sans les réécrire ni les purger automatiquement : une ancienne donnée invalide peut être refusée à sa prochaine modification. Les fonctions privilégiées inconnues et les droits hérités de rôles personnalisés restent à examiner sur le serveur réel.

### Adaptation au relevé de colonnes fourni

La migration accepte les invitations dont le jeton est un UUID comme celles dont le jeton est du texte, sans convertir ni régénérer les jetons existants. Elle conserve le défaut d’expiration existant (14 jours dans le relevé fourni) et les invitations historiques sans créateur ; ces dernières ne sont pas acceptables sans émetteur administrateur vérifiable.

La colonne manquante eps_feedback.etab_id est ajoutée **avant** les politiques qui la référencent. Elle reste nullable pour conserver les anciennes demandes : aucun établissement n’est déduit du nom du planning, du texte ou de l’auteur libre. Les nouvelles demandes doivent fournir un établissement autorisé. Les anciens plannings dont etab_id est nul restent inchangés et invisibles aux rôles applicatifs ; leur rattachement exige une décision explicite de l’opérateur.

Le test `npm run audit:sql:observed` reproduit ces différences de colonnes, vérifie les invitations en UUID et compare intégralement les anciennes lignes de planning, demande et invitation avant/après deux migrations. Il comporte désormais 28 contrôles. Les sept politiques ont ensuite été fournies et intégrées aux tests. Les contraintes, triggers et fonctions réels n’ont pas été exportés : ce test reproduit les colonnes et politiques observées, **pas toute la base de production**. Les contrôles de politiques inconnues et la transaction restent actifs. La table eps_plannings_backup n’est pas modifiée.


### Anciennes politiques examinées après le blocage

La migration reconnaît et remplace explicitement les cinq noms supplémentaires transmis : admin write planning, read planning, owners insert plannings, owners update plannings et members read own memberships. Elle ne désactive pas le contrôle des autres politiques inconnues.

La politique de lecture utilisant USING (true) et le privilège général lié à un email sont supprimés ; les accès reposent désormais sur l’appartenance à chaque établissement et son rôle owner/member. L’ancien compte privilégié doit donc être membre avec le rôle owner pour modifier un établissement. Aucun compte n’est promu automatiquement. Le planning et les appartenances existantes ne sont pas supprimés.

La fixture observed-policies.sql reproduit les sept politiques transmises, avec un email fictif. Les fonctions is_etab_member et is_etab_owner y sont simulées, car leurs définitions réelles n’ont pas été reçues. La migration remplace leurs usages dans ces politiques par des vérifications explicites ; elle ne supprime pas ces fonctions et ne prétend pas les auditer.

Validation : 26 contrôles sur installation neuve, 26 sur migration historique, 28 sur colonnes et politiques observées. Les deux derniers couvrent la conservation des données après deux applications et l’arrêt transactionnel lorsqu’une autre politique inconnue est présente. Aucun changement n’a été appliqué par l’assistant au serveur hébergé.

Références : [verrouillage PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html) et [précautions SECURITY DEFINER](https://www.postgresql.org/docs/current/sql-createfunction.html).

## Regroupement des tests — 27 septembre 2026

Les contrôles de sécurité, fixtures et diagnostic SQL sont regroupés dans `tests/security/`. Les commandes npm `audit:*` et la CI restent disponibles. La configuration Playwright racine exclut ce sous-dossier : ses scénarios utilisent leur propre configuration et le port 5182. Les résultats générés sont ignorés par Git. Le dossier temporaire de refactoring a été supprimé après vérification de son absence de dépendances dans les outils du projet.
