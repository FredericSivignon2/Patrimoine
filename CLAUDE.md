# CLAUDE.md — Directives & Architecture du Projet Patrimoine

## 1. Vision et Architecture Globale
Application web monopage (SPA) autonome, orientée mobile-first et desktop, pour le suivi patrimonial, la projection d'épargne et, surtout, **savoir ce qu'il est raisonnable de dépenser** (par poste : vacances, travaux, future voiture…), en tenant compte des prêts en cours.
- **Principe produit — vision synthétique, pas un budget détaillé :** le site ne doit **pas** devenir un outil où l'on saisit chaque dépense courante (nourriture, factures…). Les mensualités de prêts viennent des échéanciers ; un retrait n'est rattaché à un poste que s'il compte (voyage, travaux, achat). Ne pas ajouter de catégories par dépense, de saisies récurrentes ni de rapprochement bancaire tant qu'aucune connexion à une API bancaire n'est décidée.
- **Topologie :** Client statique (déployé sur GitHub Pages ou hébergeur statique HTTPS gratuit) + Base de données déportée sur Google Drive.
- **Confidentialité :** Aucune donnée financière ne transite par un serveur applicatif. L'application s'exécute côté client et lit/écrit directement sur le Google Drive de l'utilisateur via l'API Google Drive v3.
- **Multi-utilisateur / Partage :** Le fichier de données JSON est partageable via Google Drive (ex. : accès partagé pour le couple).
- **Langue :** interface, messages d'erreur et échanges avec l'utilisateur en français.

---

## 2. État actuel (résumé)

**Livré et testé** (`npm run test` : 636 tests, 19 fichiers) :
- **Comptes et mouvements :** courants et épargne, versements/retraits, solde courant, épargne mensuelle constatée, projections à 1, 2, 3 et 5 ans (intérêts composés). Sur un compte courant on ne saisit que le solde du mois, pas chaque dépense.
- **Prêts en cours** (page `/prets`) : immobilier, rénovation (dont éco-PTZ à 0 %), consommation, autre ; échéancier calculé, capital restant dû, mensualités (assurance comprise), intérêts restants, dates de fin, évolution à 1, 2, 3 et 5 ans, calcul d'une mensualité depuis une durée ; carte sur le tableau de bord.
- **Remboursements anticipés** (partiels, prévus ou déjà faits ; dans le formulaire du prêt) : montant, date et effet (réduire la durée ou la mensualité) ; le formulaire compare avec et sans, la carte du prêt indique échéances et intérêts économisés.
- **Retraits rattachés à un poste** (facultatif, retraits seulement) : la dépense consomme l'enveloppe de son poste ; filtre par poste ou « retraits sans poste » sur la page Mouvements.
- **« Où passe l'argent »** (page `/postes`, par année) : retraits par poste, retraits sans poste, mensualités de prêts d'après les échéanciers.
- **Fonds bloqués (épargne) :** tranches saisies (montant + date de déblocage) et option « chaque versement est bloqué N ans » (ex. PEE 5 ans) ; patrimoine *déblocable* vs *bloqué* ; calendrier des prochains déblocages.
- **Épargne de sécurité :** seuil comparé au déblocable ; la bannière du tableau de bord passe du vert foncé au jaune, à l'orange puis au rouge.
- **Postes de dépense :** chaque poste = un % du **dépensable** (déblocable − seuil de sécurité) ; page `/postes`, sélecteur d'échéance (aujourd'hui, 1, 2, 3, 5 ans), carte de synthèse sur le tableau de bord.
- **Objectifs par poste :** montant visé + échéance ; atteint / il manque X / hors d'atteinte, pourcentage minimal nécessaire, alerte si les besoins cumulés dépassent 100 %.
- **Simulateur « Et si je dépense… ? »** (tableau de bord) : effet d'une dépense (montant, délai, poste facultatif) sur le déblocable, la marge de sécurité et le budget du poste.
- **Banques :** liste libre (`banks`, gérée depuis la page Comptes, avec 7 suggestions en un clic), rattachée à un compte ou un prêt (facultatif) ; badge d'initiales colorées devant le nom dans les listes (pas de vrai logo de marque, pour éviter toute question de droit d'usage et rester autonome hors-ligne).
- **Tranche bloquée « disponible à la retraite » :** alternative à une date de déblocage quand elle n'est pas connue (ex. une part de PEE débloquée au départ en retraite) ; toujours comptée comme bloquée, absente du calendrier des prochains déblocages.
- **Biens immobiliers loués** (page Comptes) : bien non entièrement remboursé, rattaché à un prêt existant (facultatif) ; sa valeur nette de revente (valeur estimée − capital restant dû du prêt − frais de vente estimés) est un **coussin de sécurité à part**, affiché sous la bannière du tableau de bord — jamais dans le déblocable, le dépensable ni le niveau de l'épargne de sécurité, car non déblocable rapidement.
- **Effort d'épargne** (page `/effort`, 6ᵉ onglet) : revenus nets mensuels récurrents saisis une fois (jamais ventilés ailleurs), taux d'épargne cible (%) appliqué à ce qui reste après mensualités de prêts et moyenne des dépenses de postes ; l'épargne réalisée est déduite des versements déjà enregistrés sur les comptes d'épargne (rien à ressaisir chaque mois). Synthèse sur 3 mois, 6 mois, 1 an et 2 ans avec un statut coloré par fenêtre ; ligne dédiée sous la bannière du tableau de bord (couleur + phrase, lissée sur les 3 derniers mois complets) ; suggestion de réajustement du taux au bout de 6 mois d'écart durable, jamais appliquée sans confirmation.
- **Données de démonstration** (bouton sur un tableau de bord vide) : 4 comptes dont un PEE (avec une tranche « retraite »), 5 banques, 3 postes, 2 objectifs, 2 retraits rattachés, 5 prêts (3 immobiliers, un éco-PTZ à 0 % et un prêt conso, chacun avec un remboursement anticipé prévu), 1 bien loué rattaché à un prêt, un seuil de sécurité.
- **Stockage local** (`localStorage`) et **synchronisation Google Drive** avec détection de conflit (voir §6).
- **Déploiement GitHub Pages** (`.github/workflows/deploy.yml`) : build + tests puis publication automatique sur push vers `main` ; identifiants Google fournis via des variables de dépôt GitHub (Settings → Secrets and variables → Actions → Variables), pas des secrets, car ils finissent dans le JavaScript public.

