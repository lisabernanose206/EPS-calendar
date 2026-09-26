# Audit de sécurité EPS Loustic — 26 septembre 2026

> **Mise à jour Supabase :** après autorisation, les corrections SQL ont été préparées et testées localement. Voir [la migration et ses limites](supabase/README.md). Elles ne sont pas encore appliquées à la base hébergée. Les mentions « serveur inchangé / failles ouvertes » ci-dessous décrivent le périmètre de la phase précédente.

> **Suivi des corrections :** ce rapport décrit le code avant correction. Voir [les corrections frontend et leurs limites](SECURITY-FIXES-2026-09-26.md). Le schéma et la configuration Supabase restent inchangés ; les constats serveur restent ouverts. Les références de lignes ci-dessous correspondent à la version auditée.

**Conclusion : plusieurs failles importantes sont reproduites localement. La sécurité de la production ne peut pas être certifiée sans vérifier son schéma et sa configuration Supabase.** Le schéma du dépôt autorise une promotion illégitime de membre en administrateur. Le frontend permet une injection JavaScript à partir de données de planning et expose alors les jetons stockés dans le navigateur.

## Périmètre et limites

- Référence applicative : commit `1a7acc760a1473fb6cdd6050c9f4c10a50421059` (`refactoring`). Sources, HTML standalone, schéma SQL, dépendances, tests et workflow GitHub Pages examinés.
- Authentification, autorisations, traitement et intégrité des données, chiffrement/transport, journalisation et tests.
- Tests SQL sur PostgreSQL embarqué **éphémère**. Les rôles et l’identité Supabase sont simulés, les fonctions et politiques testées proviennent du dépôt. Aucune hypothèse selon laquelle ce schéma correspond exactement au serveur déployé.
- Tests navigateur sur Vite et standalone locaux, avec des données et jetons fictifs. Les requêtes externes sont interceptées. Aucun test offensif, aucune lecture de planning et aucune mutation sur Supabase en production.
- Uniquement une requête HTTP `HEAD` sur le site public GitHub Pages, pour relever les en-têtes de transport. Aucun audit des comptes GitHub/Supabase, des permissions d’organisation, des sauvegardes serveur ou des secrets historiques Git.
- Le code applicatif et le schéma de production n’ont pas été corrigés dans ce travail : les livrables sont le rapport, les tests, un script de vérification en lecture seule et la documentation.

Les niveaux ci-dessous expriment une priorité de correction, pas un score CVSS calculé. « Confirmé SQL local » ne signifie pas « exploité ou confirmé sur le Supabase de production ».

## Résumé des constats

| ID | Priorité | Domaine | Constat | Preuve |
| --- | --- | --- | --- | --- |
| S01 | Critique | Autorisations | Un membre peut devenir administrateur via une RPC de migration | SQL-01 |
| S02 | Élevée | Traitement / sessions | XSS dans le planning ; lecture possible du refresh token côté navigateur | XSS-01 sur les deux versions |
| S03 | Élevée | Autorisations | Un administrateur peut s’attribuer le statut de créateur par un UPDATE direct | SQL-02 |
| S04 | Moyenne | Invitations | Une invitation membre peut rétrograder un créateur ; risque de consommation concurrente | SQL-03 et revue SQL |
| S05 | Élevée | Intégrité | Modifications perdues, envois bloqués et contexte d’établissement mutable | SYNC-01 à SYNC-04 |
| S06 | Moyenne | Authentification | La déconnexion ne révoque pas la session côté serveur | AUTH-02 navigateur |
| S07 | Moyenne | Authentification | Session créée malgré un refus OAuth `/user` ; flux sans PKCE | AUTH-01 navigateur, AUTH-03 runtime |
| S08 | Moyenne | Validation / vie privée | JSON insuffisamment contraint, champs et imports non bornés, données persistantes | SQL-09 et revue |
| S09 | Moyenne | Logging | Pas de journal métier fiable des écritures et changements de droits dans le dépôt | Revue SQL/JS |
| S10 | Faible à moyenne | Durcissement | EXECUTE public implicite ; visibilité des invitations à vérifier sur le serveur | SQL-10 et revue des grants |
| S11 | Moyenne | Navigateur / chiffrement | Pas de CSP observée ; configuration HTTP acceptée ; données locales non chiffrées par l’app | HEAD public, ENC-01 et revue |

