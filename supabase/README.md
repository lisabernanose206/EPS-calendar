# Schéma et migrations Supabase

`schema.sql` décrit une installation neuve. Une modification de ce fichier ou un push GitHub ne modifie pas la base hébergée.

Pour une base existante, utiliser **[migrations/20260926_security_hardening.sql](migrations/20260926_security_hardening.sql)** dans le SQL Editor du bon projet Supabase. Ce fichier n'a pas été exécuté sur la production par l'assistant.

## Appliquer la correction

1. Conserver un export ou un point de restauration de la base avant la migration. Le [diagnostic en lecture seule](../audit/production-readonly.sql) aide à comparer les fonctions et permissions existantes.
2. Copier **tout le contenu du fichier de migration**, de `begin;` à `commit;`, dans une nouvelle requête du SQL Editor et l'exécuter avec le rôle propriétaire de la base. Ne pas recopier tout `schema.sql` sur une base existante.
3. Si une erreur apparaît, ne pas poursuivre avec des morceaux isolés : la transaction annule les changements. Une politique supplémentaire inconnue est signalée explicitement pour éviter d'écraser une personnalisation. Examiner cette politique avant d'adapter la migration, plutôt que de supprimer le contrôle.
4. Après réussite, tester sur le site : connexion, renommage de l'établissement, sauvegarde d'un planning, création d'une invitation « consultation » et acceptation par un compte de test. Vérifier qu'un membre ne devient pas administrateur et qu'un lien consommé est refusé.

La migration peut être réexécutée. Elle ajoute les colonnes manquantes `max_uses`, `used_count`, `eps_feedback.etab_id` et `author_user_id`, conserve les plannings et les membres, et ne modifie pas la configuration OAuth. Si d'autres colonnes/fonctions diffèrent du schéma attendu, PostgreSQL peut refuser la migration : transmettre alors le message exact avant d'appliquer d'autres changements.

## Protections ajoutées

- **S01** : ancienne RPC `claim_etab_for_current_user` désactivée et permissions d'exécution retirées. La création normale d'un établissement et les invitations restent disponibles.
- **S03** : seuls `name` et `slug` peuvent être mis à jour directement sur un établissement. Le transfert de créateur passe par la fonction qui contrôle l'identité du créateur actuel.
- **S04** : consommation conditionnelle et atomique d'une invitation ; conservation du rôle administrateur existant ; rôle effectif renvoyé au navigateur. Les opérations de gouvernance verrouillent d'abord l'établissement. Une invitation dont l'émetteur n'est plus administrateur est refusée.
- **S08** : taille et profondeur du JSON bornées, tableaux et données de professeurs contrôlés, clés dangereuses refusées, établissement cohérent et identité de ligne immuable. Auteur des demandes attribué par `auth.uid()`, limites des messages vérifiées au serveur. Seuls l'auteur encore membre et les administrateurs peuvent lire une demande ; les anciennes demandes sans auteur vérifié restent visibles aux administrateurs si leur établissement est connu. Les anciennes demandes sans établissement restent réservées à l’opérateur de base jusqu’à leur rattachement explicite.
- **S09** : horodatage des sauvegardes imposé par le serveur et journal `eps_security_audit` alimenté par des triggers. Il contient l'acteur, l'établissement, le type d'opération, le membre/créateur concerné et les changements de rôle. Aucun planning, email, texte de demande ou jeton d'invitation n'y est copié.
- **S10** : révocation des droits implicites des fonctions applicatives et des anciens droits de table/colonne ; droits minimaux réattribués ; `search_path` vide pour les fonctions privilégiées ; aucun accès direct aux jetons d'invitation depuis les rôles applicatifs.

Les anciens liens avec `max_uses` nul sont désormais traités comme des liens à usage unique. Un lien déjà utilisé peut donc être refusé : générer un nouveau lien. Les liens ayant une limite explicite conservent cette limite.

## Journal, limites et maintenance

Le journal est réservé à l'opérateur de base ; aucun rôle navigateur ne peut le lire, l'altérer ou le supprimer. Définir sa durée de conservation et sa purge selon les besoins de l'établissement. Aucune suppression automatique n'est installée. Il ne trace que les opérations validées : les transactions refusées/annulées ne laissent pas de ligne durable dans ces triggers. La détection des refus nécessite les journaux de la plateforme. Un administrateur de base conserve naturellement ses pouvoirs sur ces journaux.

