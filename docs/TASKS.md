# Tâches — EPS Loustic

Mise à jour : 27 septembre 2026.
Backlog tiré des limites du code et de l'audit intégré à SECURITY.md. Les priorités concernent validation et maintenance ; aucune nouvelle fonctionnalité métier n'est présumée approuvée.

## P0 — Vérifier les protections réellement déployées

- [ ] Confirmer si la migration sécurisée est appliquée ; comparer politiques, fonctions et permissions au diagnostic en lecture seule. Si nécessaire, suivre le [guide de migration](ARCHITECTURE.md#migration-supabase) après sauvegarde.
- [ ] Valider l'isolation entre deux établissements avec comptes de recette : anonyme, membre, administrateur et créateur. Vérifier le refus de l'ancienne promotion illégitime et de l'UPDATE direct du créateur.
- [ ] Vérifier le parcours Google réel, les redirections, la révocation et les invitations.
- [ ] Vérifier que la version publiée contient les protections frontend et remplace les anciens clients.

Critère : preuves sur l'environnement visé, sans confondre tests locaux et vérification de production.

## P1 — Fiabilité et exploitation

- [ ] Tester les invitations simultanées avec deux connexions, leur expiration et la perte des droits de l'émetteur.
- [ ] Recetter sauvegardes concurrentes, pannes, rechargement avec modifications en attente et changement de compte/établissement.
- [ ] Définir sauvegardes, restauration, accès opérateur, rétention des demandes et du journal ; tester une restauration.
- [ ] Examiner fonctions/privilèges historiques non exportés et lignes sans établissement ; ne pas rattacher ni purger automatiquement ces données.
- [ ] Décider comment rendre les tests obligatoires avant publication ; les workflows sont indépendants.
- [ ] Définir la gestion des fichiers d'environnement : le `.gitignore` actuel ne contient pas de règle `.env`. Aucun secret ne doit rejoindre le bundle.

## P2 — Qualité et décisions produit à confirmer

- [ ] Recetter prérequis → construction → consultation → sauvegarde → reconnexion.
- [ ] Vérifier mobile, clavier, focus des modales, contrastes, zoom et impression.
- [ ] Corriger accents et libellés résiduels ; compléter le contrôle automatique par une lecture visuelle.
- [ ] Définir le passage à une autre année : dates initiales 2026/2027 et clés locales suffixées `2026`.
- [ ] Confirmer responsable produit, profils utilisateurs et critères de réussite métier.
- [ ] Évaluer l'auto-hébergement des polices et les en-têtes de protection non configurés dans le dépôt.

## Dette technique

- [ ] Renforcer l'isolation des caches par compte/établissement et préciser le devenir des changements locaux après révocation.
- [ ] Définir, si nécessaire, une reprise persistante des conflits après rechargement ; pas de mode hors ligne complet aujourd'hui.
- [ ] Évaluer les dépendances React/Lucide déclarées mais non utilisées par le rendu avant toute suppression.
- [ ] Limiter imports circulaires et surcharges CSS lors des changements concernés, sans refonte cosmétique.

## Vérification locale

Depuis la racine ; sous PowerShell, utiliser `npm.cmd` si nécessaire.

```sh
npm run build
npm run audit:security
npm test
```

`audit:security` couvre statique, trois suites SQL, runtime et navigateur de sécurité. Playwright requiert Chromium installé ou `PLAYWRIGHT_CHANNEL=msedge`. Un contrôle de dépendances distinct est disponible via `npm audit` ; il ne remplace pas les tests métier.

## Réalisé dans le dépôt

- [x] Sources web/standalone communes, état partagé et modules organisés.
- [x] Protections frontend : HTML, PKCE, transport, validation et sauvegardes concurrentes.
- [x] Schéma sécurisé et migration SQL avec suites neuve, historique et observée.
- [x] Workflow de tests comprenant SQL et frontend.
- [x] 27 septembre 2026 : documentation remplie depuis les sources ; audit et suivi des corrections intégrés aux six documents existants, sans rapports séparés.

Ces cases ne signifient pas que les modifications sont déployées sur le serveur hébergé.
- [x] Documentation technique des sous-dossiers intégrée aux documents existants ; seul le README racine est conservé.
