# EPS Loustic

Application de planning EPS en JavaScript, compilée avec Vite. Les sources de la version web et de la version HTML autonome sont communes.

## Développement

Avec Node.js 22 ou plus récent :

```sh
npm ci
npm run dev
```

Sous PowerShell, utiliser `npm.cmd` si l’exécution de `npm.ps1` est bloquée.

## Organisation du code

`src/main.jsx` est uniquement le point d’entrée web : chargement des styles, configuration publique et démarrage. Il ne lit plus le standalone et n’utilise plus `new Function`.

| Emplacement | Responsabilité |
| --- | --- |
| `src/app/start.js` | Montage de la structure HTML, initialisation et démarrage |
| `src/app/shell.html` | Structure commune : en-tête, navigation, conteneurs |
| `src/app/state.js` | État partagé entre les modules, sans exposition sur `window` |
| `src/app/initialize.js` | Valeurs initiales et chargement des données locales, dans leur ordre de dépendance |
| `src/app/bootstrap.js` | Retour OAuth et chargement initial du planning |
| `src/app/render.js` | Coordination du rendu et branchement des événements |
| `src/tabs/` | Affichage et événements des onglets et sous-onglets |
| `src/domain/` | Calculs du planning : dates, cycles, heures, blocs, conflits et optimisation |
| `src/services/` | Stockage local, authentification et synchronisation Supabase |
| `src/ui/` | Éléments partagés : navigation, modales, tableaux, sélecteur de dates et messages |
| `assets/` | Images et icônes partagées par les deux versions |
| `src/styles.css` | Styles communs aux deux versions |
| `supabase/schema.sql` | Script SQL historique extrait de l’interface ; son extraction n’applique aucune modification à la base |

### Trouver le fichier d’un onglet

| Onglet | Fichier dans `src/tabs/` |
| --- | --- |
| Emploi du temps | `timetable.js` |
| Année scolaire | `year.js` |
| Résumé période | `cycle.js` |
| Pré-requis établissement | `prerequisites.js` |
| Établissement / Profs / Classes | `establishment.js` / `team.js` / `classes.js` |
| Installations et activités / Programme | `facilities-activities.js` / `program.js` |
| Pré-requis année scolaire | `year-prerequisites.js` |
| Indisponibilités / Cycles | `unavailability.js` / `cycle-settings.js` |
| AS / Événements / Service | `sport-association.js` / `events.js` / `hours.js` |
| Construction | `construction.js` |
| Mode d’emploi / Une question ? | `guide.js` / `request.js` |
| Établissements du compte | `account.js` |

Les vues secondaires existantes restent dans `alerts.js`, `rules.js`, `changelog.js` et `cloud.js`.

Les fonctions `render…` produisent l’interface et les fonctions `bind…Events` raccordent ses actions après le rendu. Le code métier commun est importé depuis `domain/` et `services/`. Les modules partagent un seul objet `state` : ne pas en créer une copie par onglet. Certains modules s’importent mutuellement ; leur chargement ne doit pas exécuter de calcul dépendant de l’état. Le démarrage passe par `startApp()`.

## Version web et standalone

```sh
npm run build              # Produit les deux versions
npm run build:web          # Produit dist/ pour un serveur statique
npm run build:standalone   # Régénère standalone.html
npm run preview           # Sert dist/ localement
```

**Modifier les fichiers de `src/`, pas `standalone.html`.** Ce dernier est un fichier généré, conservé dans le dépôt pour pouvoir être ouvert directement. Son gabarit est `src/standalone.template.html` et son point d’entrée est `src/standalone.js`.

Le générateur regroupe les modules JavaScript et les styles dans le HTML, sans chargement de modules au moment de son ouverture. Le standalone peut donc toujours être ouvert avec un double-clic, sans serveur local. Conserver le dossier `assets/` à côté du HTML pour les illustrations. Les polices Google et les fonctions Supabase nécessitent une connexion, comme auparavant.

GitHub Pages régénère le standalone depuis les sources avant de le publier comme `index.html`. Il n’est plus nécessaire de maintenir manuellement deux copies du code.

## Configuration et sécurité

La version Vite accepte `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ETAB_ID` et `VITE_SUPABASE_PLANNING_ID`. Le standalone conserve sa configuration intégrée et la possibilité de fournir `window.__EPS_CLOUD_CONFIG__` avant son script.

Seules l’URL et une clé Supabase **publique** appartiennent au navigateur. Ne jamais y mettre de clé `service_role` ou de secret serveur. Les vérifications de rôle dans l’interface facilitent la navigation ; les autorisations effectives relèvent des politiques RLS et fonctions RPC Supabase. Le refactoring conserve les appels existants et ne modifie pas le serveur. Le schéma SQL n’est plus affiché ni intégré dans le JavaScript des écrans.

## Vérification

```sh
npm run build
npx playwright install chromium
npm test
```

Pour utiliser Edge déjà installé sous PowerShell :

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm.cmd test
```

Les tests utilisent des sessions fictives et interceptent les requêtes externes : aucune donnée de production n’est modifiée. Ils vérifient les points d’entrée web et standalone, les onglets et sous-onglets, les rôles de navigation, l’état partagé et les accents. Ils ne constituent pas une vérification des politiques du serveur Supabase.

Tous les fichiers texte doivent rester en UTF-8.
