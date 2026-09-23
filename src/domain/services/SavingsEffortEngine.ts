import type { Account } from '../models/Account';
import type { Loan } from '../models/Loan';
import type { Movement } from '../models/Movement';
import type { MonthKey } from '../models/Projection';
import type { IncomeSource, SavingsEffortSettings } from '../models/SavingsEffort';
import { percentToBasisPoints, shareOf, sumCents, type Cents } from './FinancialMath';
import { loanSnapshot } from './LoanEngine';
import { addMonths, monthKeyOfDate, monthKeyOfIso, monthRange, toIsoDate } from './Months';

/** Nombre de mois complets pris en compte pour la moyenne des dépenses rattachées aux postes. */
export const BUDGET_PROVISION_LOOKBACK_MONTHS = 12;
/** Fenêtres (en mois) de la synthèse ; la première pilote la couleur de la bannière. */
export const EFFORT_WINDOWS: readonly number[] = [3, 6, 12, 24];
/** Fenêtre utilisée pour proposer un réajustement du taux cible. */
export const RECALIBRATION_WINDOW_MONTHS = 6;

const RAISE_ABOVE_RATIO = 1.2;
const LOWER_BELOW_RATIO = 0.7;

export function totalMonthlyIncome(sources: readonly IncomeSource[]): Cents {
  return sumCents(sources.map((source) => source.monthlyAmount));
}

/** Mensualités (assurance comprise) des seuls prêts encore actifs à la date de référence. */
function activeLoanCommitment(loans: readonly Loan[], referenceDate: Date): Cents {
  const today = toIsoDate(referenceDate);
  return sumCents(
    loans.flatMap((loan) => {
      const snapshot = loanSnapshot(loan, today);
      if (!snapshot?.active) return [];
      return [snapshot.monthlyPayment + (loan.monthlyInsurance ?? 0)];
    }),
  );
}

/**
 * Moyenne mensuelle des retraits rattachés à un poste, tous postes confondus, sur les `lookbackMonths` derniers mois
 * complets (mois en cours exclu, sans remonter avant le premier retrait rattaché). Sert de repère pour les grosses
 * dépenses récurrentes (vacances, travaux…) sans dépendre d'un objectif précis : ce que vous avez réellement dépensé.
 */
export function averageMonthlyBudgetSpending(
  movements: readonly Movement[],
  referenceDate: Date,
  lookbackMonths: number = BUDGET_PROVISION_LOOKBACK_MONTHS,
): Cents {
  const tagged = movements.filter((movement) => movement.type === 'WITHDRAWAL' && movement.budgetId !== undefined);
  if (tagged.length === 0) return 0;

  const currentMonth = monthKeyOfDate(referenceDate);
  const lastCompletedMonth = addMonths(currentMonth, -1);
  const firstMonth = tagged.map((movement) => monthKeyOfIso(movement.date)).reduce((a, b) => (a < b ? a : b));
  const earliestAllowed = addMonths(lastCompletedMonth, -(lookbackMonths - 1));
  const windowStart = firstMonth > earliestAllowed ? firstMonth : earliestAllowed;
  const months = windowStart <= lastCompletedMonth ? monthRange(windowStart, lastCompletedMonth) : [currentMonth];

  const totals = new Map<MonthKey, Cents>(months.map((month) => [month, 0]));
  for (const movement of tagged) {
    const month = monthKeyOfIso(movement.date);
    if (totals.has(month)) totals.set(month, (totals.get(month) ?? 0) + movement.amount);
  }
  return Math.round(sumCents([...totals.values()]) / months.length);
}

export interface SavingsCapacity {
  /** Revenus nets mensuels récurrents saisis. */
  income: Cents;
  /** Mensualités des prêts encore actifs (assurance comprise). */
  loanPayments: Cents;
  /** Moyenne mensuelle des dépenses rattachées à un poste (12 derniers mois). */
  budgetProvisions: Cents;
  /** Revenu moins charges connues, jamais négatif : ce qui reste pour l'épargne libre et le reste à vivre. */
  residual: Cents;
  /** Objectif mensuel d'épargne libre : `residual × targetRatePercent`. */
  target: Cents;
}