## S01 — Promotion illégitime de membre en administrateur

**Critique, confirmée sur le schéma local.** Dans `supabase/schema.sql:244`, `claim_etab_for_current_user` s’exécute en `SECURITY DEFINER`. La fonction refuse un utilisateur extérieur à une équipe existante, mais accepte tout membre déjà présent. Son `INSERT ... ON CONFLICT ... SET role = 'owner'` promeut alors ce membre. Le droit d’exécuter cette fonction est accordé à `authenticated`.

Le test SQL-01 part d’un membre en lecture seule, appelle la RPC et constate le rôle `owner`. Modifier le JavaScript n’est pas nécessaire : l’API exposée suffit si cette fonction et ces privilèges sont déployés. Cela donne les droits d’écriture et d’administration **dans l’établissement dont l’utilisateur est déjà membre** ; le test ne démontre pas l’accès arbitraire à tout établissement.

**Correction prioritaire :** retirer cette fonction de migration de l’API utilisable par les comptes applicatifs, ou la remplacer par une migration exécutée avec un rôle opérateur restreint. Révoquer explicitement les droits pertinents de `PUBLIC`, `anon` et `authenticated` avant d’accorder les seuls droits nécessaires. Retirer le bouton ou ne pas appeler la fonction depuis le frontend ne suffit pas. Vérifier les promotions passées si la fonction est effectivement déployée, sans présumer qu’un abus a eu lieu.

## S02 — Injection JavaScript et exposition des sessions

**Élevée, exécution confirmée dans les deux frontends locaux.** Des valeurs métier sont interpolées dans des chaînes HTML ensuite affectées à `innerHTML` (`src/app/render.js:73`). Exemple testé : `teacher.name` dans `src/tabs/events.js:43`. Les libellés d’activités, certains noms d’événements, classes et messages présentent aussi des interpolations non échappées.

Le test injecte un nom de professeur dans une réponse de planning fictive. À l’ouverture de l’onglet Événements, le navigateur exécute un gestionnaire d’événement HTML. La preuve retourne `executed: true` et `tokenReadable: true` : il peut lire le refresh token **fictif** stocké par `saveAdminSession` dans `localStorage` (`src/services/auth.js:120`). Aucun jeton réel n’est utilisé ni envoyé.

Une personne capable de modifier un champ partagé pourrait faire exécuter du code dans le navigateur d’un collègue. L’impact potentiel dépasse la simple modification visuelle : actions au nom de la victime, lecture de son planning et accès aux jetons. S01 peut fournir un chemin vers cette capacité d’écriture si le schéma vulnérable est déployé.

Le brouillon de demande (`src/tabs/request.js:60` et `:64`) accepte aussi une sortie de `textarea` et injecte un élément HTML après navigation. Cette seconde preuve est locale au brouillon : **elle ne démontre pas, seule, une attaque distante contre un autre utilisateur**. Les messages de validation (`src/ui/feedback.js:16`) doivent également être échappés.

**Correction :** traiter les champs métier comme du texte, privilégier `textContent`/`.value`, ou employer systématiquement un encodage adapté au contexte texte, attribut et URL. Valider les couleurs, identifiants et URLs ; l’échappement HTML seul ne valide pas tous les contextes. Ajouter une CSP en défense complémentaire. Revoir ensuite la persistance des sessions ; chiffrer dans le navigateur avec une clé accessible au même JavaScript ne protège pas d’une XSS.

## S03 — Contournement des privilèges réservés au créateur

**Élevée, confirmée SQL local.** `grant select, update on public.etabs to authenticated` (`supabase/schema.sql:62`) autorise l’UPDATE de toutes les colonnes. La politique `owners update own etab` (`:101`) contrôle le rôle et l’établissement, mais pas les colonnes modifiées. Un owner non créateur peut donc remplacer `created_by` par son propre identifiant.

Le test SQL-02 prouve ce changement. Les fonctions de transfert ou rétrogradation qui se fondent ensuite sur `created_by` ne protègent plus le statut de créateur comme prévu.

