import { BUDGET_HORIZONS, type Budget, type BudgetHorizon } from '../models/Budget';
import { MAX_PROJECTION_MONTHS, type MonthKey, type ProjectionPoint } from '../models/Projection';
import type { SafetySettings } from '../models/Safety';
import { percentToBasisPoints, shareOf, sumCents, type Cents } from './FinancialMath';
import { addMonths, monthKeyOfIso, monthsBetween } from './Months';

const FULL_BASIS_POINTS = 10_000;
/** Au-delà, un pourcentage nécessaire n'a plus de sens : on évite d'itérer sur des valeurs démesurées. */
const MAX_REFINED_BASIS_POINTS = 1_000_000_000;

/** Dépenses de l'année déjà rattachées à chaque poste (par identifiant de poste), en centimes. */
export type SpentByBudget = ReadonlyMap<string, Cents>;
const NO_SPENDING: SpentByBudget = new Map();

export interface BudgetShare {
  budget: Budget;
  /** Enveloppe du poste : son pourcentage de la base de répartition (`plan.pool`), en centimes. */
  amount: Cents;
  /** Dépensé sur ce poste cette année. */
  spent: Cents;
  /** Enveloppe moins dépensé : ce qu'il reste à dépenser sur ce poste (négatif s'il est dépassé). */
  remaining: Cents;
}

export interface BudgetPlan {
  /** Patrimoine déblocable, en centimes. */
  available: Cents;
  /** Seuil d'épargne de sécurité (0 s'il n'est pas défini). */
  threshold: Cents;
  /** Dépensable : déblocable moins seuil de sécurité, jamais négatif. */
  spendable: Cents;
  /** Total dépensé cette année sur les postes. */
  spentTotal: Cents;
  /**
   * Base de répartition : dépensable + dépenses déjà rattachées aux postes. Ainsi une dépense sur un poste ne consomme
   * que l'enveloppe de ce poste ; les autres enveloppes ne bougent pas.
   */
  pool: Cents;
  shares: BudgetShare[];
  allocatedPercent: number;
  unallocatedPercent: number;
  allocatedAmount: Cents;
  /** Part non affectée de la base de répartition. */
  unallocatedAmount: Cents;
  /** Vrai si la somme des pourcentages dépasse 100 % (fichier modifié ailleurs). */
  overAllocated: boolean;
}

/** Répartition du dépensable à une échéance donnée (0 = aujourd'hui). */
export interface TimedBudgetPlan extends BudgetPlan {
  months: BudgetHorizon;
}

/** Ce qui peut être dépensé sans entamer la réserve : déblocable moins seuil de sécurité, jamais négatif. */
export function spendableAmount(available: Cents, safety: SafetySettings | undefined): Cents {
  return Math.max(0, available - (safety?.threshold ?? 0));
}

export function totalBasisPoints(budgets: readonly Budget[]): number {
  return budgets.reduce((total, budget) => total + percentToBasisPoints(budget.percent), 0);
}

/** Points de base encore libres, en ignorant éventuellement le poste que l'on modifie. */
export function remainingBasisPoints(budgets: readonly Budget[], excludingId?: string): number {
  const used = totalBasisPoints(budgets.filter((budget) => budget.id !== excludingId));
  return Math.max(0, FULL_BASIS_POINTS - used);
}

/** Pourcentage encore libre (0 à 100), en ignorant éventuellement le poste que l'on modifie. */
export function remainingPercent(budgets: readonly Budget[], excludingId?: string): number {
  return remainingBasisPoints(budgets, excludingId) / 100;
}

/** Montant d'un pourcentage d'une base, arrondi au centime inférieur. */
export function budgetAmount(base: Cents, percent: number): Cents {
  return shareOf(base, percentToBasisPoints(percent));
}

/** Total dépensé sur les postes existants. */
export function totalSpent(budgets: readonly Budget[], spent: SpentByBudget): Cents {
  return sumCents(budgets.map((budget) => spent.get(budget.id) ?? 0));
}

/**
 * Répartit le dépensable entre les postes selon leur pourcentage ; le reste est « non affecté ».
 * Chaque poste reçoit `pourcentage × (dépensable + dépenses déjà rattachées)` ; ce qu'il en a déjà consommé est déduit.
 */