/** Capacité d'épargne mensuelle raisonnable, d'après les revenus saisis et les charges déjà connues de l'application. */
export function computeSavingsCapacity(
  settings: SavingsEffortSettings,
  loans: readonly Loan[],
  movements: readonly Movement[],
  referenceDate: Date,
): SavingsCapacity {
  const income = totalMonthlyIncome(settings.incomeSources);
  const loanPayments = activeLoanCommitment(loans, referenceDate);
  const budgetProvisions = averageMonthlyBudgetSpending(movements, referenceDate);
  const residual = Math.max(0, income - loanPayments - budgetProvisions);
  const target = shareOf(residual, percentToBasisPoints(settings.targetRatePercent));
  return { income, loanPayments, budgetProvisions, residual, target };
}

/** Versements nets (versements − retraits) sur les comptes d'épargne, tous comptes confondus, pour un mois donné. */
function netSavingsInMonth(accounts: readonly Account[], movements: readonly Movement[], month: MonthKey): Cents {
  const savingsAccountIds = new Set(accounts.filter((account) => account.type === 'SAVINGS').map((account) => account.id));
  return sumCents(
    movements
      .filter((movement) => savingsAccountIds.has(movement.accountId) && monthKeyOfIso(movement.date) === month)
      .map((movement) => (movement.type === 'DEPOSIT' ? movement.amount : -movement.amount)),
  );
}

export type EffortLevel = 'ok' | 'warning' | 'alert' | 'critical';

export interface EffortWindow {
  /** Largeur de la fenêtre demandée, en mois. */
  months: number;
  /** Mois complets réellement disponibles dans l'historique (peut être inférieur à `months`). */
  availableMonths: number;
  /** Moyenne mensuelle réalisée sur les mois disponibles (0 si aucun). */
  realized: Cents;
  target: Cents;
  /** `realized / target` ; `null` si l'objectif est nul (rien à comparer) ou sans historique. */
  ratio: number | null;
  level: EffortLevel;
}

const LEVEL_BANDS: readonly { level: EffortLevel; minRatio: number }[] = [
  { level: 'ok', minRatio: 1 },
  { level: 'warning', minRatio: 0.85 },
  { level: 'alert', minRatio: 0.6 },
  { level: 'critical', minRatio: Number.NEGATIVE_INFINITY },
];

function levelForRatio(ratio: number | null): EffortLevel {
  if (ratio === null) return 'ok'; // rien à atteindre, ou pas encore d'historique : pas d'alerte
  return LEVEL_BANDS.find((band) => ratio >= band.minRatio)?.level ?? 'critical';
}

/**
 * Effort d'épargne réalisé sur `months` mois, comparé à `target` (objectif mensuel constant sur toute la période :
 * les revenus saisis ne sont pas suivis dans le temps, on applique donc le taux actuel rétroactivement).
 * Ne remonte pas avant le premier mouvement de l'application, pour ne pas diluer la moyenne avec des mois
 * antérieurs au suivi.
 */
export function evaluateEffortWindow(
  months: number,
  accounts: readonly Account[],
  movements: readonly Movement[],
  target: Cents,
  referenceDate: Date,
): EffortWindow {
  if (movements.length === 0) return { months, availableMonths: 0, realized: 0, target, ratio: null, level: 'ok' };

  const currentMonth = monthKeyOfDate(referenceDate);
  const lastCompletedMonth = addMonths(currentMonth, -1);
  const firstMonth = movements.map((movement) => monthKeyOfIso(movement.date)).reduce((a, b) => (a < b ? a : b));
  const earliestAllowed = addMonths(lastCompletedMonth, -(months - 1));
  const windowStart = firstMonth > earliestAllowed ? firstMonth : earliestAllowed;

  if (windowStart > lastCompletedMonth) {
    return { months, availableMonths: 0, realized: 0, target, ratio: null, level: 'ok' };
  }

  const monthsInWindow = monthRange(windowStart, lastCompletedMonth);
  const realized = Math.round(
    sumCents(monthsInWindow.map((month) => netSavingsInMonth(accounts, movements, month))) / monthsInWindow.length,
  );
  const ratio = target > 0 ? realized / target : null;
  return { months, availableMonths: monthsInWindow.length, realized, target, ratio, level: levelForRatio(ratio) };
}

