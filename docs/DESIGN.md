# Design et UX — EPS Loustic

Référence établie à partir des sources au 27 septembre 2026. Les critères ci-dessous guident les évolutions ; ils ne valent pas certification d'accessibilité.

## Contexte et parcours

L'interface est en français et sert une équipe EPS. L'ordinateur est le support principal de construction d'un planning dense ; la consultation doit rester compréhensible sur les petits écrans.

La navigation distingue consultation (emploi du temps, année, résumé de cycle/période), préparation établissement, préparation annuelle et construction. Les onglets administratifs dépendent du rôle. Le changement d'établissement demande confirmation, avec un avertissement supplémentaire si une sauvegarde est en attente.

Le guide intégré, `src/tabs/guide.js`, décrit le parcours métier. Les indicateurs de prérequis et le blocage de Construction viennent de `src/domain/readiness.js`.

## Identité visuelle existante

La fin de `src/styles.css` définit les variables du thème et surcharge une partie des styles historiques. Lors d’une intervention, regrouper les doublons du composant en préservant la spécificité, l’ordre effectif et les variantes responsive/impression. Six règles redondantes des tableaux de consultation, des installations et des créneaux d’établissement ont été regroupées ; le thème est conservé.

| Usage | Valeur existante |
| --- | --- |
| Fond | `--edu-bg: #fff9f5` |
| Surface | `--edu-surface: #ffffff` |
| Texte et contours | `--edu-text` / `--edu-border: #2d3748` |
| Texte secondaire | `--edu-muted: #64748b` |
| Pêche | `--edu-peach: #fdbcb4` |
| Bleu | `--edu-blue: #add8e6` |
| Menthe | `--edu-mint: #98ff98` |
| Vert | `--edu-green: #22c55e` |
| Lavande | `--edu-purple: #e6e6fa` |

Police de corps : Nunito ; titres et certains repères : Fredoka. Chargement depuis Google Fonts, avec repli système. Cartes et boutons utilisent contours foncés, angles arrondis et ombres décalées. Les professeurs ont des couleurs individuelles : maintenir leur identité entre les vues.

Erreurs, succès et avertissements ont encore des styles propres à certains composants ; il n'existe pas de palette sémantique complètement centralisée.

## Composants et conventions

Réutiliser `src/ui/` pour modales, dates, tableaux, navigation et messages. Conserver la séparation entre rendu et branchement des événements.

- Donner un libellé explicite aux actions et un nom accessible aux boutons à icône.
- Afficher semaine A/B, cycle et établissement lorsque ces informations conditionnent l'action.
- Différencier modification en mémoire, sauvegarde Supabase en attente, succès confirmé et échec. Aucun enregistrement métier local n'est proposé.
- Confirmer suppression ou abandon de modifications ; ne pas effacer silencieusement le travail en attente.
- Montrer les raisons d'un bouton désactivé et la manière de compléter les prérequis.
- Conserver les variantes métier « période » / « cycle » selon le type d'établissement.

## Les sept principes UX appliqués au projet

| Principe | Application |
| --- | --- |
| Loi de Fitts | Garder accessibles navigation de semaine, ajout et validation ; vérifier les petits boutons des tableaux sur écran tactile |
| Loi de Hick | Répartir les réglages en sous-onglets ; montrer les choix pertinents pour le rôle et l'étape |
| Effet Zeigarnik | Signaler prérequis incomplets et modifications en attente ; ne pas promettre une reprise hors ligne non garantie |
| Loi de Jakob | Conserver les conventions calendrier, filtres, onglets, formulaires et confirmations |
| Effet de gradient de but | Utiliser les étapes complètes/incomplètes pour guider la préparation, sans pourcentage artificiel |
| Effet Von Restorff | Mettre en évidence action principale et conflits importants ; accompagner la couleur d'un libellé |
| Loi de Miller | Regrouper professeurs, classes, installations et cycles ; garder légendes et contexte visibles |

## États et adaptation

Prévoir chargement, vide, succès, erreur, accès refusé et indisponibilité réseau. Le succès d'une sauvegarde doit refléter son accusé serveur. Avant la première lecture Supabase, afficher l'attente ou l'erreur avec une action Réessayer. En cas de modification non sauvegardée, prévenir avant fermeture/rechargement : le brouillon reste seulement en mémoire.

Des media queries existent notamment à 980, 900, 760 et 720 px, ainsi que des styles d'impression. Certains tableaux sont larges : préserver des libellés lisibles et un défilement explicite plutôt que compresser toutes les colonnes. Des styles responsives ne démontrent pas une recette mobile réussie.

## Accessibilité, français et vérification

Vérifier à chaque modification : navigation clavier, focus visible et retour de focus des modales, libellés, contrastes, zoom et compréhension sans couleur. Aucun audit complet WCAG/RGAA n'est établi dans le dépôt.

Tous les fichiers doivent rester en UTF-8. Vérifier les accents dans les sources et le rendu web/standalone. Le contrôle automatique détecte certains encodages corrompus, pas toutes les fautes ou accents manquants : des libellés tels que « soirees » subsistent dans les sources.

La recette doit couvrir les parcours administrateur/membre, les messages d'erreur, l'impression et les tailles d'écran visées. Voir [TASKS.md](TASKS.md).
