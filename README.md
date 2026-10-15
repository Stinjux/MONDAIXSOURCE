# MONDAIX SOURCE

Centre de sourcing **Amazon FBA (Amazon.ca, CAD)** : importe automatiquement les Google Sheets **LEADS** et **OUT OF STOCK**, élimine les doublons, suit l'objectif de **50 nouveaux leads uniques par semaine**, organise la **Weekly Review** du dimanche et surveille les ruptures de stock.

Stack : Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 6 · Google Sheets API · Railway.

---

## Fonctionnement

### Modèle de données

```
Product (ASIN Amazon.ca)                 ← revue hebdomadaire, prix Amazon vérifié, restrictions
  └─ SupplierOffer (ASIN × fournisseur)  ← valeurs importées courantes, stock, coût vérifié
       └─ Occurrence (ligne d'une Sheet) ← valeurs de la ligne, présente / retirée
PriceSnapshot · StockCheck · ChangeLog   ← historiques (prix, vérifications, modifications manuelles)
ImportRun · ImportIssue                  ← journal des synchronisations et lignes invalides
```

- **Rien n'est jamais supprimé automatiquement.** Une ligne retirée d'une Sheet est marquée « retirée » et reste consultable.
- **Valeurs importées ≠ valeurs vérifiées** : les champs saisis pendant la revue (`verified…`) sont séparés et étiquetés « vérifié » / « importé » dans l'interface.
- **Un lead = un ASIN** : tous les fournisseurs trouvés pour cet ASIN lui sont rattachés (ligne dépliable dans All Leads, meilleure offre en tête). L'ASIN ne compte qu'une fois dans l'objectif.
- Une occurrence est identifiée par *(Sheet, offre, rang)* et non par numéro de ligne : **trier ou insérer des lignes dans la Sheet ne réinitialise ni les revues ni les dates.**

### Doublons