La validation JSON couvre les invariants de sécurité et les structures principales, pas toutes les règles métier de construction du planning. Les données historiques ne sont pas réécrites ou purgées automatiquement ; une ancienne donnée invalide pourra être refusée lors de sa prochaine modification. La concurrence des sauvegardes repose toujours sur la condition de version envoyée par les clients corrigés : les anciens clients doivent être remplacés.

Les fonctions privilégiées inconnues, les droits hérités de rôles personnalisés, la configuration du compte Supabase, les sauvegardes, le chiffrement au repos et les secrets historiques restent à vérifier sur le serveur réel. Cette migration n'est pas une certification de la production.

## Tests

```sh
npm run audit:sql
npm run audit:sql:migration
```

Les deux suites exécutent les mêmes 26 contrôles sur PostgreSQL embarqué éphémère (PGlite), sans données réelles. La seconde utilise une ancienne version du schéma privée de `max_uses`, avec des permissions excessives, puis applique la migration deux fois. Le schéma neuf est également exécuté deux fois. Les tests comprennent les autorisations refusées et les parcours normaux (invitation, transfert, renommage, sauvegarde, demande et journal).

La consommation des invitations utilise un UPDATE conditionnel unique, conformément au [modèle de verrouillage PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html). Le test d'utilisation séquentielle passe ; **le scénario simultané avec deux connexions indépendantes n'a pas été exécuté** : PGlite utilise ici une seule connexion et le moteur Docker local est arrêté. À valider sur une base de recette. Le durcissement des fonctions suit les [précautions PostgreSQL pour SECURITY DEFINER](https://www.postgresql.org/docs/current/sql-createfunction.html).

`audit/fixtures/schema-before-security.sql` est exclusivement une fixture historique vulnérable pour les tests : ne jamais l'appliquer à la production.


## Adaptation au relevé de colonnes fourni

La migration accepte les invitations dont le jeton est un UUID comme celles dont le jeton est du texte, sans convertir ni régénérer les jetons existants. Elle conserve le défaut d’expiration existant (14 jours dans le relevé fourni) et les invitations historiques sans créateur ; ces dernières ne sont pas acceptables sans émetteur administrateur vérifiable.

La colonne manquante eps_feedback.etab_id est ajoutée **avant** les politiques qui la référencent. Elle reste nullable pour conserver les anciennes demandes : aucun établissement n’est déduit du nom du planning, du texte ou de l’auteur libre. Les nouvelles demandes doivent fournir un établissement autorisé. Les anciens plannings dont etab_id est nul restent inchangés et invisibles aux rôles applicatifs ; leur rattachement exige une décision explicite de l’opérateur.

Le test 
pm run audit:sql:observed reproduit ces différences de colonnes, vérifie les invitations en UUID et compare intégralement les anciennes lignes de planning, demande et invitation avant/après deux migrations. Il comporte désormais 28 contrôles. Les sept politiques ont ensuite été fournies et intégrées aux tests. Les contraintes, triggers et fonctions réels n’ont pas été exportés : ce test reproduit les colonnes et politiques observées, **pas toute la base de production**. Les contrôles de politiques inconnues et la transaction restent actifs. La table eps_plannings_backup n’est pas modifiée.


## Anciennes politiques examinées après le blocage

La migration reconnaît et remplace explicitement les cinq noms supplémentaires transmis : admin write planning, read planning, owners insert plannings, owners update plannings et members read own memberships. Elle ne désactive pas le contrôle des autres politiques inconnues.

La politique de lecture utilisant USING (true) et le privilège général lié à un email sont supprimés ; les accès reposent désormais sur l’appartenance à chaque établissement et son rôle owner/member. L’ancien compte privilégié doit donc être membre avec le rôle owner pour modifier un établissement. Aucun compte n’est promu automatiquement. Le planning et les appartenances existantes ne sont pas supprimés.

La fixture observed-policies.sql reproduit les sept politiques transmises, avec un email fictif. Les fonctions is_etab_member et is_etab_owner y sont simulées, car leurs définitions réelles n’ont pas été reçues. La migration remplace leurs usages dans ces politiques par des vérifications explicites ; elle ne supprime pas ces fonctions et ne prétend pas les auditer.

Validation : 26 contrôles sur installation neuve, 26 sur migration historique, 28 sur colonnes et politiques observées. Les deux derniers couvrent la conservation des données après deux applications et l’arrêt transactionnel lorsqu’une autre politique inconnue est présente. Aucun changement n’a été appliqué par l’assistant au serveur hébergé.