**Correction :** retirer l’UPDATE global de la table, accorder uniquement les colonnes de présentation autorisées, et réserver `created_by` à une fonction contrôlée ou un trigger approprié. Conserver les vérifications serveur de l’identité du créateur et journaliser les changements de gouvernance.

## S04 — Invitations et conservation des rôles

**Moyenne, rétrogradation confirmée SQL local.** `accept_etab_invite` remplace le rôle existant par `excluded.role` (`supabase/schema.sql:725`). Un créateur ou un owner acceptant une invitation membre devient membre. SQL-03 le reproduit sur le créateur. Avec un seul owner, cela peut faire disparaître le dernier administrateur utilisable.

La sélection d’une invitation valide et l’incrémentation de son compteur sont deux opérations sans verrou explicite (`:713` et `:728`). Deux transactions peuvent potentiellement passer le contrôle avant consommation ; **ce scénario concurrent n’a pas été exécuté**, PGlite n’exposant ici qu’une connexion. La réutilisation séquentielle est correctement refusée par SQL-11.

**Correction :** ne jamais rétrograder implicitement un rôle par acceptation d’invitation ; rendre cette opération idempotente et préserver le créateur. Consommer l’invitation dans une transaction avec verrou de ligne ou UPDATE conditionnel atomique. Ajouter un test à deux connexions sur un environnement PostgreSQL de recette. Vérifier la révocation d’une invitation encore valide et sa durée de vie de 30 jours.

## S05 — Intégrité des données et synchronisation

**Élevée pour l’intégrité ; plusieurs défauts reproduits avec un serveur simulé.**

1. **Perte du suivi des changements :** `cloudLoadFromRemote` efface les marqueurs locaux (`src/services/cloud.js:711`) avant que sa requête réussisse. Après un envoi échoué puis un chargement échoué, les modifications ne sont plus identifiées comme à envoyer. SYNC-01 le prouve. Si la lecture réussit, `applyPlanningData` peut remplacer des données locales non sauvegardées.
2. **Écrasement entre utilisateurs :** la sauvegarde lit le document puis renvoie l’ensemble de `data` par PATCH (`:629` à `:665`), sans condition sur la version lue. SYNC-02 simule deux utilisateurs modifiant des zones différentes : la seconde écriture annule la première, alors que les deux requêtes réussissent.
3. **Changement de destination en cours d’opération :** l’état d’établissement est relu après les `await`, tandis que les données ont été capturées avant. SYNC-03 change artificiellement A en B pendant la lecture et observe un envoi vers B contenant les données capturées dans A. Le risque concerne notamment un compte autorisé dans plusieurs établissements. **Le test prouve le défaut de la fonction, pas la reproductibilité de tous les timings de navigation réels ni un contournement RLS.**
4. **Sauvegarde en attente non relancée :** une modification pendant `cloudLoadFromRemote` positionne `cloudSaveQueued`, mais la fin du chargement ne déclenche pas son traitement. SYNC-04 démontre une file en attente sans timer d’envoi. Après un échec simple, aucune reprise automatique réseau n’est programmée non plus.

**Correction :** utiliser une file durable par utilisateur/établissement/planning, ne retirer que les changements réellement acquittés, et traiter la file après toute opération réseau. Capturer un contexte immuable pour chaque requête et refuser les réponses devenues obsolètes. Mettre les vérifications de version et l’écriture dans une opération atomique serveur ; définir une résolution explicite des conflits. Enregistrer les horodatages et l’acteur côté serveur plutôt que d’accepter l’heure du navigateur comme preuve d’écriture.

## S06 — Déconnexion uniquement locale

**Moyenne, absence de demande serveur confirmée.** `signOutAdmin` (`src/services/auth.js:828`) supprime la session et les données locales puis recharge la page, sans appeler l’API de déconnexion Supabase. AUTH-02 ne voit aucun POST `/auth/v1/logout` dans les deux versions.

La disparition du jeton sur cet appareil ne révoque donc pas une copie précédemment obtenue. L’audit n’a pas testé de refresh token réel après déconnexion.

