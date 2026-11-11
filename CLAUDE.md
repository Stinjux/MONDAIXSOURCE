# MONDAIX SOURCE — règles pour toute modification

L'application est en production depuis octobre 2026 avec de vraies données (leads, revues,
notes, achats, historique). **Aucune modification future ne doit effacer ni altérer les données
déjà stockées.**

## Base de données

- Schéma : seulement des **ajouts** — nouvelle table, nouvelle colonne facultative (`?`) ou avec
  `@default(...)`, nouvel index. Jamais de suppression ni de renommage de table ou de colonne
  (Prisma traite un renommage comme une suppression), jamais de changement de type, jamais
  rendre obligatoire une colonne existante. Une colonne devenue inutile reste en place.
- Vérifier avant chaque push : `npm run check:schema` (aussi lancé par la CI).
- Jamais `--accept-data-loss`, `prisma migrate reset`, `db push --force-reset`, `TRUNCATE`,
  `DROP` ou `deleteMany` sur des données métier. Seules exceptions existantes : le verrou de
  synchronisation (`AppSetting sync.lock`) et la rotation des sauvegardes quotidiennes.
- Pas de script qui réécrit en masse des lignes existantes. Si une nouvelle donnée doit être
  calculée pour les anciennes lignes, l'ajouter dans une nouvelle colonne, sans toucher aux
  valeurs d'origine, et demander l'accord de l'utilisateur avant.

## Valeurs figées

- `Purchase` / `PurchaseItem` : prix, frais, taxes et profit figés à la confirmation. Ne jamais
  les recalculer ; une annulation se fait avec `cancelledAt`.
- `Purchase.source` : `CART` = panier potentiel (Buy Decisions, page « Panier potentiel »),
  `MANUAL` = achat réel saisi dans COGS. **Seuls les achats `MANUAL` comptent dans les COGS.**
- `Product.goalWeek` et `countsTowardGoal` sont figés à la création (objectif hebdomadaire).
- Valeurs importées (Sheets) et valeurs vérifiées (préfixe `verified`) restent séparées.
- Historique : `ChangeLog` (modifications manuelles), `PriceSnapshot`, `StockCheck`,
  `ImportRun` / `ImportIssue` ne sont jamais modifiés ni supprimés.
- La synchronisation ne supprime rien : une ligne retirée d'une Sheet passe à `present = false`.

## Documents (COGS)

- `ProductDocument` : jamais supprimé, un document retiré est archivé (`archivedAt`).
- `DocumentBlob` : contenu des fichiers, une copie par empreinte SHA-256, jamais modifié ni supprimé.
  Exclu des sauvegardes répétées (trop volumineux) : copie à part par l'export zip (COGS).
- Formats acceptés reconnus par leur contenu (PDF, JPEG, PNG, WebP, GIF, HEIC/HEIF), 20 Mo au plus.

## Sauvegardes

- `npm run deploy:prepare` (pré-déploiement Railway) applique le schéma puis crée une
  sauvegarde complète (`DataBackup`, raison DEPLOY). Si la sauvegarde échoue, le déploiement
  échoue : ne pas contourner.
- La tâche planifiée (`npm run sync:cron`) fait une sauvegarde par jour.
- Une nouvelle table est sauvegardée automatiquement (liste lue dans la base).
- Restauration uniquement dans une base vide : `npm run restore -- fichier.json.gz`.

## Secrets

- Jamais de clé API en dur : variables Railway uniquement, jamais dans GitHub ni le navigateur.
- Ne jamais afficher le contenu d'une clé (compte de service Google, etc.).

## Vérifications avant de pousser

`npm run check:schema`, `npm run typecheck`, `npm test` (avec `TEST_DATABASE_URL` pour les
tests d'intégration, base dont le nom contient « test »), `npm run build`.