export function planBudgets(
  available: Cents,
  safety: SafetySettings | undefined,
  budgets: readonly Budget[],
  spent: SpentByBudget = NO_SPENDING,
): BudgetPlan {
  const spendable = spendableAmount(available, safety);
  const spentTotal = totalSpent(budgets, spent);
  const pool = spendable + spentTotal;

  const shares = budgets.map((budget): BudgetShare => {
    const amount = budgetAmount(pool, budget.percent);
    const spentHere = spent.get(budget.id) ?? 0;
    return { budget, amount, spent: spentHere, remaining: amount - spentHere };
  });
  const allocatedBasisPoints = totalBasisPoints(budgets);
  const allocatedAmount = sumCents(shares.map((share) => share.amount));

  return {
    available,
    threshold: safety?.threshold ?? 0,
    spendable,
    spentTotal,
    pool,
    shares,
    allocatedPercent: allocatedBasisPoints / 100,
    unallocatedPercent: Math.max(0, FULL_BASIS_POINTS - allocatedBasisPoints) / 100,
    allocatedAmount,
    unallocatedAmount: Math.max(0, pool - allocatedAmount),
    overAllocated: allocatedBasisPoints > FULL_BASIS_POINTS,
  };
}

/**
 * Dépensable à chaque point de la projection du patrimoine (index 0 = aujourd'hui, n = dans n mois).
 * La projection suppose qu'aucune dépense n'est prélevée d'ici là.
 */
export function spendableTimeline(points: readonly ProjectionPoint[], safety: SafetySettings | undefined): Cents[] {
  return points.map((point) => spendableAmount(point.available, safety));
}

/** Répartition du dépensable aujourd'hui, dans 1, 2, 3 et 5 ans. */
export function planBudgetsOverTime(
  points: readonly ProjectionPoint[],
  safety: SafetySettings | undefined,
  budgets: readonly Budget[],
  spent: SpentByBudget = NO_SPENDING,
): TimedBudgetPlan[] {
  return BUDGET_HORIZONS.map((months) => ({ months, ...planBudgets(points[months].available, safety, budgets, spent) }));
}

export interface DeadlinePosition {
  /** Point de la projection utilisé : la fin du mois d'échéance, borné à la plage projetée. */
  index: number;
  /** Le mois d'échéance est déjà passé : on évalue avec les chiffres d'aujourd'hui. */
  overdue: boolean;
  /** L'échéance dépasse la projection (5 ans) : on évalue au dernier point. */
  beyondHorizon: boolean;
}

export function deadlinePosition(
  dateIso: string,
  startMonth: MonthKey,
  maxIndex: number = MAX_PROJECTION_MONTHS,
): DeadlinePosition {
  const months = monthsBetween(startMonth, monthKeyOfIso(dateIso));
  return { index: Math.min(Math.max(months, 0), maxIndex), overdue: months < 0, beyondHorizon: months > maxIndex };
}

/**
 * Plus petite part d'une base, en points de base, dont le montant atteint `target`.
 * `null` si la base est nulle ; peut dépasser 10 000 (100 %) quand même la totalité ne suffit pas.
 */
export function minimumBasisPoints(base: Cents, target: Cents): number | null {
  if (base <= 0) return null;
  let basisPoints = Math.max(0, Math.ceil((target * FULL_BASIS_POINTS) / base));
  if (!Number.isSafeInteger(basisPoints) || basisPoints > MAX_REFINED_BASIS_POINTS) return basisPoints;
  // Corrige les éventuelles erreurs d'arrondi du quotient flottant : on cherche le plus petit `basisPoints` exact.
  while (basisPoints > 0 && shareOf(base, basisPoints - 1) >= target) basisPoints -= 1;
  while (shareOf(base, basisPoints) < target) basisPoints += 1;
  return basisPoints;
}

export interface ObjectiveInput {
  percent: number;
  targetAmount: Cents;
  targetDate: string;
  /** Dépensé sur ce poste cette année : ce n'est plus disponible pour l'objectif. */
  spent?: Cents;
}