**Non fait / à valider :**
- Le code Google (GIS, Picker, API Drive) a été essayé avec de vrais identifiants (connexion, création de fichier, partage) mais reste peu couvert par des tests automatisés (seulement contre un faux client, `src/test/FakeDriveClient.ts`).
- Bundle JS ~600 Ko (~190 Ko gzip) : pas de découpage de code.
- Les prêts ne modifient ni les soldes ni les projections d'épargne (ils sont un module à part) : un remboursement anticipé n'est **pas** déduit des comptes, il faut saisir le retrait correspondant (et il n'est pas compté dans les mensualités de « Où passe l'argent »). Un bien immobilier n'a pas de valeur suivie en dehors du coussin de sécurité (pas de « patrimoine net des crédits », qui resterait trompeur sans une estimation fiable de tous les biens). Idée possible : taux variable.

**Simplifications assumées :** les intérêts d'un compte sont comptés comme disponibles même sur des fonds bloqués ; les projections supposent qu'aucune dépense n'est prélevée et ignorent l'inflation ; l'épargne projetée repose sur la moyenne constatée ; les dépenses rattachées à un poste ne sont comptées que sur l'année civile en cours (l'enveloppe repart à zéro chaque 1er janvier) ; un virement entre comptes saisi comme retrait apparaît comme « retrait sans poste » ; l'effort d'épargne applique le taux cible et les revenus **actuels** rétroactivement sur tout l'historique affiché (3 mois à 2 ans), faute de suivre l'évolution des revenus dans le temps.

---

## 3. Stack Technique
- **Framework :** React 19 (Hooks, Context, aucun store lourd type Redux).
- **Langage :** TypeScript 7 (`strict: true`, interdiction absolue du type `any` — vérifiée par `grep`, il n'y a pas de linter). TS 7 n'inclut plus les `@types/*` automatiquement : `tsconfig.json` déclare `"types": ["google.accounts", "google.picker"]`.
- **Outillage :** Vite 8 (`base: './'`, plugins `@vitejs/plugin-react` et `@tailwindcss/vite`), config Vitest dans `vite.config.ts`.
- **Routage :** React Router 7 en `HashRouter` (routes : `/`, `/postes`, `/prets`, `/comptes`, `/mouvements`, `/effort` ; barre mobile à six onglets, « Accueil » pour le tableau de bord et « Effort » pour l'effort d'épargne).
- **Visualisation graphique :** Chart.js 4 + `react-chartjs-2` (`maintainAspectRatio: false`, hauteur fixée par le conteneur).
- **CSS / UI :** Tailwind CSS 4 (`@import 'tailwindcss'` dans `src/index.css`) ; classes toujours écrites en toutes lettres (pas de concaténation dynamique).
- **Tests :** Vitest 5 + jsdom + React Testing Library + user-event + jest-dom.
- **Google :** GIS et Picker chargés dynamiquement (`loadScript`), types `@types/google.accounts` / `@types/google.picker` + `gapi.d.ts` local.

---

## 4. Découpage Modulaire (Clean Architecture allégée)

```text
src/
├── domain/                  # Logique métier pure (aucune dépendance React/navigateur)
│   ├── models/              # Account, Bank, Movement, Budget, Loan, Property, SavingsEffort, Safety, Projection,
│   │                        # PatrimoineData, errors
│   ├── repositories/        # IAccountRepository, IMovementRepository, IBudgetRepository, ILoanRepository,
│   │                        # IBankRepository, IPropertyRepository, ISettingsRepository
│   └── services/            # FinancialMath, Months, Validation, ids, DemoData
│                            # ProjectionEngine, LockEngine, SafetyEngine, BudgetEngine, LoanEngine, PropertyEngine,
│                            # SavingsEffortEngine, SpendingSimulator, SpendingReport
├── infrastructure/
│   ├── gdrive/              # GDriveClient (GIS + Drive v3 + Picker), DriveSyncService, IDriveClient, errors, loadScript
│   ├── storage/             # PatrimoineStore, IStorageDriver, LocalStorageDriver, MockStorageDriver,
│   │                        # DriveStorageDriver, parsePatrimoineData (validation des JSON lus)
│   └── repositories/        # Account/Movement/Budget/Loan/Bank/Property/SettingsRepository (sur PatrimoineStore)
├── context/                 # AuthContext (session Google), FinancialContext (composition racine)
├── hooks/                   # useAccounts, useMovements, useProjections, useBudgets, useLoans, useBanks, useProperties,
│                            # useSafety, useSavingsEffort, useDriveSync
├── components/
│   ├── common/              # Button, Card, Modal, EmptyState, PageHeader, fields, format, icons, bankBadge, palette
│   ├── layout/              # AppLayout (nav haute desktop / basse mobile), SyncStatusChip, SyncDialog
│   ├── charts/              # ProjectionChart, AllocationChart, MonthlySavingsChart, LoansChart, chartSetup
│   ├── accounts/, movements/, budgets/, loans/, banks/, properties/, savingsEffort/, dashboard/   # formulaires et
│   │                        # cartes par domaine
└── pages/                   # DashboardPage, BudgetsPage (/postes), LoansPage (/prets), AccountsPage, MovementsPage,
                             # SavingsEffortPage (/effort)
```
Les tests sont à côté du code (`*.test.ts(x)`) ; `src/test/` contient `setup.ts` et `FakeDriveClient.ts`. `App.test.tsx` est le test d'intégration de l'application.

---

## 5. Règles Métier & Modèle de Données

### 5.1 Fichier de données (`patrimoine_data.json` et cache local)
`PatrimoineData = { version, accounts[], movements[], budgets[], loans[], banks[], properties[], safety?, savingsEffort? }`, `DATA_VERSION = 8`.
- **Politique de version :** tout nouveau champ qu'un ancien client ne saurait pas conserver **incrémente `DATA_VERSION`**. Les versions précédentes restent lisibles (champs absents = valeurs par défaut) ; un client plus ancien **refuse** un fichier plus récent au lieu d'en effacer silencieusement les champs. Historique : v2 fonds bloqués + épargne de sécurité, v3 postes, v4 objectifs, v5 prêts + rattachement d'un retrait à un poste, v6 remboursements anticipés d'un prêt, v7 banques + tranche « disponible à la retraite » + biens immobiliers loués, v8 effort d'épargne mensuel.
- Toute lecture (Drive, `localStorage`) passe par `parsePatrimoineData` (validation stricte, types `unknown`). Un cache local illisible est copié sous `patrimoine_data.corrompu.<horodatage>` avant d'être écrasé.
- Les fixtures de test utilisent la constante `DATA_VERSION`, jamais un littéral.

### 5.2 Entités
* **`Account` :** `id` (UUID), `name`, `type` (`'CHECKING'` | `'SAVINGS'`), `initialBalance` (centimes), `interestRate?` (% annuel, épargne), `lockedTranches?` (`{ amount, unlockDate?, unlockAtRetirement? }[]`, épargne, triées par date ; exactement l'un de `unlockDate`/`unlockAtRetirement` est renseigné — absence de date connue = déblocage à la retraite, toujours compté comme bloqué), `depositLockYears?` (1 à 50, épargne), `bankId?`. Taux et blocages sont supprimés d'un compte courant.
* **`Movement` :** `id`, `accountId`, `type` (`'DEPOSIT'` | `'WITHDRAWAL'`), `amount` (centimes > 0), `date` (`YYYY-MM-DD`), `note?`, `budgetId?` (poste de dépense, **retraits uniquement**).
* **`Budget` (poste) :** `id`, `name`, `percent` (0 à 100, 2 décimales max), `targetAmount?` (centimes) et `targetDate?` (`YYYY-MM-DD`), toujours ensemble.
* **`Loan` (prêt) :** `id`, `name`, `kind` (`'MORTGAGE'` | `'RENOVATION'` | `'CONSUMER'` | `'OTHER'`), `principal` (capital restant dû juste avant `firstPaymentDate`, centimes > 0), `annualRate` (% nominal, 0 pour un prêt à taux zéro), `monthlyPayment` (hors assurance, centimes), `monthlyInsurance?`, `firstPaymentDate` (`YYYY-MM-DD` ; les échéances déjà passées sont considérées payées, une date future représente un différé). Pour un prêt entamé, saisir le capital du dernier relevé et la prochaine échéance. `prepayments?` : `{ date, amount, effect }[]` triés par date, `effect` = `'DURATION'` (réduire la durée) | `'PAYMENT'` (réduire la mensualité) ; à ne saisir que s'ils ne sont pas déjà déduits du capital restant dû. `bankId?`.
* **`Bank` :** `id`, `name` (unique, insensible à la casse). Pas de logo : un badge d'initiales à couleur déterministe (`components/common/bankBadge.tsx`) évite d'avoir à héberger des images de marques tierces. `BANK_SUGGESTIONS` (7 noms) alimente des puces d'ajout rapide, jamais écrites dans le fichier tant qu'elles ne sont pas choisies.
* **`Property` (bien immobilier loué) :** `id`, `name`, `estimatedValue` (valeur de revente estimée, centimes > 0), `sellingFeePercent` (0 à 100, 2 décimales max), `loanId?` (prêt existant dont le capital restant dû est déduit ; un prêt ne finance qu'un seul bien). Ne suit **que** ce qui sert le coussin de sécurité : pas de valeur d'achat, pas de charges, pas d'historique.
* **`SafetySettings` :** `threshold` (centimes), `comfortMargin` (centimes, 5 000 € par défaut). Absent tant qu'aucun seuil n'est défini.
* **`SavingsEffortSettings` :** `incomeSources` (`{ name, monthlyAmount }[]`, centimes > 0, jamais ventilés ailleurs dans les données), `targetRatePercent` (0 à 100, 2 décimales max). Absent tant que la page `/effort` n'a pas été configurée.

### 5.3 Conventions numériques
- Montants **en centimes entiers** partout (stockage, calculs, validation). Saisie via `parseAmountToCents` (jamais de multiplication de flottants) ; la division par 100 n'existe que pour l'affichage (`components/common/format.ts`).
- Pourcentages convertis en **points de base** entiers (`percentToBasisPoints`, 1 % = 100). Une part de montant est **arrondie au centime inférieur** (`shareOf`) : la somme des parts ne dépasse jamais le total, le reliquat va au « non affecté ». Un pourcentage nécessaire est arrondi au point de base **supérieur**.
- Dates ISO `YYYY-MM-DD` et mois `YYYY-MM`, sans conversion de fuseau (`Months.ts`).

### 5.4 Moteurs (`domain/services`), tous couverts par des tests unitaires
* **`ProjectionEngine` :**
  - Solde courant = solde initial + versements − retraits.
  - Épargne mensuelle constatée = moyenne des versements nets des 12 derniers mois **complets** (mois en cours exclu, sans remonter avant le premier mouvement, mois vides = 0 ; à défaut de mois complet, le mois en cours).
  - Projection de 61 points (0 = aujourd'hui, jusqu'à 60 mois), horizons 12/24/36/60 : intérêts composés chaque mois (taux/12 sur le solde d'ouverture, arrondis au centime, aucun sur un solde ≤ 0), versement net moyen ajouté en fin de mois. Chaque point porte `balance`, `locked` et `available`.
* **`LockEngine` :** lots bloqués = tranches saisies + un lot par versement si `depositLockYears` ; bloqué = somme des lots non débloqués à la date, plafonnée au solde ; les versements futurs projetés d'un compte à versements bloqués sont eux aussi bloqués. Le point 0 est évalué à la date du jour, les suivants en fin de mois. Un lot sans date (`unlockDate` absente, tranche « retraite ») est **toujours** compté comme bloqué et n'apparaît jamais dans `unlockSchedule` (aucune date connue à afficher).
* **`SafetyEngine` :** marge = déblocable − seuil. Vert si marge > marge de confort ; jaune si ≤ marge de confort ; orange si ≤ 1 000 € (bande plafonnée à la marge de confort, seuil compris) ; rouge si marge < 0.
* **`BudgetEngine` :** dépensable = `max(0, déblocable − seuil)` (sans seuil défini : tout le déblocable). Parts statiques : somme des % ≤ 100 (imposée par le dépôt, tolérée mais signalée à la lecture). Répartition aujourd'hui et à 1, 2, 3, 5 ans d'après la projection.
  - **Enveloppes :** base de répartition (`pool`) = dépensable + dépenses de l'année civile déjà rattachées aux postes ; enveloppe d'un poste = son % de la base ; `remaining` = enveloppe − dépensé (négatif si dépassé). Une dépense sur un poste ne consomme donc que **son** enveloppe (les autres ne bougent pas) ; restes + non affecté = dépensable réel. Les retraits sans poste réduisent le dépensable et donc toutes les enveloppes proportionnellement.
  - **Objectif :** évalué à la **fin du mois d'échéance** (borné à la plage projetée, indicateurs `overdue` / `beyondHorizon`) sur le reste disponible du poste ; pourcentage minimal nécessaire ; la somme des pourcentages nécessaires (chacun à son échéance) > 100 % signale des objectifs incompatibles.
* **`LoanEngine` :** échéancier à mensualités constantes (jour du mois conservé, ramené en fin de mois si besoin) ; intérêts du mois = capital restant dû × taux / 12 (`monthlyInterest`, entiers) ; la dernière échéance solde le prêt. **Remboursement anticipé :** imputé à la première échéance dont la date est ≥ la sienne, *après* le paiement de cette échéance (les intérêts de la période portent sur l'ancien capital), plafonné au capital restant dû ; `DURATION` garde la mensualité (le prêt finit plus tôt), `PAYMENT` recalcule la mensualité (`paymentForTerm`) pour conserver le nombre d'échéances restantes ; un remboursement postérieur à la fin du prêt est sans effet et signalé (`ignoredPrepayments`). `measurePrepayments` chiffre l'écart avec le même prêt sans remboursement (intérêts et échéances économisés, mensualité réduite). Échéancier **incomplet** si la mensualité ne couvre pas les intérêts ou si la durée dépasse 50 ans : refusé à l'écriture (`validateLoan`) et à la lecture (`parseLoan`). Situation à une date (`loanSnapshot`), projection mois par mois du capital restant dû et des mensualités (`projectLoans`, assurance comprise), fins de prêt à venir, `paymentForTerm` (plus petite mensualité qui rembourse en N échéances, par dichotomie sur le même échéancier). Les mensualités ne sont **jamais** des mouvements.
* **`PropertyEngine` :** coussin net d'un bien = valeur estimée − capital restant dû (à aujourd'hui) du prêt rattaché (0 si aucun, introuvable ou échéancier invalide) − frais de vente (% de la valeur estimée), plancher à 0. `totalPropertyCushion` somme tous les biens ; recalculé automatiquement au fil de l'amortissement du prêt. N'entre dans **aucun** autre calcul (déblocable, dépensable, niveau de sécurité) : uniquement une ligne d'info sous la bannière.
* **`SavingsEffortEngine` :** capacité résiduelle mensuelle = revenus saisis − mensualités des prêts encore actifs (`loanSnapshot`) − moyenne mensuelle (12 mois complets) des retraits rattachés à un poste, tous postes confondus ; objectif = capacité résiduelle × taux cible. Le réalisé (`evaluateEffortWindow`) est déduit des versements nets déjà enregistrés sur les comptes d'épargne (aucune saisie récurrente) sur 4 fenêtres (`EFFORT_WINDOWS` : 3, 6, 12, 24 mois), sans jamais remonter avant le premier mouvement de l'application ; chaque fenêtre porte un niveau (`ok`/`warning`/`alert`/`critical`, mêmes seuils d'esprit que `SafetyEngine`). `suggestRecalibration` propose un nouveau taux (arrondi au multiple de 5) si la fenêtre de 6 mois s'écarte durablement (≥ 120 % ou ≤ 70 %) de l'objectif ; ne modifie jamais le réglage sans confirmation explicite. Simplification assumée : le taux cible actuel est appliqué rétroactivement sur tout l'historique affiché (les revenus passés ne sont pas suivis dans le temps).
* **`SpendingReport` :** dépenses par poste et retraits sans poste pour une année civile, plus les mensualités de prêts de l'année d'après les échéanciers ; `spentByBudget` alimente les enveloppes.
* **`SpendingSimulator` :** verdict `unsafe` (déblocable après dépense < seuil, ou < 0 sans seuil) > `over-budget` (dépasse ce qu'il reste au poste choisi) > `tight` (bannière jaune/orange après) > `reasonable`.

### 5.5 Dépôts et validation
Les repositories valident (`Validation.ts`) et modifient le `PatrimoineStore` de façon synchrone (aucun état changé si une erreur est levée), puis persistent en local. La suppression d'un compte supprime ses mouvements ; la suppression d'un poste **détache** ses retraits (ils restent, sans poste) ; la suppression d'une banque détache les comptes et prêts qui l'utilisaient ; la suppression d'un prêt détache le bien immobilier qui lui était rattaché (le bien reste, sans prêt) ; les postes, prêts, banques et biens ne dépendent d'aucun compte. Un rattachement à un poste n'est valide que sur un retrait et vers un poste existant ; un `bankId` doit désigner une banque existante ; un `loanId` de bien doit désigner un prêt existant et non déjà rattaché à un autre bien.

---

## 6. Synchronisation et Données sur Google Drive

1. **Fichier cible :** `patrimoine_data.json`.
2. **Authentification :** Google Identity Services (`google.accounts.oauth2.initTokenClient`), scope minimal `https://www.googleapis.com/auth/drive.file`. Jeton conservé **en mémoire seulement** ; à expiration ou 401 (`AuthExpiredError`) l'état passe à « reconnexion nécessaire ». Le script GIS est préchargé pour que la fenêtre de connexion s'ouvre depuis un geste utilisateur.
3. **Fichier partagé :** recherche de `patrimoine_data.json`, création (à partir des données locales, ou vierge si rien n'est saisi) ou choix d'un fichier via le **Picker** (nécessite `VITE_GOOGLE_API_KEY` ; `setAppId` = préfixe numérique du client ID, requis avec `drive.file`).
4. **Local d'abord :** l'UI lit et écrit toujours dans `PatrimoineStore` (+ `LocalStorageDriver`). `DriveSyncService` pousse les modifications vers Drive après ~1,5 s ; le lien au fichier (`patrimoine_drive_binding` : `fileId`, somme de contrôle, modifications en attente) survit au rechargement.
5. **Conflits :** somme de contrôle MD5 lue **avant** le contenu (une modification concurrente provoque un faux conflit, jamais une perte). `DriveStorageDriver.save` refuse d'écraser un fichier modifié ailleurs (`ConflictError`) ; l'utilisateur choisit alors la version Drive ou la sienne. Jamais d'écrasement silencieux.
6. **États de synchronisation :** `unavailable` (pas d'identifiant client) · `unbound` · `auth-required` · `idle` · `syncing` · `conflict` · `error`.
7. **Mode local :** sans `VITE_GOOGLE_CLIENT_ID`, l'application fonctionne entièrement en local (`LocalStorageDriver` ; `MockStorageDriver` pour les tests).

---

## 7. Variables d'Environnement
Copier `.env.example` en `.env.local` (ignoré par git) avec les identifiants de l'application Google Cloud :
```text
VITE_GOOGLE_CLIENT_ID=votre_client_id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=votre_api_key
```
Les deux sont facultatives : sans elles, mode local uniquement (l'API key ne sert qu'au Picker).

---

## 8. Règles d'Exécution pour Claude Code

* **Indépendance de la couche données :** l'UI ne sait jamais si la donnée vient du Drive ou du `localStorage`. Tout passe par les repositories (lecture via `FinancialContext`, écriture via les hooks).
* **Arithmétique financière :** entiers (centimes, points de base), jamais de flottants pour un montant ; voir §5.3.
* **Mobile First :** cibles tactiles ≥ 44 px, modales en feuille basse sur mobile, graphiques à hauteur fixe. Toujours `grid-cols-1` (pas de colonne implicite `auto`) autour de contenus larges comme un canvas : sinon la grille déborde de l'écran. Contrôler à 375 px de large.
* **Français partout** dans l'UI ; pas de `any`, pas de `@ts-ignore`.
* **Rester synthétique :** avant d'ajouter une saisie, se demander si elle oblige à entrer des dépenses courantes ; si oui, calculer plutôt que saisir (ex. mensualités d'après l'échéancier).
* **Tout changement de règle métier** commence par le domaine + ses tests, puis parse/repository, contexte/hooks, UI, tests d'interface, et enfin **vérification dans le navigateur** (mobile 375 px et desktop, console sans erreur après un rechargement propre).
* **Format de fichier :** appliquer la politique de version du §5.1 ; ajouter les cas de parsing (accepté, migré, rejeté).
* **Tests :**
  - Les graphiques sont mockés dans les tests d'interface (`vi.mock('react-chartjs-2', …)`) : jsdom n'a pas de `<canvas>`.
  - `Intl` produit des espaces insécables : comparer les montants avec les helpers de `App.test.tsx` (`euros`, `exactEuros`), et ancrer les montants (« 0,00 € » se retrouve dans « 10 000,00 € »).
  - Piège : un paramètre par défaut se déclenche aussi quand on passe `undefined` ; pour un jeu de test « sans seuil », utiliser `null` comme sentinelle.
  - Les modales sont des `div role="dialog"` (pas `<dialog>`, que jsdom ne gère pas).
* **Rechargement à chaud (Vite) :** des erreurs « ordre des hooks » ou « useFinancial doit être utilisé… » juste après l'édition d'un contexte ou d'un hook sont des artefacts ; recharger la page avant de conclure à un bug.
* **Aperçu :** `.claude/launch.json` déclare la configuration `dev` (port 5173).

---

## 9. Commandes Utiles
- `npm run dev` : serveur Vite local (http://localhost:5173).
- `npm run test` : tests Vitest (une passe) ; `npm run test:watch` en continu.
- `npm run typecheck` : `tsc --noEmit`.
- `npm run build` : typecheck puis build statique de production (`dist/`) ; `npm run preview` pour le servir.
