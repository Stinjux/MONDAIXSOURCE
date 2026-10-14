# MONDAIXSOURCE — Phase 1

Dashboard Next.js/TypeScript pour le sourcing Amazon.ca. Sépare les imports **LEADS (A:J)** et **OUT OF STOCK (A:P)**. Détection de doublons entre sources, revue hebdomadaire, objectif de 50 leads uniques par semaine et journal des synchronisations.

## Variables Railway
Copier les noms de `.env.example` dans **Railway → Service → Variables** :

- `DATABASE_URL` : référence au service PostgreSQL Railway
- `ADMIN_PASSWORD` : mot de passe fort pour accès au dashboard et API de revue (jamais exposé en variable `NEXT_PUBLIC_*`)
- `SYNC_SECRET` : secret distinct pour déclencher la synchronisation
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` : JSON du compte de service Google encodé en base64, jamais dans GitHub
- `LEADS_SHEET_ID` et `OOS_SHEET_ID` : identifiants des fichiers Google Sheets
- `LEADS_SHEET_RANGE` (ex. `Sheet1!A:J`) et `OOS_SHEET_RANGE` (ex. `Sheet1!A:P`) : noms exacts des onglets Google Sheets

Partager chaque fichier Google Sheets en **Lecteur** avec l'adresse `client_email` du compte de service et activer Google Sheets API dans Google Cloud.

**Important :** la clé Google n'est pas la même chose que `SYNC_SECRET`. Les secrets restent sur Railway.

## Démarrage
```bash
npm install
npx prisma db push
npm run dev
```
Sur Railway, utiliser PostgreSQL et configurer la commande de déploiement `npx prisma db push && npm run build`. Démarrer avec `npm run start`. Pour une configuration de production, remplacer `db push` par des migrations Prisma versionnées.

## Synchroniser les 2 fichiers
Endpoint **POST /api/sync** avec header `Authorization: Bearer <SYNC_SECRET>` :

```bash
curl -X POST https://YOUR-APP.up.railway.app/api/sync -H "Authorization: Bearer YOUR_SYNC_SECRET"
```

Il faut programmer cet appel depuis un cron Railway ou un ordonnanceur externe. Aucun déclencheur automatique n'est créé dans cette version. `npm run sync` permet également l'import dans une tâche Railway cron avec les mêmes variables d'environnement.

## Revue
Les statuts `PENDING`, `REVIEWED`, `REJECTED`, `FOLLOW_UP` s'éditent dans le dashboard après connexion. La revue du dimanche cible les leads importés pendant la semaine. Le compteur exclut les lignes OUT OF STOCK et les doublons ASIN + fournisseur.

## Limites phase 1
- Le calcul du profit affiché est **préliminaire** (prix Amazon - coût fournisseur - FBA fee), non un profit net.
- La colonne STORE du fichier OUT OF STOCK peut être un simple nom plutôt qu'une URL; elle est alors utilisée comme identifiant fournisseur. Des variations de noms peuvent empêcher de détecter certains doublons inter-sources.
- Les dates de première découverte enregistrées correspondent à la première importation dans le dashboard, sauf si des données historiques sont ajoutées par la suite.
- Un mot de passe administrateur partagé protège l'interface via les routes API ; pour une équipe, migrer vers une authentification utilisateurs avec sessions, limitation des tentatives et HTTPS strict.
- La synchronisation **lit** les Google Sheets, mais ne les modifie pas. Les colonnes de suivi OUT OF STOCK ne sont pas vérifiées automatiquement auprès des fournisseurs dans cette phase.