| Type | Règle |
|---|---|
| Doublon exact | même ASIN + même fournisseur (URL normalisée, paramètres de suivi retirés), plusieurs lignes |
| Entre les 2 Sheets | même ASIN présent dans LEADS et OUT OF STOCK (la colonne STORE « Walmart » est rattachée à l'URL `walmart.ca/…` du même ASIN) |
| Doublon potentiel | même ASIN chez plusieurs fournisseurs |

Chaque fournisseur, chaque occurrence, la première et la dernière date de découverte sont conservés. Une alerte reste active jusqu'à « Marquer comme examiné » et se réactive si un nouveau doublon apparaît.

### Objectif hebdomadaire

- Semaine du **lundi 00:00 au dimanche 23:59, heure du Québec** (`America/Toronto`, changements d'heure gérés).
- Seul un **nouvel ASIN** apparu dans **LEADS** compte, une seule fois, dans la semaine de sa découverte (colonne G *Export Date* si elle est lisible, sinon date d'import). Une mise à jour, un doublon ou un produit OUT OF STOCK ne compte pas.

### Weekly Review

Statuts : À revoir · En cours · Revu et validé · Rejeté · À suivre. Pour chaque lead : prix Amazon et frais Amazon (Total Fees) vérifiés, coût et disponibilité vérifiés par fournisseur, restrictions Amazon, rentabilité recalculée en direct, doublons, checklist en 6 points, notes. Les leads sans décision des semaines précédentes restent affichés (« En retard »). Chaque modification est journalisée (`ChangeLog`).

### Buy Decisions (aide à l'achat)

Classe les leads selon 5 stratégies : **score d'achat** (40 % ROI plafonné à 100 %, 35 % profit mensuel en échelle logarithmique plafonné à 2 000 $, 25 % marge plafonnée à 40 %), **ROI %**, **profit mensuel**, **marge (profit %)** ou **profit unitaire**. Chaque lead reçoit un verdict selon vos critères (ROI, profit unitaire, marge, ventes mensuelles minimum ; 30 % / 3 $ / 15 % / 10 par défaut) : *Acheter* (tous atteints), *À considérer* (1–2 manqués, rupture ou ASIN restreint), *Éviter* (profit ≤ 0 ou plus de 2 manqués), *Incomplet*. Les valeurs vérifiées en Weekly Review remplacent les valeurs de la Sheet. Le plan d'achat calcule investissement, profit attendu, ROI du panier et budget restant ; critères, budget et quantités sont conservés dans le navigateur.

### OUT OF STOCK

Statut dérivé des colonnes N (Disponibilité), O (Dernière vérification) et P (Détail). **Un produit n'est déclaré « En stock » que si la Sheet l'indique ET qu'une date de vérification valide existe** ; sinon il est « Non vérifié ». Le retour en stock déclenche une alerte. Chaque changement est historisé.

### Rentabilité (préliminaire)

| Indicateur | Formule |
|---|---|
| Profit | Prix Amazon (Buy Box moyenne 90 j, colonne D ; Sale Price si vide) − Cost Price − Total Fees (colonne H : commission Amazon + FBA) |
| ROI | Profit / Cost Price × 100 |
| Marge | Profit / prix Amazon × 100 |
| Profit mensuel | Profit × Estimated Sales |

Les frais Amazon (commission + FBA) sont inclus via Total Fees. **Taxes (TPS/TVQ)** : par défaut *inscrit à 20 %* comme SellerAmp (plus prudent que le taux réel du Québec, 14,975 %, ce qui laisse une marge de sécurité) ; réglables dans Settings, même méthode que SellerAmp — *inscrit* : profit = (vente − coût) ÷ (1 + taux) − frais ; *non inscrit* : profit = vente − coût − frais × (1 + taux) ; taxes arrondies au cent. Exemple SellerAmp vérifié par les tests : vente 20,20 $, coût 8,13 $, frais 9,46 $, taxe 20 % → profit 0,60 $, ROI 7,38 %, marge 2,97 %, coût max 5,24 $. Ce n'est **pas encore un profit net** : transport vers Amazon, préparation et stockage ne sont pas déduits. Aucun calcul n'est fait si une donnée manque ou si le coût n'est pas en CAD (pas de conversion inventée).

---

## Déploiement Railway

### 1. Service web
1. Railway → **New Project → Deploy from GitHub** → ce dépôt, puis **+ New → Database → PostgreSQL**.
2. **Variables** du service web (voir `.env.example`) :
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `ADMIN_PASSWORD`, `SYNC_SECRET` : deux valeurs longues et différentes (`openssl rand -base64 32`)
   - `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` : `base64 -w0 service-account.json` (macOS : `base64 -i service-account.json`)
   - `LEADS_SHEET_ID`, `LEADS_SHEET_RANGE` (ex. `LEADS!A:J`), `OOS_SHEET_ID`, `OOS_SHEET_RANGE` (ex. `'OUT OF STOCK'!A:P` — guillemets simples si le nom de l'onglet contient des espaces)
3. `railway.json` configure tout le reste : build `npm run build`, **pré-déploiement `prisma db push`** (sans `--accept-data-loss` : Prisma refuse toute modification destructive), démarrage `npm run start`, healthcheck `/api/health`.

Google Cloud : activer **Google Sheets API**, créer un compte de service, télécharger sa clé JSON et **partager les deux Sheets en lecture** avec son `client_email`.

### 2. Synchronisation planifiée
Créer un second service depuis le même dépôt, avec les mêmes variables, et dans **Settings → Config-as-code** le fichier `railway/sync-cron.json` (commande `npm run sync:cron`, toutes les 2 h ; modifiable). Alternative : un ordonnanceur externe qui appelle

```bash
curl -X POST https://<app>.up.railway.app/api/sync -H "Authorization: Bearer $SYNC_SECRET"
```

Une seule synchronisation s'exécute à la fois (verrou en base). Le bouton **Synchroniser les Sheets** du dashboard déclenche la même opération côté serveur ; aucun secret n'est envoyé au navigateur.

### 3. Rappel de la Weekly Review (optionnel)
Troisième service cron avec `railway/reminder-cron.json` (`npm run reminder`, dimanche 12:45 UTC ≈ 8 h 45 au Québec). Définir `REMINDER_WEBHOOK_URL` (Slack, Discord ou ntfy) pour recevoir le message. `GET /api/reminder` (Bearer `SYNC_SECRET`) affiche le contenu sans l'envoyer.

### Mise à niveau depuis la première version
Les tables existantes `Lead` et `ImportEvent` sont conservées telles quelles. À la première synchronisation, les anciens leads (statuts de revue et dates de découverte inclus) sont migrés une seule fois vers le nouveau modèle ; la table `Lead` n'est ni modifiée ni supprimée.

---

## Développement

```bash
npm install
cp .env.example .env        # renseigner DATABASE_URL, ADMIN_PASSWORD…
npm run db:push
npm run dev                 # http://localhost:3000
npm run sync                # synchronisation en ligne de commande
```

### Tests

```bash
npm run typecheck
npm test                                                     # tests unitaires
TEST_DATABASE_URL=postgresql://…/mondaix_test npm test       # + tests d'intégration PostgreSQL
```

Couverture : lecture des colonnes A–J / A–P, montants localisés, dates Sheets et semaines au fuseau du Québec (DST inclus), calculs de rentabilité, classification de disponibilité, rapprochement des fournisseurs, doublons, idempotence de la synchronisation, tri de la Sheet, historique des prix, lignes retirées, Sheet vide, échec de lecture, verrou, migration des anciennes données. La CI GitHub Actions exécute typecheck, tests (avec PostgreSQL) et build.

### Routes
| Route | Accès | Rôle |
|---|---|---|
| `POST /api/sync` | Bearer `SYNC_SECRET` ou session | Synchronise LEADS puis OUT OF STOCK |
| `GET/POST /api/reminder` | Bearer `SYNC_SECRET` | Rappel de la Weekly Review |
| `GET /api/data` | Bearer `ADMIN_PASSWORD` ou session | Export JSON |
| `GET /api/health` | public | Santé (base de données) |

### Structure
```
prisma/schema.prisma        modèle de données
src/lib/sync/engine.ts      synchronisation (idempotente, sans suppression)
src/lib/normalize.ts        lecture des lignes Sheets, URL, fournisseurs
src/lib/duplicates.ts       rapprochement d'offres, types de doublons
src/lib/dates.ts            semaines et dates au fuseau du Québec
src/lib/profit.ts           rentabilité préliminaire
src/lib/stock.ts            interprétation de la disponibilité
src/app/(app)/…             pages du dashboard (8 sections)
tests/                      tests unitaires et d'intégration
```

### Évolutions prévues
Le découpage Produit / Offre / Occurrence et les historiques (`PriceSnapshot`, `StockCheck`, `ChangeLog`) servent de base à : nouvelles sources (ajouter un `SheetSource` et son parseur), imports CSV, vérification automatique des prix fournisseurs (`StockCheck.origin`), suivi du ROI et alertes de prix, analyses par fournisseur, autorisations Amazon par ASIN (`Product.restriction`), achats et stocks FBA, rapports hebdomadaires par email (`src/lib/reminder.ts`).

### Limites connues
- Authentification par mot de passe unique (session signée, cookie HttpOnly, limitation des tentatives). Pour une équipe : comptes utilisateurs.
- Le rapprochement « nom de boutique ↔ URL » (OUT OF STOCK) repose sur la marque ; en cas d'ambiguïté (plusieurs URL du même fournisseur), aucune fusion automatique n'est faite.
- Les dates ambiguës (`03/04/2026`) suivent `SHEET_DATE_ORDER` (MDY par défaut).
