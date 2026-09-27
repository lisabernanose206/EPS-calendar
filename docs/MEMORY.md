# Mémoire du projet — EPS Loustic

Mise à jour : 27 septembre 2026. Version déclarée : 1.0.0.

## État actuel

Application de planning EPS implémentée : préparation d'établissement/année, construction, consultation et collaboration Supabase. Année initialisée : 2026/2027. Le dépôt contient une publication GitHub Pages et une CI ; l'état réel des services hébergés reste à confirmer.

## Décisions à conserver

- Rendu JavaScript/HTML, sans arbre de composants React malgré les dépendances déclarées.
- Web et standalone partagent `src/`. Modifier les sources puis régénérer `standalone.html`.
- `state` est partagé entre modules et privé ; attention aux imports circulaires et à l'ordre d'initialisation.
- Supabase est la référence distante. RLS/RPC imposent les permissions ; masquer un bouton n'est pas une protection.
- `owner` signifie administrateur ; le créateur est identifié séparément par `created_by`.
- Installation neuve et migration pour base existante ont des usages distincts. Un push ne migre pas Supabase.
- Un seul `README.md` à la racine ; migration dans ARCHITECTURE et guide des tests dans SECURITY. Ne pas créer de README dans les sous-dossiers du projet.
- Conserver exactement six documents dans `docs/`. Audit et corrections sont intégrés à `SECURITY.md`, actions ouvertes à `TASKS.md` ; aucun rapport Markdown supplémentaire.

## Organisation des tests

Les tests de sécurité sont dans `tests/security/` ; les commandes `audit:*` sont conservées. Les anciens dossiers racine d’audit et de refactoring ont été retirés. Le test Playwright fonctionnel exclut les scénarios de sécurité, exécutés avec leur configuration dédiée.

## Points sensibles

Les modifications locales en attente ne doivent pas être écrasées par un chargement. La sauvegarde conditionnelle vérifie version, contexte et accusé serveur. La référence de comparaison est en mémoire ; rechargement et anciens clients limitent la protection.

Sessions et cache sont dans `localStorage`, sans chiffrement applicatif ni isolation complète par compte. Pas de service worker ni de file hors ligne complète. Le mode local bloque certaines écritures dans le client, sans remplacer les droits serveur.

Préserver accents, vues membre/admin, cohérence du calendrier et ouverture du standalone avec ses assets.

## Sécurité : état à ne pas confondre

Des corrections frontend et SQL sont présentes dans le dépôt. Aucune preuve d'application de la migration hébergée n'est établie par cette session. Les fixtures observées reproduisent les colonnes et sept politiques communiquées, pas toute la production.

Les workflows de tests et de publication sont indépendants. La consommation simultanée d'une invitation avec deux connexions n'a pas été validée dans les validations consignées dans SECURITY.md.

## Prochaines actions et références

Priorité : vérifier la migration réellement appliquée, recetter rôles et isolation, puis préciser conservation, sauvegardes et restauration.

Consulter [TASKS.md](TASKS.md) pour les actions, [SECURITY.md](SECURITY.md) pour les six dimensions et [ARCHITECTURE.md](ARCHITECTURE.md) pour les sources et livrables. Ne pas recopier ici l'audit ou un historique exhaustif.

## Dernière validation locale — 27 septembre 2026

Build web et standalone réussi. Audit de sécurité réussi : contrôles statiques, 80 contrôles SQL (26 + 26 + 28), 10 runtime et 18 navigateur. Les 16 tests fonctionnels passent sous Edge. Liens locaux et encodage UTF-8 des documents contrôlés. Aucune vérification ni modification de la production dans cette session.
