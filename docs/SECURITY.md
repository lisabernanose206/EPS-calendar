# Sécurité — EPS Loustic

État courant du dépôt au 27 septembre 2026. Référence des exigences et limites de sécurité.

**Les corrections frontend et SQL sont présentes dans le dépôt. Leur publication et l'application de la migration Supabase ne sont pas confirmées ici.** Une suite locale réussie ne prouve pas la sécurité de la production.

## Documents de référence

- [Migration Supabase](ARCHITECTURE.md#migration-supabase) : procédure, compatibilité et limites serveur.
- [Commandes de validation](#commandes-de-validation) : exécution des suites de tests.
- [Tâches ouvertes](TASKS.md) : vérifications restantes.

L'audit et le suivi des corrections sont intégrés ci-dessous. Aucun rapport Markdown séparé n'est maintenu. Les actions ouvertes sont centralisées dans TASKS.md.

## 1. Authentication — Authentification

Supabase Auth gère les identités. Le parcours visible propose Google ; des fonctions email/mot de passe restent dans le service d'authentification.

Le flux Google utilise PKCE SHA-256. La preuve temporaire est liée à l'onglet, au backend et à l'URL de retour, avec expiration après dix minutes. Le retour échange le code et vérifie l'utilisateur via Auth avant d'enregistrer la session. Les anciens retours implicites sont refusés et les paramètres sensibles sont nettoyés de l'URL.

La session et ses jetons restent dans `localStorage`. Le service sait rafraîchir la session. La déconnexion demande la révocation de la session courante puis purge le stockage applicatif ; un avertissement est conservé si la révocation n'est pas confirmée.

Exigences : ne pas déduire une identité du champ auteur libre, ne pas conserver de mot de passe applicatif, refuser les retours OAuth non sollicités. Tester les retours refusés et expirés.

À vérifier sur la plateforme : fournisseurs, redirections, rotation/expiration, protections anti-abus et MFA. Leur configuration effective n'est pas décrite par le dépôt.

## 2. Authorization — Autorisation

La frontière de sécurité est PostgreSQL/Supabase : RLS, permissions explicites et RPC. `member` désigne la consultation, `owner` l'administration ; `created_by` identifie le créateur. Les contrôles d'interface et verrous métier ne remplacent aucune permission serveur.

Le schéma et la migration du dépôt :

- désactivent l'ancienne RPC de promotion `claim_etab_for_current_user` et retirent ses permissions ;
- limitent l'UPDATE direct d'un établissement à son nom et son slug ;
- contrôlent changements de gouvernance et transfert de créateur par RPC ;
- consomment les invitations conditionnellement, conservent un rôle administrateur déjà acquis et vérifient l'émetteur ;
- retirent l'accès direct applicatif aux jetons d'invitation ;
- limitent la lecture des demandes à leur auteur encore membre et aux administrateurs ;
- imposent des grants minimaux et un `search_path` vide aux fonctions privilégiées concernées.

Tester les appels directs avec utilisateurs anonymes, membres, administrateurs, créateurs et utilisateurs d'un autre établissement. La configuration du navigateur ne doit jamais accorder un droit.

Les lignes historiques sans rattachement fiable ne sont pas attribuées automatiquement. La migration refuse les politiques inconnues plutôt que les supprimer silencieusement. Fonctions et privilèges spécifiques à la base réelle restent à inventorier.

## 3. Encryption — Chiffrement et transport

Le client exige une origine backend HTTPS, contrôle la destination des requêtes sensibles et refuse les redirections réseau. La configuration navigateur ne doit contenir que l'URL et une clé Supabase publique ; jamais de clé `service_role` ni de secret serveur.

DOMPurify filtre les insertions HTML. Les gabarits contiennent une CSP ; le standalone utilise une empreinte du script généré. Ne pas introduire `unsafe-inline` dans `script-src`. Un domaine API personnalisé exige une adaptation explicite de la CSP.

Limites :

- aucun chiffrement applicatif des sessions/plannings locaux, ni cookie HttpOnly ;
- pas de chiffrement de bout en bout identifié ;
- une CSP meta ne fournit pas `frame-ancestors` ;
- chiffrement serveur au repos, sauvegardes, en-têtes publiés et accès opérateur non vérifiés ;
- polices Google externes : dépendance réseau et transmission des métadonnées habituelles.

Les liens d'invitation sont des secrets transmissibles ; ne pas les inclure dans les journaux.

## 4. Logging — Journalisation

Le diagnostic frontend garde au maximum 50 événements techniques en mémoire : rendu, OAuth, déconnexion, chargement et sauvegarde. Il n'enregistre ni jetons, ni emails, ni contenu métier et disparaît au rechargement.

Le SQL prévoit `eps_security_audit`, alimenté par triggers pour des opérations validées : acteur, établissement, opération et changements de gouvernance. Les rôles applicatifs ne peuvent pas consulter ou modifier ce journal. Les plannings, messages et jetons d'invitation n'y sont pas copiés.

Les transactions annulées ne laissent pas de trace durable dans ces triggers. Les refus nécessitent les journaux de plateforme. Rétention, purge, alertes et responsabilité de suivi restent à définir ; aucune purge automatique n'est installée.

## 5. Testing — Tests

| Contrôle | Périmètre |
| --- | --- |
| Statique | Insertions HTML, empreinte CSP, UTF-8 ciblé, validation, transport et diagnostic |
| Runtime Node | Sauvegardes, collisions, pannes et changement de contexte avec serveur simulé |
| Playwright sécurité | XSS, OAuth, déconnexion et CSP sur Vite et standalone |
| Playwright fonctionnel | Navigation, rôles d'interface, état partagé et accents |
| PGlite | Schéma neuf, migration historique et colonnes/politiques observées ; identités fictives |

Les fixtures vulnérables de `tests/security/fixtures/` ne sont jamais à déployer. Les tests isolent les données réelles ; l'interface ne démontre pas les autorisations de production.

La CI inclut ces contrôles, mais reste indépendante de Pages. Une recette avec comptes dédiés et deux établissements reste nécessaire, ainsi qu'un essai d'invitations simultanées avec deux connexions PostgreSQL indépendantes. PGlite utilise ici une seule connexion.

Les résultats datés des phases précédentes sont conservés dans la section « Audit et suivi des corrections » ci-dessous. Ne pas présenter une exécution locale comme un contrôle du serveur hébergé.

## 6. Data Processing — Traitement des données

Les entrées comprennent référentiels, blocs, CSV, JSON distant, invitations et messages libres.

Le frontend borne les données de planning en taille/profondeur, contrôle les structures principales et refuse les clés de pollution de prototype. Le CSV est limité à 2 Mo ; les demandes à 5 000 caractères et leur auteur affiché à 200 caractères. Le user-agent a été retiré du feedback.

Le SQL valide les invariants principaux du JSON, sa cohérence avec l'établissement et l'identité de ligne, attribue l'auteur authentifié des demandes et impose l'horodatage des sauvegardes. Il ne valide pas toutes les règles métier.

La synchronisation utilise un PATCH conditionnel sur `updated_at`, vérifie l'accusé serveur et protège le contexte capturé. Elle refuse les collisions sur une même zone. Les anciens clients peuvent contourner cette convention de concurrence et doivent être remplacés.

Les caches et jetons locaux sont purgés à plusieurs transitions, mais l'isolation complète par utilisateur/établissement reste à renforcer. Les modifications en attente et la référence de comparaison ne constituent pas une file hors ligne complète.

Ne pas ajouter de données nominatives d'élèves ou de données sensibles sans besoin établi. Destinataires, rétention, effacement et restauration doivent être définis par le responsable du traitement ; aucune conformité juridique n'est attestée ici.

## Revue requise lors d'un changement

Pour chaque dimension affectée, identifier contrôle réel, emplacement serveur/client et preuve de test. Vérifier scénarios de refus, minimisation et limites restantes.

Cette mise à jour documentaire ne modifie ni authentification, ni permissions, ni traitement des données. Elle centralise les exigences sans exécuter de migration ni publier de contenu.

## Audit et suivi des corrections

### Périmètre de l'audit du 26 septembre 2026

Version auditée : commit `1a7acc760a1473fb6cdd6050c9f4c10a50421059` (`refactoring`), avant les corrections. L'examen couvrait sources, standalone, SQL, dépendances, tests et publication Pages.

Les preuves SQL provenaient de PostgreSQL éphémère avec identités simulées ; les preuves navigateur et runtime utilisaient uniquement des données fictives. Aucune donnée métier de production n'a été lue ou modifiée. Seule une requête HEAD du site public a relevé HTTP 200, HSTS et HTML UTF-8, sans CSP ni protections d'encadrement observées à cet instant. Les comptes hébergés, secrets historiques Git, sauvegardes et paramètres serveur n'ont pas été audités.

Les priorités ci-dessous sont qualitatives, sans score CVSS. Un défaut reproduit localement ne démontre ni son déploiement ni une exploitation passée.

### Constats, corrections et preuves

« Corrigé » signifie présent et testé dans le dépôt ; la mise en production reste à confirmer.

| ID / priorité initiale | Constat avant correction | Correction dans le dépôt et vérification |
| --- | --- | --- |
| S01 — Critique | Un membre pouvait se promouvoir en administrateur via `claim_etab_for_current_user` dans son établissement. | RPC désactivée, droits retirés ; SQL-01 vérifie le refus. |
| S02 — Élevée | Un nom de professeur distant injecté exécutait du JavaScript et lisait un refresh token fictif ; un brouillon de demande pouvait aussi injecter du HTML. | DOMPurify aux insertions HTML, encodage des champs/attributs/brouillons et CSP ; tests XSS-01/XSS-02 sur web et standalone, plus analyse statique. |
| S03 — Élevée | Un administrateur non créateur pouvait réécrire `etabs.created_by` par UPDATE direct. | UPDATE limité aux colonnes de présentation, transfert par RPC contrôlée ; SQL-02 vérifie le refus et SQL-15 le transfert légitime. |
| S04 — Moyenne | Une invitation membre rétrogradait un administrateur/créateur ; risque de double consommation simultanée. | Rôle administrateur préservé, consommation conditionnelle atomique, contrôle de l'émetteur ; SQL-03, SQL-11 et SQL-13. Test à deux connexions encore nécessaire. |
| S05 — Élevée | Marqueurs locaux perdus après erreur, écrasement entre utilisateurs, destination mutable en cours d'envoi et sauvegarde en attente non relancée. | Contexte capturé, PATCH conditionné par version, accusé obligatoire, trois tentatives maximum, conservation des nouvelles modifications et reprise après lecture ; SYNC-01 à SYNC-07. |
| S06 — Moyenne | La déconnexion purgeait seulement le navigateur, sans demande de révocation distante. | Appel de déconnexion de la session courante puis purge ; avertissement en cas d'échec. AUTH-02 vérifie requête et suppression locale. |
| S07 — Moyenne | Une réponse utilisateur OAuth refusée laissait créer une session locale ; absence de PKCE. | PKCE, validation de l'utilisateur avant stockage, preuve liée au contexte et nettoyage immédiat de l'URL ; AUTH-01, AUTH-03 et scénarios AUTH-PKCE. |
| S08 — Moyenne | JSON incohérent avec l'établissement accepté, structures/imports/messages insuffisamment bornés et auteur libre non fiable. | Validation client et serveur, limites CSV/messages, auteur authentifié imposé au serveur, user-agent retiré et lecture des demandes restreinte ; SQL-09, SQL-18/19/21/23/24 et contrôles statiques. |
| S09 — Moyenne | Absence de journal métier dans le schéma audité et horodatage fourni par le navigateur. | Diagnostic client minimal et journal serveur restreint, horodatage imposé ; SQL-17/20 et contrôle du diagnostic. Rétention et suivi des refus restent à définir. |
| S10 — Faible à moyenne | EXECUTE implicite trop large, search_path à durcir et visibilité potentielle des jetons d'invitation. | Grants explicites minimaux, révocations, fonctions privilégiées durcies et accès direct aux jetons retiré ; SQL-10/14. Les droits spécifiques à la production restent à examiner. |
| S11 — Moyenne | Backend HTTP accepté, absence de CSP observée et données locales non chiffrées par l'application. | HTTPS et destination contrôlés, redirections refusées, CSP des deux gabarits, empreinte du standalone et referrer désactivé ; ENC-01/02 et XSS-CSP. Chiffrement local et protection d'encadrement restent limités. |

### Portée exacte des preuves et limites conservées

- S01 n'a pas démontré l'accès arbitraire à un établissement extérieur. S03 concernait un administrateur déjà autorisé dans son établissement.
- La XSS distante S02 a été reproduite sur un planning fictif ; celle du brouillon était locale et ne démontrait pas à elle seule une attaque contre un autre utilisateur. Aucun vrai jeton n'a été exfiltré.
- S05 prouvait les défauts des fonctions avec un serveur simulé, pas tous les timings de navigation ni un contournement RLS. La concurrence actuelle repose sur les clients corrigés ; pas de fusion automatique sur une même zone ni de file durable complète. La référence de comparaison disparaît au rechargement.
- S07 démontrait une session locale incohérente, pas une authentification serveur contournée. L'ancien flux implicite n'était pas à lui seul une preuve de compromission.
- S08 démontrait une incohérence JSON, pas une lecture inter-établissements. Les validations serveur couvrent les invariants de sécurité, pas toutes les règles métier.
- S10 ne démontrait pas une promotion anonyme : les contrôles internes d'identité restaient actifs. La lecture des invitations dépendait aussi des grants réellement déployés.
- La révocation d'un refresh token n'annule pas nécessairement un access token déjà émis avant son expiration. Les anciens liens OAuth avec jetons dans le fragment sont refusés ; relancer la connexion Google.
- Les journaux serveur ne conservent que les opérations validées ; les transactions annulées nécessitent les journaux de plateforme. Aucun contenu métier intégral, email ou jeton ne doit être ajouté au diagnostic.
- Le contrôle initial des secrets était ciblé et hors historique Git. Aucune certification de conformité ou de sécurité de la production n'en découle.

### Résultats par phase

| Phase | Résultats locaux consignés |
| --- | --- |
| Audit initial, 26 septembre | SQL : 7/12 satisfaits ; runtime : 0/6 ; sécurité navigateur : 2/10 ; fonctionnel : 16/16. Audit npm : aucune vulnérabilité connue signalée à cet instant. |
| Corrections frontend, 26 septembre | Build et statique réussis ; runtime : 10/10 ; navigateur : 18/18 ; fonctionnel : 16/16 sous Edge. Audit npm de production sans vulnérabilité connue signalée lors de cette exécution. Aucun changement serveur durant cette phase. |
| Corrections SQL puis validation du 27 septembre | Installation neuve : 26/26 ; migration historique : 26/26 ; colonnes et politiques observées : 28/28 ; runtime : 10/10 ; navigateur : 18/18 ; fonctionnel : 16/16. Builds et contrôles statiques réussis. |

Les tests ne sont pas neutralisés pour masquer les constats. Les résultats bruts locaux sont générés dans `tests/security/results/` et ignorés par Git. Les contrôles npm sont des résultats ponctuels, pas une garantie continue.

### Maintenance et clôture

Modifier les sources, puis exécuter `npm run build` pour régénérer le standalone et son empreinte CSP ; ne pas modifier directement son script. Ne pas ajouter `unsafe-inline` à `script-src`. Une API personnalisée doit être autorisée explicitement dans les deux gabarits ; tout script de configuration doit respecter la CSP.

Les six dimensions ci-dessus décrivent les protections maintenues. Les actions de recette, déploiement, rétention et restauration restent dans [TASKS.md](TASKS.md), sans second backlog. Le [guide de migration](ARCHITECTURE.md#migration-supabase) conserve la procédure de migration.

Références techniques conservées : [déconnexion Supabase](https://supabase.com/docs/guides/auth/signout), [PKCE Supabase](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [permissions des fonctions](https://supabase.com/docs/guides/database/functions), [DOMPurify](https://github.com/cure53/DOMPurify), [stockage navigateur OWASP](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) et [PGlite](https://pglite.dev/docs/).

## Commandes de validation

Depuis la racine :

```sh
npm ci
npm run build
npx playwright install chromium
npm run audit:security
npm test
```

Sous PowerShell avec Edge installé :

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm.cmd run build
npm.cmd run audit:security
npm.cmd test
```

| Commande | Vérification |
| --- | --- |
| `npm run audit:sql` | Schéma neuf exécuté deux fois dans PGlite |
| `npm run audit:sql:migration` | Ancienne base sans `max_uses`, droits excessifs, migration répétée |
| `npm run audit:sql:observed` | Colonnes et sept politiques communiquées, invitations UUID, conservation des anciennes lignes fictives |
| `npm run audit:runtime` | Modules JavaScript avec DOM neutralisé et fetch simulé |
| `npm run audit:browser` | XSS, OAuth, déconnexion et CSP sur Vite et standalone |
| `npm run audit:frontend` | Contrôles statiques, runtime et navigateur |
| `npm run audit:security` | Statique, trois suites SQL, runtime et navigateur |
| `npm audit` | Contrôle distinct des vulnérabilités connues des dépendances |

Le navigateur de sécurité utilise le port local 5182. Reconstruire après un changement applicatif pour actualiser le standalone. Les tests fonctionnels restent séparés de l'audit.

Les suites SQL neuve et historique exécutent chacune 26 contrôles ; la suite observée en exécute 28. Le schéma neuf et la migration sont appliqués deux fois pour vérifier leur réexécution. Les tests couvrent refus d'accès et parcours normaux : invitation, transfert, renommage, sauvegarde, demande et journal. PGlite simule les rôles, `auth.users` et `auth.uid()`. La création de l'extension pgcrypto est retirée du schéma neuf pour ce moteur ; `gen_random_uuid()` est fourni par PostgreSQL.

Les appels navigateur hors de l'origine locale exacte sont interceptés. Le runtime utilise un DOM neutralisé et un fetch simulé. Les fixtures historiques vulnérables ne doivent jamais être déployées. Les résultats dans `tests/security/results/` sont ignorés par Git. Un échec donne un code de retour non nul : ne pas désactiver une assertion pour masquer une faille.

Le [diagnostic SQL en lecture seule](../tests/security/production-readonly.sql) s'exécute séparément dans le SQL Editor Supabase. Il inspecte politiques, privilèges, fonctions et contraintes sans lire les lignes métier ni modifier la base. Les suites locales ne l'exécutent pas sur le serveur.
