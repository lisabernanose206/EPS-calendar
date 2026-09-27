# EPS Loustic

Application de planning EPS en JavaScript : préparation d'établissement et d'année, construction, consultation et partage via Supabase. La version web et le HTML autonome partagent leurs sources.

## Développement

Node.js 22 ou plus récent :

```sh
npm ci
npm run dev
```

Sous PowerShell, utiliser `npm.cmd` si l'exécution de `npm.ps1` est bloquée.

## Documentation du projet

| Document | Contenu |
| --- | --- |
| [PRD](docs/PRD.md) | Périmètre produit, utilisateurs et parcours |
| [Architecture](docs/ARCHITECTURE.md) | Structure réelle, données, synchronisation et déploiement |
| [Design](docs/DESIGN.md) | Conventions visuelles, UX et accessibilité |
| [Sécurité](docs/SECURITY.md) | Protections actuelles, six dimensions et limites |
| [Tâches](docs/TASKS.md) | Priorités et validations restantes |
| [Mémoire](docs/MEMORY.md) | État du projet et décisions à préserver |

L'audit initial et le suivi des corrections sont intégrés à [SECURITY.md](docs/SECURITY.md). La documentation de projet reste limitée aux six fichiers de `docs/`.

## Versions web et standalone

```sh
npm run build
npm run build:web
npm run build:standalone
npm run preview
```

**Modifier `src/`, pas `standalone.html`.** Le build web produit `dist/`. Le standalone généré intègre JavaScript et CSS et s'ouvre directement ; conserver `assets/` à côté pour les images. Les polices externes et Supabase nécessitent le réseau.

GitHub Pages régénère le standalone et le publie comme `index.html`. Le détail des workflows et leurs limites est dans [Architecture](docs/ARCHITECTURE.md).

## Configuration et Supabase

Supabase est l'unique stockage des données métier. Le navigateur conserve seulement la connexion dans sessionStorage ; aucun planning ni rôle n'est mis en cache. Les modifications non confirmées restent en mémoire et sont perdues si la page est fermée ou rechargée. Les anciennes copies locales sont supprimées au démarrage.

La version Vite accepte `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ETAB_ID` et `VITE_SUPABASE_PLANNING_ID`. Le standalone accepte une configuration préalable `window.__EPS_CLOUD_CONFIG__` respectant sa CSP.

Seules l'URL et une clé Supabase publique appartiennent au navigateur. Aucun secret serveur ni clé `service_role`. Les autorisations effectives relèvent des RLS et RPC Supabase.

Le schéma sécurisé et la migration sont présents dans le dépôt. **Un build ou un push n'applique pas la migration à la base hébergée.** Suivre [la procédure de migration](docs/ARCHITECTURE.md#migration-supabase) pour une base existante ; son application réelle reste à confirmer.

## Vérification

```sh
npm run build
npx playwright install chromium
npm run audit:security
npm test
```

Pour Edge déjà installé sous PowerShell :

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm.cmd run audit:security
npm.cmd test
```

Les tests utilisent des identités et données fictives. Ils ne modifient pas la production et ne prouvent pas sa configuration. Voir [les commandes et détails des tests de sécurité](docs/SECURITY.md#commandes-de-validation).

Tous les fichiers texte doivent rester en UTF-8 ; vérifier également les accents dans le rendu.
