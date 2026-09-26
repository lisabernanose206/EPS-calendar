# Corrections de sécurité frontend — 26 septembre 2026

Ce suivi complète [l’audit initial](SECURITY-AUDIT-2026-09-26.md). Les corrections concernent uniquement le code de l’application. **Aucun SQL, aucune politique RLS, aucune configuration ni donnée Supabase n’a été modifié.** Les requêtes de tests utilisent des réponses et des identités fictives.

## Corrections appliquées

| Domaine | Protection ajoutée | Vérification |
| --- | --- | --- |
| Injections HTML — S02 | DOMPurify avant chaque insertion HTML ; encodage des champs métier, attributs et brouillons ; filtre des balises actives | XSS navigateur et contrôle statique des insertions |
| Authentification — S06/S07 | OAuth PKCE SHA-256 ; preuve temporaire liée à l’onglet, au serveur et à l’URL de retour ; expiration à 10 minutes ; `/user` validé avant stockage ; suppression immédiate du code et des anciens jetons de l’URL | Retours valides, utilisateur refusé, retour non sollicité et flux implicite refusé |
| Déconnexion — S06 | Demande de révocation de la session courante, puis purge locale ; avertissement visible si la révocation ne peut pas être confirmée | Requête de révocation et suppression locale vérifiées |
| Sauvegarde — S05 | Capture du contexte et des données ; abandon si le compte ou l’établissement change ; PATCH conditionné par `updated_at` ; accusé serveur obligatoire ; trois tentatives au maximum en cas de collision | Écritures simultanées sur zones différentes, changement de contexte et accusé vide |
| Conservation des modifications — S05 | Une lecture n’écrase pas les changements en attente ; conservation des marqueurs après erreur et des nouvelles modifications pendant l’envoi ; reprise des envois mis en attente pendant une lecture | Tests de panne et d’édition pendant les requêtes |
| Conflits — S05 | Comparaison avec la dernière version chargée dans cet onglet pour refuser l’écrasement d’une même zone modifiée ailleurs | Test de conflit sur la même zone |
| Données — S08 | Contrôle de structure, taille et profondeur du planning ; rejet des clés de pollution de prototype ; CSV limité à 2 Mo ; message limité à 5 000 caractères, auteur à 200 ; retrait du user-agent du feedback | Tests de validation et navigation |
| Transport — S11 | Origine HTTPS obligatoire ; refus d’envoyer les jetons à une autre origine ; redirections réseau refusées ; délai maximal des requêtes sensibles | Tests HTTPS et destination étrangère |
| Navigateur — S11 | CSP dans les deux HTML ; empreinte SHA-256 du script standalone ; interdiction des gestionnaires JavaScript inline, objets et actions de formulaires ; referrer désactivé | Tests CSP, empreinte du bundle et ouverture locale |
| Diagnostic — S09 partiel | Événements techniques en mémoire, limités à 50, sans jetons, adresses, identités ni contenu métier ; suppression du `console.error(error)` du rendu | Contrôle de minimisation et de taille |

Le parcours PKCE utilise les points d’entrée documentés par [Supabase Auth](https://github.com/supabase/auth/blob/master/openapi.yaml). Le filtre HTML repose sur [DOMPurify](https://github.com/cure53/DOMPurify), intégré au bundle : aucun téléchargement de ce filtre n’est nécessaire à l’ouverture du standalone.

## Limites qui restent ouvertes

- **S01, S03, S04, S10 et la validation serveur de S08 restent à corriger côté Supabase.** En particulier, le frontend ne peut pas empêcher un membre d’appeler directement une RPC serveur qui lui accorde indûment des droits. L’application ne peut donc pas être déclarée entièrement sécurisée.
- Les tests SQL de l’audit doivent rester en échec pour les défauts serveur reproduits. Ils ne sont pas neutralisés pour obtenir un résultat vert. `npm run audit:frontend` vérifie séparément le périmètre corrigé.
- Les tests OAuth et de sauvegarde simulent le serveur. Aucun véritable parcours Google, serveur de recette ou déploiement GitHub n’a été exercé. La configuration des URL de retour doit déjà autoriser l’adresse du site, comme auparavant.
- Les anciennes URL de connexion contenant des jetons dans le fragment sont refusées : relancer la connexion Google. Les sessions déjà enregistrées restent utilisables. La révocation du refresh token n’annule pas nécessairement un access token déjà émis avant son expiration.
- Les sessions et plannings restent stockés dans le navigateur. Il n’y a ni cookie HttpOnly, ni chiffrement applicatif au repos ajouté. Les droits d’accès, rétentions, sauvegardes et journaux fiables nécessitent une protection serveur ; un chiffrement avec une clé stockée à côté des données ne résoudrait pas ce problème.
- La concurrence repose sur `updated_at` et les clients corrigés. Les anciens clients peuvent encore écraser un document. Il n’y a pas de fusion automatique de changements concurrents dans une même zone, de file hors ligne multi-onglet, ni de reprise automatique illimitée. Le suivi de la version de référence est en mémoire : après rechargement de page, il ne permet plus de comparer une ancienne édition locale avec sa version initiale. Les modifications en attente bloquent le rechargement automatique ; comparer et sauvegarder avant de les abandonner explicitement.
- Les contrôles JSON du navigateur ne remplacent pas un schéma serveur strict. Le diagnostic technique local ne constitue pas un journal d’audit métier et disparaît au rechargement.
- Une CSP par balise meta ne permet pas de définir `frame-ancestors` : la protection contre l’intégration dans un autre site reste à traiter avec des en-têtes d’hébergement.

## Compatibilité et maintenance

Le standalone généré conserve son JavaScript et son CSS intégrés ; `assets/` doit rester à côté. La publication GitHub Pages utilise toujours ce fichier. La lecture locale et la navigation restent disponibles ; l’interdiction préexistante des écritures cloud depuis `file:` et localhost est conservée.

La CSP autorise les connexions HTTPS aux domaines `*.supabase.co` et les polices Google. Une installation avec domaine API personnalisé doit ajouter son origine exacte dans `index.html` et `src/standalone.template.html`. Un script de configuration supplémentaire doit également respecter la CSP : utiliser un script autorisé de même origine ou une empreinte dédiée. Ne pas ajouter `unsafe-inline` à `script-src`.

Modifier `src/`, puis exécuter `npm run build` pour régénérer le standalone et son empreinte CSP. Ne pas éditer le script directement dans `standalone.html`. Les accents sont contrôlés par la suite statique.

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
npm.cmd run build
npm.cmd run audit:frontend
npm.cmd test
```

Le workflow `security-tests.yml` exécute les tests frontend et fonctionnels sur les pushes de `main` et les pull requests. Il reste indépendant du workflow de publication : pour en faire un blocage obligatoire, configurer les règles de branche GitHub ou une dépendance explicite du déploiement.

## Résultats de validation locale

- Build web et standalone : réussi.
- Contrôles statiques, CSP, UTF-8, données, HTTPS et journaux : réussis.
- Tests runtime avec serveur simulé : 10/10.
- Tests de sécurité navigateur sous Edge : 18/18.
- Tests fonctionnels Vite, standalone HTTP, build et fichier local : 16/16.
- Audit npm des dépendances de production : aucune vulnérabilité connue signalée lors de cette exécution.
- Diff du dossier Supabase : vide. Aucun test ni changement en production, aucune publication effectuée.