export interface ObjectiveOutcome extends DeadlinePosition {
  /** Mois du point évalué (fin de ce mois). */
  month: MonthKey;
  /** Dépensable à l'échéance. */
  spendable: Cents;
  /** Ce que le poste pourrait avoir à l'échéance avec 100 % de la base de répartition, dépenses déduites. */
  maxAvailable: Cents;
  /** Montant encore disponible pour le poste à l'échéance avec son pourcentage actuel. */
  projected: Cents;
  target: Cents;
  /** Le pourcentage actuel suffit à atteindre l'objectif. */
  reached: boolean;
  shortfall: Cents;
  /** Plus petit pourcentage qui atteindrait l'objectif (peut dépasser 100) ; `null` si rien n'est dépensable. */
  requiredPercent: number | null;
  /** Il existe un pourcentage (≤ 100 %) qui atteindrait l'objectif. */
  achievable: boolean;
}

/**
 * Évalue un objectif (montant et échéance) pour un pourcentage donné, d'après le dépensable projeté.
 * `spentTotal` : total dépensé cette année sur tous les postes (il fait partie de la base de répartition).
 */
export function evaluateObjective(
  { percent, targetAmount, targetDate, spent = 0 }: ObjectiveInput,
  timeline: readonly Cents[],
  startMonth: MonthKey,
  spentTotal: Cents = 0,
): ObjectiveOutcome {
  const position = deadlinePosition(targetDate, startMonth, timeline.length - 1);
  const spendable = timeline[position.index];
  const pool = spendable + spentTotal;
  const projected = budgetAmount(pool, percent) - spent;
  const requiredBasisPoints = minimumBasisPoints(pool, targetAmount + spent);

  return {
    ...position,
    month: addMonths(startMonth, position.index),
    spendable,
    maxAvailable: pool - spent,
    projected,
    target: targetAmount,
    reached: projected >= targetAmount,
    shortfall: Math.max(0, targetAmount - projected),
    requiredPercent: requiredBasisPoints === null ? null : requiredBasisPoints / 100,
    achievable: requiredBasisPoints !== null && requiredBasisPoints <= FULL_BASIS_POINTS,
  };
}

export interface ObjectiveEntry {
  budget: Budget;
  outcome: ObjectiveOutcome;
}

/** Évalue l'objectif de chaque poste qui en a un. */
export function evaluateObjectives(
  budgets: readonly Budget[],
  timeline: readonly Cents[],
  startMonth: MonthKey,
  spent: SpentByBudget = NO_SPENDING,
): ObjectiveEntry[] {
  const spentTotal = totalSpent(budgets, spent);
  return budgets.flatMap((budget): ObjectiveEntry[] => {
    if (budget.targetAmount === undefined || budget.targetDate === undefined) return [];
    const outcome = evaluateObjective(
      {
        percent: budget.percent,
        targetAmount: budget.targetAmount,
        targetDate: budget.targetDate,
        spent: spent.get(budget.id) ?? 0,
      },
      timeline,
      startMonth,
      spentTotal,
    );
    return [{ budget, outcome }];
  });
}

export interface ObjectivesSummary {
  count: number;
  /** Objectifs que le pourcentage actuel n'atteint pas à l'échéance. */
  notReached: number;
  /** Objectifs hors d'atteinte même avec 100 % du dépensable. */
  unreachable: number;
  /** Somme des pourcentages nécessaires, chacun évalué à sa propre échéance. */
  totalRequiredPercent: number;
  /** Les pourcentages nécessaires dépassent 100 % au total : les objectifs ne tiennent pas tous ensemble. */
  overCommitted: boolean;
}

export function summarizeObjectives(entries: readonly ObjectiveEntry[]): ObjectivesSummary {
  const required = entries.map((entry) => entry.outcome.requiredPercent);
  const totalBasisPoints = required.reduce<number>(
    (total, percent) => total + (percent === null ? 0 : percentToBasisPoints(percent)),
    0,
  );
  return {
    count: entries.length,
    notReached: entries.filter((entry) => !entry.outcome.reached).length,
    unreachable: entries.filter((entry) => !entry.outcome.achievable).length,
    totalRequiredPercent: totalBasisPoints / 100,
    overCommitted: required.includes(null) || totalBasisPoints > FULL_BASIS_POINTS,
  };
}
