# Tests de sécurité

Ces tests décrivent les propriétés de sécurité attendues. **Ils échouent sur plusieurs points au moment de l’audit du 26 septembre 2026.** Un échec constitue un résultat de l’audit, pas une correction. Les tests fonctionnels restent séparés.

**Après corrections frontend :** lancer `npm run build`, puis `npm run audit:frontend` pour les contrôles statiques, la synchronisation et le navigateur. Le [suivi des corrections](../SECURITY-FIXES-2026-09-26.md) distingue ce qui est corrigé des failles serveur laissées ouvertes. `audit:security` inclut toujours les tests SQL et reste donc en échec.

Voir [le rapport](../SECURITY-AUDIT-2026-09-26.md) pour les preuves, limites et priorités.

## Exécution depuis la racine

```sh
npm ci
npx playwright install chromium
npm run audit:security
```

Sous PowerShell avec Edge déjà installé :

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm.cmd run audit:security
```

Exécution indépendante des suites :

```sh
npm run audit:sql
npm run audit:runtime
npm run audit:browser
npm audit
```

Le navigateur de test utilise le port local 5182. Si le code applicatif est modifié, lancer `npm run build` avant les tests pour mettre le standalone à jour.

## Isolation et résultats

- `sql-security.mjs` charge `supabase/schema.sql` dans PostgreSQL embarqué, en mémoire, via PGlite. Les rôles `anon`/`authenticated`, `auth.users` et `auth.uid()` sont des fixtures. Les politiques et RPC sont celles du dépôt. La seule ligne retirée du schéma testé est `CREATE EXTENSION pgcrypto` : `gen_random_uuid()` est fourni par PostgreSQL. Les tests utilisent des utilisateurs et établissements fictifs et annulent chaque transaction. PGlite utilise une seule connexion : la course concurrente entre invitations n’est pas prouvée par cette suite.
- `runtime-security.mjs` exécute les vrais modules JavaScript avec un DOM neutralisé et un `fetch` simulé. Les écritures concurrentes, pannes réseau et changements de contexte restent en mémoire.
- `browser/security.spec.js` utilise Edge/Chromium, le point d’entrée Vite et le standalone. Les appels hors de l’origine locale exacte sont interceptés. Les charges XSS ne font que poser un indicateur et vérifier la lecture d’un jeton **fictif** ; aucune donnée n’est exfiltrée.
- Les résultats JSON et les diagnostics navigateur sont dans `audit/results/`, ignorés par Git. Le rapport fournit le bilan de référence.
- `production-readonly.sql` est un contrôle **optionnel**, à exécuter dans l’éditeur SQL Supabase. Il inspecte les politiques, privilèges, fonctions et contraintes déployés, sans lire les lignes métier ni effectuer de modification. Il n’a pas été exécuté sur le serveur durant cet audit.

Le code de retour de `audit:security` reste non nul tant qu’une propriété testée n’est pas satisfaite. Ne pas neutraliser les assertions ou marquer les failles comme « succès » pour obtenir un résultat vert.