**Correction :** appeler la déconnexion Supabase, choisir explicitement sa portée et gérer son échec, puis purger les données locales. Même après révocation, un JWT d’accès peut rester valable jusqu’à son expiration : le modèle de session et les opérations sensibles doivent en tenir compte. [Supabase — déconnexion](https://supabase.com/docs/guides/auth/signout).

## S07 — Validation de session OAuth et flux implicite

**Moyenne.** `fetchAuthUser` retourne `null` en cas d’échec, mais `handleOAuthRedirect` enregistre tout de même les jetons reçus (`src/services/auth.js:86`). AUTH-01 renvoie une réponse 401 à `/auth/v1/user` et constate une session locale contenant `user: null`. `isSignedIn` ne teste que la présence d’un token.

Cela crée un état d’interface trompeur et peut interagir avec des données déjà en cache. **Ce n’est pas une preuve d’authentification serveur contournée : Supabase doit continuer à refuser un JWT invalide.**

Le flux lit les tokens dans le fragment de l’URL. `startOAuthProvider` ne prépare pas de PKCE (AUTH-03). Le fragment est normalement nettoyé ensuite ; si une étape échoue avant le nettoyage, il peut rester dans l’URL. Le flux implicite est un mode pris en charge, son utilisation ne constitue pas à elle seule une compromission démontrée.

**Correction :** ne créer la session qu’après une validation réussie de l’utilisateur, nettoyer l’URL même sur erreur, traiter les sessions périmées et les rôles devenus invalides. Préférer le SDK Supabase et le flux PKCE plutôt qu’une gestion manuelle partielle du protocole. [Supabase — PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## S08 — Validation, minimisation et conservation des données

**Moyenne, intégrité et confidentialité.** `eps_plannings.data` est un JSONB libre. SQL-09 accepte un `data.etabId` différent de l’`etab_id` de la ligne. Le filtre RLS sur la ligne continue à s’appliquer ; cette preuve ne démontre pas une lecture inter-établissements. Elle montre une incohérence acceptée par le serveur qui peut ensuite bloquer le chargement côté application.

Les champs métier ne sont pas suffisamment contraints en taille et structure côté SQL. L’import CSV lit le fichier entier (`src/tabs/classes.js:251`) sans limite de taille explicite. Le scénario XSS a aussi montré qu’un objet professeur incomplet peut interrompre le rendu, d’où la nécessité d’une validation structurelle avant application. Les limites éventuelles de passerelle Supabase ne remplacent pas un schéma métier.

Les données traitées comprennent les noms et adresses des membres, noms de professeurs, classes, horaires, lieux, contraintes et texte libre des demandes. Les demandes enregistrent aussi un user-agent et des métadonnées (`src/tabs/request.js:13`). Le champ `author` est libre, donc ne constitue pas une preuve d’identité. La lecture des emails des membres et des demandes est ouverte aux membres de l’établissement selon le schéma ; confirmer que cela correspond au besoin.

Le planning, la session et des métadonnées sont persistés dans `localStorage`, avec des clés générales plutôt que des espaces par utilisateur/établissement. La déconnexion et le changement d’établissement purgent de nombreuses clés, ce qui est utile, mais l’audit n’a pas vérifié toutes les situations de révocation d’accès, de poste partagé ou de changement de compte sans déconnexion. Aucune politique métier de rétention/purge automatisée n’est présente dans le dépôt.

**Correction :** valider formes, types, tailles, identifiants et périmètre côté serveur ; borner les imports avant lecture ; rejeter les données incohérentes avant rendu. Définir les destinataires et durées de conservation des demandes, limiter le texte libre sensible, associer l’auteur authentifié côté serveur, et isoler/purger les caches par compte et établissement. Les exigences juridiques exactes et la conformité ne sont pas évaluées ici.

## S09 — Journalisation insuffisante dans l’application

**Moyenne, capacité de détection et d’investigation.** Le dépôt ne définit pas de table/trigger d’audit métier. Le frontend a surtout un `console.error` (`src/app/render.js:75`) et des messages temporaires. `updated_at` provient du navigateur dans les écritures du planning ; aucune identité d’auteur, révision serveur ou trace immuable n’est associée à chaque modification dans ce schéma.

Cela ne signifie pas que Supabase ou GitHub ne disposent d’aucun journal : leur activation, contenu et rétention n’ont pas été inspectés. `fallbackBugFixLog` et l’onglet historique décrivent les corrections du logiciel, pas les actions des utilisateurs.

**Correction :** journaliser côté serveur les changements de rôles/créateur, invitations, écritures/restaurations et refus sensibles avec acteur authentifié, établissement, action, révision, identifiant de requête et heure serveur. Prévoir un accès restreint et une rétention. Ne pas enregistrer les JWT, refresh tokens, mots de passe, liens d’invitation ou le contenu intégral des demandes/plannings. Relier les erreurs client à un identifiant de requête expurgé pour diagnostiquer les sauvegardes.

## S10 — Privilèges des fonctions et invitations

**Faible à moyenne, durcissement et configuration.** SQL-10 constate le droit EXECUTE d’`anon` sur la RPC sensible via les privilèges PostgreSQL par défaut. Les contrôles internes `auth.uid()` restent actifs : ce résultat n’équivaut pas à une promotion anonyme. Le schéma ne révoque pas explicitement EXECUTE de `PUBLIC` et utilise `SECURITY DEFINER SET search_path = public`.

La politique `members read invites` (`supabase/schema.sql:126`) permet à n’importe quel membre de lire les invitations de son établissement **si un privilège SELECT existe**. Le fichier n’accorde pas explicitement ce SELECT ; les privilèges réels et par défaut de Supabase doivent être contrôlés. Avec SELECT, des jetons d’invitation owner pourraient être visibles à des membres qui ne devraient pas les posséder.

**Correction :** grants explicites minimaux, révocation de PUBLIC/anon quand inutile, noms de tables qualifiés et `search_path` durci pour les fonctions privilégiées. Restreindre la consultation des invitations et éviter d’en exposer les tokens à tous les membres. [Supabase — fonctions et permissions](https://supabase.com/docs/guides/database/functions).

## S11 — Chiffrement, transport et protections navigateur

| Contrôle | Observation | Limite / action |
| --- | --- | --- |
| Site public HTTPS | HEAD de `https://lisabernanose206.github.io/EPS-calendar/` : HTTP 200, HSTS `max-age=31556952`, HTML UTF-8, relevé à 12:48:22 UTC | Point positif ; ne vérifie pas l’ensemble de la chaîne d’hébergement |
| Backend configuré | L’URL intégrée commence par HTTPS | `cloudWriteAllowed` accepte aussi une configuration HTTP : ENC-01 échoue. Le navigateur peut bloquer le mixed content, mais l’application ne valide pas explicitement le schéma/origine |
| CSP / encadrement | Pas d’en-tête CSP, X-Frame-Options ou Referrer-Policy dans ce relevé ; pas de CSP dans les gabarits locaux | Ajouter une politique adaptée aux scripts compilés/inline, aux polices et aux connexions Supabase. `frame-ancestors` nécessite un en-tête ; une meta CSP n’apporte pas cette directive |
| Stockage navigateur | Pas de chiffrement applicatif des jetons/plannings dans `localStorage` | L’éventuel chiffrement du disque est distinct ; le JavaScript de l’origine peut lire ces valeurs, comme prouvé par XSS-01 |
| Chiffrement serveur au repos / backups | Non vérifié sur le compte Supabase | Examiner garanties du service, configuration, accès, sauvegardes, rétention et restauration ; ne pas conclure à une absence de chiffrement |
| Chiffrement de bout en bout | Aucun mécanisme applicatif identifié | Ce n’est pas automatiquement une exigence pour ce planning ; le besoin doit être défini selon les données réellement stockées |
| Secrets côté navigateur | Clé `sb_publishable_` attendue ; aucun secret privé évident détecté par la recherche ciblée | Une clé publique n’est pas un secret. Contrôle par motifs limité, hors historique Git et configurations de comptes |

Les requêtes Google Fonts exposent les métadonnées réseau habituelles à un tiers. L’auto-hébergement des polices peut réduire cette dépendance. Les tokens d’invitation sont dans une query URL et doivent être traités comme des secrets transmissibles, indépendamment du chiffrement HTTPS.

Le stockage de jetons lisibles par JavaScript amplifie les conséquences d’une XSS. L’option cookies HttpOnly suppose une architecture serveur adaptée ; elle ne s’ajoute pas simplement à un HTML GitHub Pages. La priorité immédiate reste la suppression des injections et la correction des autorisations. [OWASP — stockage navigateur](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html).

## Tests et résultats

| Ensemble | Résultat | Interprétation |
| --- | --- | --- |
| Autorisations SQL en mémoire | 12 contrôles : 7 satisfaits, 5 non satisfaits | Confirme S01/S03/S04, incohérence JSON et grants trop larges sur le schéma local |
| Runtime isolé | 6 contrôles non satisfaits | Quatre défauts d’intégrité/contexte, absence PKCE et validation HTTPS absente ; les deux derniers sont des critères de durcissement |
| Sécurité navigateur | 10 scénarios : 2 satisfaits, 8 non satisfaits | Quatre propriétés échouent sur Vite et standalone ; les erreurs OAuth sont correctement échappées |
| Fonctionnel existant | 16 scénarios réussis | Navigation, rôles d’interface, persistance locale et ouverture du standalone ; ne prouvent pas les autorisations serveur |
| Dépendances | `npm audit` : 0 vulnérabilité connue signalée | Résultat ponctuel, ne couvre ni les bugs de l’app ni les réglages Supabase |

Les tests de sécurité restent volontairement **rouges** tant que les propriétés attendues ne sont pas corrigées ; ils ne sont pas marqués comme des échecs attendus pour masquer les constats. Résultats détaillés : `audit/results/sql.json`, `runtime.json`, `browser.json` et `dependencies.json`. Les résultats bruts sont locaux et ignorés par Git ; le présent rapport conserve la synthèse.

Reproduction : voir [audit/README.md](audit/README.md). PostgreSQL embarqué utilise le vrai moteur PostgreSQL via [PGlite](https://pglite.dev/docs/), mais ne reproduit pas l’API Supabase, ses paramètres de plateforme ni ses grants existants. Le schéma SQL doit être comparé à celui du serveur avant toute conclusion sur l’exposition réelle.

## Priorités de correction

1. **Vérifier puis fermer les chemins serveur S01 et S03**, avec une migration ciblée et des tests de rôle. Contrôler les politiques réellement installées plutôt que réappliquer aveuglément le schéma historique.
2. **Supprimer les injections HTML S02**, contrôler toutes les valeurs partagées et mettre en place une défense CSP compatible avec les deux builds.
3. **Fiabiliser S05** avec écritures atomiques/versionnées, file persistante et contexte d’établissement immuable. Réparer la déconnexion et la validation OAuth.
4. Durcir les invitations, validations serveur, logs et caches. Définir la conservation des données et les scénarios de récupération.
5. Faire passer les tests de sécurité en recette, compléter par des essais d’API avec de vrais comptes de test, puis déployer. Aucun push ou déploiement des livrables d’audit n’a été réalisé ici.

## Vérifications de production restant nécessaires

- Exécuter [audit/production-readonly.sql](audit/production-readonly.sql) dans l’éditeur SQL du projet : politiques RLS, grants, définitions RPC, contraintes et triggers. Le script ne lit pas les lignes métier et n’applique aucune modification.
- Vérifier les fournisseurs Auth, URLs de redirection autorisées, durée et rotation des sessions, confirmation d’email, protections de mots de passe, limites de débit, CAPTCHA et MFA selon le niveau de risque. Ces réglages ne sont pas déterminables dans le dépôt.
- Vérifier les journaux d’authentification/API/DB, leur accès et rétention, puis la traçabilité des changements de rôle/créateur. Ne pas exporter des secrets ou des données utilisateurs pour effectuer cette revue.
- Vérifier la région d’hébergement, les garanties de chiffrement au repos, les sauvegardes/PITR disponibles et surtout un exercice de restauration.
- Tester sur un projet de recette l’isolation entre deux établissements et entre comptes anon/membre/admin/créateur, la révocation d’accès et les invitations concurrentes. Aucun compte de test de production n’a été créé durant cet audit.

**Cet audit identifie des défauts et leurs reproductions ; il n’établit ni une compromission passée, ni une certification de conformité ou de sécurité de la production.**
