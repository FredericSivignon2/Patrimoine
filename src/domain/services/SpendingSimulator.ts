import type { Budget } from '../models/Budget';
import type { MonthKey, ProjectionPoint } from '../models/Projection';
import type { SafetySettings, SafetyStatus } from '../models/Safety';
import { budgetAmount, spendableAmount, totalSpent, type SpentByBudget } from './BudgetEngine';
import type { Cents } from './FinancialMath';
import { evaluateSafety } from './SafetyEngine';

/** Délais proposés (en mois) : 0 = aujourd'hui. */
export const SIMULATION_DELAYS = [0, 3, 6, 12, 24, 36, 60] as const;

/**
 * unsafe : la dépense fait passer le déblocable sous le seuil de sécurité (ou sous zéro sans seuil) ;
 * over-budget : elle dépasse ce qu'il reste au poste choisi ;
 * tight : elle passe, mais la marge de sécurité devient jaune ou orange ;
 * reasonable : sinon.
 */
export type SpendVerdict = 'reasonable' | 'tight' | 'over-budget' | 'unsafe';

export interface SpendSimulationInput {
  amount: Cents;
  /** Dans combien de mois la dépense a lieu (0 = aujourd'hui), borné à la projection. */
  monthIndex: number;
  budgetId?: string;
}

export interface SpendSimulation {
  monthIndex: number;
  month: MonthKey;
  amount: Cents;
  availableBefore: Cents;
  availableAfter: Cents;
  spendableBefore: Cents;
  spendableAfter: Cents;
  threshold: Cents;
  /** Niveau d'alerte après la dépense ; absent tant qu'aucun seuil de sécurité n'est défini. */
  safety?: SafetyStatus;
  /** Poste choisi : ce qu'il reste à dépenser à cette date avant et après la dépense (négatif si dépassé). */
  budget?: { id: string; name: string; before: Cents; after: Cents; exceeds: boolean };
  verdict: SpendVerdict;
}

/**
 * Simule une dépense sur la projection du patrimoine : que devient le déblocable, la marge de sécurité et,
 * si un poste est choisi, ce qu'il lui reste ? La projection suppose qu'aucune autre dépense n'est prélevée d'ici là ;
 * `spent` : dépenses de l'année déjà rattachées aux postes (déduites de l'enveloppe du poste).
 */
export function simulateSpending(
  { amount, monthIndex, budgetId }: SpendSimulationInput,
  points: readonly ProjectionPoint[],
  safety: SafetySettings | undefined,
  budgets: readonly Budget[],
  spent: SpentByBudget = new Map(),
): SpendSimulation {
  const index = Math.min(Math.max(Math.trunc(monthIndex), 0), points.length - 1);
  const point = points[index];
  const threshold = safety?.threshold ?? 0;

  const availableBefore = point.available;
  const availableAfter = availableBefore - amount;
  const spendableBefore = spendableAmount(availableBefore, safety);
  const status = safety ? evaluateSafety(availableAfter, safety) : undefined;

  const chosen = budgetId === undefined ? undefined : budgets.find((candidate) => candidate.id === budgetId);
  let budget: SpendSimulation['budget'];
  if (chosen) {
    const pool = spendableBefore + totalSpent(budgets, spent);
    const before = budgetAmount(pool, chosen.percent) - (spent.get(chosen.id) ?? 0);
    budget = { id: chosen.id, name: chosen.name, before, after: before - amount, exceeds: amount > before };
  }

  let verdict: SpendVerdict;
  if (availableAfter < threshold) verdict = 'unsafe';
  else if (budget?.exceeds) verdict = 'over-budget';
  else if (status && (status.level === 'alert' || status.level === 'warning')) verdict = 'tight';
  else verdict = 'reasonable';

  return {
    monthIndex: index,
    month: point.month,
    amount,
    availableBefore,
    availableAfter,
    spendableBefore,
    spendableAfter: spendableAmount(availableAfter, safety),
    threshold,
    safety: status,
    budget,
    verdict,
  };
}
