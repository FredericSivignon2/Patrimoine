import type { Budget } from '../models/Budget';
import type { Loan } from '../models/Loan';
import type { Movement } from '../models/Movement';
import type { Cents } from './FinancialMath';
import { sumCents } from './FinancialMath';
import { loanPaymentsInYear } from './LoanEngine';

const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4));

/** Retraits de l'année civile `year` rattachés à un poste existant, cumulés par poste. */
export function spentByBudget(
  movements: readonly Movement[],
  budgets: readonly Budget[],
  year: number,
): Map<string, Cents> {
  const known = new Set(budgets.map((budget) => budget.id));
  const spent = new Map<string, Cents>();
  for (const movement of movements) {
    if (movement.type !== 'WITHDRAWAL' || !movement.budgetId || !known.has(movement.budgetId)) continue;
    if (yearOf(movement.date) !== year) continue;
    spent.set(movement.budgetId, (spent.get(movement.budgetId) ?? 0) + movement.amount);
  }
  return spent;
}

/** Années comportant au moins un retrait, plus `currentYear`, de la plus ancienne à la plus récente. */
export function spendingYears(movements: readonly Movement[], currentYear: number): number[] {
  const years = new Set<number>([currentYear]);
  for (const movement of movements) {
    if (movement.type === 'WITHDRAWAL') years.add(yearOf(movement.date));
  }
  return [...years].sort((a, b) => a - b);
}

export interface SpendingLine {
  budget: Budget;
  amount: Cents;
  /** Nombre de retraits. */
  count: number;
}

export interface SpendingReport {
  year: number;
  /** Postes ayant reçu des retraits cette année, dans l'ordre des postes. */
  lines: SpendingLine[];
  /** Retraits de l'année rattachés à aucun poste (ou à un poste supprimé). */
  untagged: { amount: Cents; count: number };
  /** Retraits rattachés à un poste. */
  taggedTotal: Cents;
  /** Mensualités des prêts dues dans l'année, d'après les échéanciers (assurance comprise). */
  loans: Cents;
  /** Retraits (avec ou sans poste) + mensualités des prêts. */
  total: Cents;
}

/**
 * Où est passé l'argent en `year` : retraits par poste, retraits sans poste et mensualités des prêts.
 * Les mensualités viennent des échéanciers et ne doivent pas être saisies en plus comme mouvements.
 */
export function spendingReport(
  movements: readonly Movement[],
  budgets: readonly Budget[],
  loans: readonly Loan[],
  year: number,
): SpendingReport {
  const known = new Set(budgets.map((budget) => budget.id));
  const perBudget = new Map<string, { amount: Cents; count: number }>();
  const untagged = { amount: 0, count: 0 };

  for (const movement of movements) {
    if (movement.type !== 'WITHDRAWAL' || yearOf(movement.date) !== year) continue;
    if (movement.budgetId && known.has(movement.budgetId)) {
      const line = perBudget.get(movement.budgetId) ?? { amount: 0, count: 0 };
      perBudget.set(movement.budgetId, { amount: line.amount + movement.amount, count: line.count + 1 });
    } else {
      untagged.amount += movement.amount;
      untagged.count += 1;
    }
  }

  const lines = budgets.flatMap((budget): SpendingLine[] => {
    const line = perBudget.get(budget.id);
    return line ? [{ budget, ...line }] : [];
  });
  const taggedTotal = sumCents(lines.map((line) => line.amount));
  const loansTotal = loanPaymentsInYear(loans, year);

  return { year, lines, untagged, taggedTotal, loans: loansTotal, total: taggedTotal + untagged.amount + loansTotal };
}
