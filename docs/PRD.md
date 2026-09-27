# PRD — EPS Loustic

Mise à jour : 27 septembre 2026. Version du paquet : 1.0.0.
Statut : application implémentée ; déploiement exact et validation métier à confirmer.

Ce document décrit le périmètre observé dans les sources. Il ne constitue pas une validation des besoins par les utilisateurs. Le responsable produit, le processus antérieur et les objectifs chiffrés ne sont pas renseignés dans le dépôt.

## Besoin et objectifs

EPS Loustic centralise la construction, la consultation et le partage du planning d'éducation physique et sportive d'un établissement. L'équipe doit articuler professeurs, classes, installations, activités, cycles, semaines A/B et indisponibilités.

Les objectifs sont de rendre les contraintes visibles, limiter les affectations incompatibles, suivre les volumes horaires et partager une même référence de planning.

## Utilisateurs et rôles

| Profil | Usage et droits prévus |
| --- | --- |
| Visiteur non connecté | Accueil et connexion Google ; aucun accès autorisé aux données privées |
| Membre, rôle SQL `member` | Consultation de ses établissements et envoi de demandes |
| Administrateur, rôle SQL `owner` | Préparation, construction, sauvegarde et gestion d'équipe selon les RPC |
| Créateur | Administrateur identifié par `etabs.created_by`, avec protections et opérations de gouvernance spécifiques |

Un compte peut appartenir à plusieurs établissements. Le créateur n'est pas un troisième rôle dans `etab_members`. Les droits effectifs dépendent de Supabase, jamais de la seule visibilité des boutons. Voir [SECURITY.md](SECURITY.md).

## Parcours principal

1. Se connecter avec Google, créer ou rejoindre un établissement par invitation, puis sélectionner l'établissement actif.
2. Renseigner les prérequis établissement : créneaux, équipe, classes, installations, activités et programme.
3. Préparer l'année : indisponibilités, périodes/cycles, association sportive, événements et service théorique.
4. Construire les blocs professeurs/classes, préciser installations et activités par cycle, examiner conflits et volumes horaires.
5. Consulter emploi du temps, année et résumé de période/cycle ; utiliser les possibilités d'impression.
6. Sauvegarder et partager avec les collègues invités en consultation ou en administration.

Les prérequis conditionnent l'accès à Construction. Les critères sont dans `src/domain/readiness.js` ; tous les avertissements ne sont pas bloquants.

## Fonctionnalités présentes

| Domaine | Périmètre implémenté |
| --- | --- |
| Établissement | Type collège/lycée, zone scolaire, créneaux, établissement actif et par défaut |
| Référentiels | Professeurs/couleurs, classes/groupes, import CSV, installations et activités compatibles |
| Préparation annuelle | Cycles communs ou par niveau, programme, service et indisponibilités |
| Construction | Blocs, semaines A/B, options, co-intervention, règles, verrous, versions et optimisation |
| Contrôles | Conflits d'affectation/disponibilité, programme et suivi des heures |
| Consultation | Emploi du temps, année, résumé par période/cycle et filtres |
| Événements | Association sportive, événements sportifs et exclusions |
| Collaboration | Connexion, invitations, multi-établissements, gestion des membres et synchronisation |
| Assistance | Guide, signalement de bug et proposition d'amélioration |

Ces fonctionnalités sont identifiées dans les modules ; elles ne sont pas toutes couvertes par une recette métier exhaustive.

## Données et contraintes

- L'année initialisée est 2026/2027 ; plusieurs identifiants internes sont suffixés `2026`. Le changement d'année n'est pas un parcours généralisé validé.
- Le schéma neuf prévoit un document JSON de planning par établissement ; les versions de construction restent dans ce document.
- Les noms/adresses des membres, noms de professeurs, contraintes, horaires et messages libres peuvent être des données personnelles. Aucun besoin de fichier nominatif d'élèves n'est établi ici.
- Les règles de service et valeurs par défaut sont des paramètres applicatifs, pas une attestation réglementaire.
- La construction du planning se fait avec une connexion Internet et repose sur la sauvegarde automatique des modifications dans Supabase. Aucun brouillon durable distinct ni mode de construction hors ligne n’est prévu. Une sauvegarde reste effective uniquement après confirmation du serveur ; les erreurs réseau et les modifications en attente doivent rester visibles.
- Supabase est l'unique source persistante des données métier. Seule la connexion peut être conservée dans la session du navigateur. Une modification en mémoire n'est sauvegardée qu'après confirmation serveur ; fermer ou recharger la page avant cette confirmation peut la perdre.
- La construction vise principalement l'ordinateur. Des styles responsives existent ; accessibilité et usage mobile complets restent à valider.

## Hors du périmètre actuellement établi

Pas de service worker, de PWA installable déclarée, de synchronisation hors ligne complète, de portail élèves/parents ni de gestion des notes identifiés. Aucun stockage de fichiers utilisateurs Supabase Storage n'est utilisé dans les sources examinées. Ces absences ne constituent pas un backlog approuvé.

## Critères de recette

- Un administrateur prépare et construit un planning, puis retrouve sa sauvegarde après reconnexion.
- Un membre consulte son établissement mais ne peut pas modifier le planning par appel direct à l'API.
- Deux établissements restent isolés après changement de compte ou d'établissement.
- Une panne ou une collision de sauvegarde ne produit pas de faux succès ; un chargement échoué ne présente aucun planning issu du navigateur.
- Les vues hebdomadaire, annuelle et par cycle restent cohérentes, avec des accents lisibles dans les deux versions.
- Invitations, promotions, retraits et transferts respectent les permissions serveur.

Les validations et décisions restantes sont dans [TASKS.md](TASKS.md).
