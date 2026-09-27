# Mémoire du projet — EPS Loustic

Mise à jour : 27 septembre 2026. Version déclarée : 1.0.0.

## État actuel

Application de planning EPS implémentée : préparation d'établissement/année, construction, consultation et collaboration Supabase. Année initialisée : 2026/2027. Le dépôt contient une publication GitHub Pages et une CI ; l'état réel des services hébergés reste à confirmer.

## Décisions à conserver

- Rendu JavaScript/HTML, sans arbre de composants React. React, React DOM, Lucide React et le plugin React inutilisés ont été retirés des dépendances et du verrouillage npm le 27 septembre 2026 ; les versions des paquets conservés restent inchangées.
- Web et standalone partagent `src/`. Modifier les sources puis régénérer `standalone.html`.
- `state` est partagé entre modules et privé ; attention aux imports circulaires et à l'ordre d'initialisation.
- Les utilitaires de dates sont regroupés dans `domain/dates.js` ; le métier ne dépend plus de `ui/date-picker.js`. Deux boucles directes supprimées (dates/calendrier et cycles/calendrier), sans changement des calculs ni de l’interface. Les autres cycles restent à traiter progressivement.
- CSS : six règles en doublon regroupées sur les tableaux de consultation, les installations et les créneaux d’établissement. Styles calculés et pixels identiques sur les composants représentatifs à trois largeurs, en écran et impression ; autres surcharges à traiter au fil des interventions.
- Supabase est la seule source persistante des données métier. RLS/RPC imposent les permissions ; masquer un bouton n'est pas une protection.
- `owner` signifie administrateur ; le créateur est identifié séparément par `created_by`.
- Installation neuve et migration pour base existante ont des usages distincts. Un push ne migre pas Supabase.
- Un seul `README.md` à la racine ; migration dans ARCHITECTURE et guide des tests dans SECURITY. Ne pas créer de README dans les sous-dossiers du projet.
- Conserver exactement six documents dans `docs/`. Audit et corrections sont intégrés à `SECURITY.md`, actions ouvertes à `TASKS.md` ; aucun rapport Markdown supplémentaire.

## Prérequis avant production

Décision du 27 septembre : revue systématique de la dette technique avant toute publication, selon [AGENTS.md](../AGENTS.md#mandatory-technical-debt-review-before-production). Les points identifiés doivent être corrigés avant production ; aucun report silencieux dans un backlog de dette. La rubrique dédiée est retirée de TASKS.md. Chaque revue doit préciser le candidat, le périmètre, les constats/corrections, les validations et les blocages dans ce document.

**État actuel : aucune revue complète de candidat de production n’est attestée.** Les nettoyages de dépendances, dates et CSS sont ciblés : ils ne clôturent pas les autres imports circulaires connus autour du rendu et des services. Les autres surcharges CSS restent à examiner pour distinguer les variantes justifiées des doublons inutiles. Ces points doivent être examinés et les dettes confirmées corrigées avant de déclarer une version prête. Retirer la rubrique de TASKS.md ne supprime pas ces constats. Les workflows ne font pas automatiquement respecter ce prérequis.

## Organisation des tests

Les tests de sécurité sont dans `tests/security/` ; les commandes `audit:*` sont conservées. Les anciens dossiers racine d’audit et de refactoring ont été retirés. Le test Playwright fonctionnel exclut les scénarios de sécurité, exécutés avec leur configuration dédiée.

## Points sensibles

Les modifications locales en attente ne doivent pas être écrasées par un chargement. La sauvegarde conditionnelle vérifie version, contexte et accusé serveur. La référence de comparaison est en mémoire ; rechargement et anciens clients limitent la protection.

Décision utilisateur du 27 septembre : aucun stockage métier navigateur. Seule la connexion est conservée dans sessionStorage, avec la preuve OAuth transitoire. Les anciennes clés localStorage sont supprimées sans import. La Map pageMemory et les brouillons ne durent que le temps de la page. Un rechargement revalide la connexion et relit Supabase ; les changements non confirmés sont perdus après avertissement. L'établissement par défaut est stocké dans les métadonnées Supabase, sans rôle associé. Le mode local bloque certaines écritures sans remplacer les droits serveur.

Décision produit du 27 septembre : La construction du planning se fait avec une connexion Internet et repose sur la sauvegarde automatique des modifications dans Supabase. Aucun brouillon durable distinct ni mode de construction hors ligne n’est prévu. Une sauvegarde reste effective uniquement après confirmation du serveur ; les erreurs réseau et les modifications en attente doivent rester visibles. La tâche de brouillon durable est retirée du backlog.

Préserver accents, vues membre/admin, cohérence du calendrier et ouverture du standalone avec ses assets.

## Sécurité : état à ne pas confondre

Des corrections frontend et SQL sont présentes dans le dépôt. Aucune preuve d'application de la migration hébergée n'est établie par cette session. Les fixtures observées reproduisent les colonnes et sept politiques communiquées, pas toute la production.

Les workflows de tests et de publication sont indépendants. La consommation simultanée d'une invitation avec deux connexions n'a pas été validée dans les validations consignées dans SECURITY.md.

## Prochaines actions et références

Priorité : vérifier la migration réellement appliquée, recetter rôles et isolation, puis préciser conservation, sauvegardes et restauration.

Consulter [TASKS.md](TASKS.md) pour les actions, [SECURITY.md](SECURITY.md) pour les six dimensions et [ARCHITECTURE.md](ARCHITECTURE.md) pour les sources et livrables. Ne pas recopier ici l'audit ou un historique exhaustif.

## Dernière validation locale — 27 septembre 2026

Validation après suppression du cache métier : builds web et standalone réussis, contrôles statiques réussis, 80 contrôles SQL, 11 runtime, 23 navigateur de sécurité (dont 5 scénarios Supabase sans cache) et 16 fonctionnels réussis sous Edge. Liens et UTF-8 vérifiés. Aucun déploiement ni changement de la base de production.