export type RecalibrationDirection = 'raise' | 'lower';

export interface RecalibrationSuggestion {
  direction: RecalibrationDirection;
  currentRatePercent: number;
  suggestedRatePercent: number;
  /** Ratio réalisé / objectif ayant déclenché la suggestion, sur `RECALIBRATION_WINDOW_MONTHS`. */
  averageRatio: number;
}

/** Arrondit au multiple de 5 le plus proche, borné à [0, 100] : un taux plus agréable à lire qu'un nombre à décimales. */
function roundedRatePercent(percent: number): number {
  return Math.min(100, Math.max(0, Math.round(percent / 5) * 5));
}

/**
 * Propose un nouveau taux cible si l'effort réalisé sur `RECALIBRATION_WINDOW_MONTHS` s'écarte durablement de
 * l'objectif (au-dessus ou en dessous). `null` s'il n'y a pas assez d'historique ou si l'écart reste raisonnable.
 * Ne change jamais le réglage lui-même : c'est à l'utilisateur d'accepter la suggestion.
 */
export function suggestRecalibration(
  sixMonthWindow: EffortWindow,
  currentRatePercent: number,
): RecalibrationSuggestion | null {
  if (sixMonthWindow.availableMonths < sixMonthWindow.months || sixMonthWindow.ratio === null) return null;
  const { ratio } = sixMonthWindow;
  if (ratio >= RAISE_ABOVE_RATIO) {
    return { direction: 'raise', currentRatePercent, suggestedRatePercent: roundedRatePercent(currentRatePercent * ratio), averageRatio: ratio };
  }
  if (ratio <= LOWER_BELOW_RATIO) {
    return { direction: 'lower', currentRatePercent, suggestedRatePercent: roundedRatePercent(currentRatePercent * ratio), averageRatio: ratio };
  }
  return null;
}

export interface SavingsEffortData {
  loans: readonly Loan[];
  accounts: readonly Account[];
  movements: readonly Movement[];
}

export interface SavingsEffortReport {
  capacity: SavingsCapacity;
  /** Une entrée par fenêtre de `EFFORT_WINDOWS`, dans le même ordre. */
  windows: EffortWindow[];
  /** Fenêtre la plus courte (`EFFORT_WINDOWS[0]`, 3 mois) : celle qui pilote la couleur de la bannière. */
  current: EffortWindow;
  recalibration: RecalibrationSuggestion | null;
}

/** Calcule la capacité d'épargne et l'évalue sur toutes les fenêtres de suivi, en un seul appel. */
export function evaluateSavingsEffort(
  settings: SavingsEffortSettings,
  data: SavingsEffortData,
  referenceDate: Date,
): SavingsEffortReport {
  const capacity = computeSavingsCapacity(settings, data.loans, data.movements, referenceDate);
  const windows = EFFORT_WINDOWS.map((months) =>
    evaluateEffortWindow(months, data.accounts, data.movements, capacity.target, referenceDate),
  );
  const sixMonthWindow = windows.find((window) => window.months === RECALIBRATION_WINDOW_MONTHS);
  const recalibration = sixMonthWindow ? suggestRecalibration(sixMonthWindow, settings.targetRatePercent) : null;
  return { capacity, windows, current: windows[0], recalibration };
}
