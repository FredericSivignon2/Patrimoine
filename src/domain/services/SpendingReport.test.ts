import { describe, expect, it } from 'vitest';
import type { Budget } from '../models/Budget';
import type { Loan } from '../models/Loan';
import type { Movement } from '../models/Movement';
import { spendingReport, spendingYears, spentByBudget } from './SpendingReport';

const BUDGETS: Budget[] = [
  { id: 'vac', name: 'Vacances', percent: 25 },
  { id: 'trav', name: 'Travaux', percent: 30 },
  { id: 'auto', name: 'Voiture', percent: 10 },
];

let sequence = 0;
const withdrawal = (amount: number, date: string, budgetId?: string): Movement => ({
  id: `m${++sequence}`,
  accountId: 'a',
  type: 'WITHDRAWAL',
  amount,
  date,
  ...(budgetId ? { budgetId } : {}),
});
const deposit = (amount: number, date: string): Movement => ({
  id: `m${++sequence}`,
  accountId: 'a',
  type: 'DEPOSIT',
  amount,
  date,
});

const MOVEMENTS: Movement[] = [
  withdrawal(120_000, '2026-07-10', 'vac'),
  withdrawal(80_000, '2026-08-02', 'vac'),
  withdrawal(300_000, '2026-04-15', 'trav'),
  withdrawal(45_000, '2026-05-20'), // sans poste
  withdrawal(10_000, '2026-06-01', 'supprime'), // poste supprimé : compte comme sans poste
  withdrawal(999_000, '2025-12-31', 'trav'), // année précédente
  deposit(500_000, '2026-03-01'), // un versement n'est pas une dépense
];

const LOAN: Loan = {
  id: 'l',
  name: 'Prêt',
  kind: 'CONSUMER',
  principal: 1_200_000,
  annualRate: 0,
  monthlyPayment: 100_000,
  monthlyInsurance: 5_000,
  firstPaymentDate: '2026-10-05',
};

describe('spentByBudget', () => {
  it('cumule par poste les retraits rattachés de l’année demandée', () => {
    const spent = spentByBudget(MOVEMENTS, BUDGETS, 2026);
    expect([...spent.entries()]).toEqual([
      ['vac', 200_000],
      ['trav', 300_000],
    ]);
  });

  it('ignore les autres années, les versements, les retraits sans poste et les postes supprimés', () => {
    expect(spentByBudget(MOVEMENTS, BUDGETS, 2025).get('trav')).toBe(999_000);
    expect(spentByBudget(MOVEMENTS, BUDGETS, 2026).has('supprime')).toBe(false);
    expect(spentByBudget([deposit(1_000, '2026-01-01')], BUDGETS, 2026).size).toBe(0);
  });
});

describe('spendingYears', () => {
  it('liste les années avec retraits, plus l’année courante, en ordre croissant', () => {
    expect(spendingYears(MOVEMENTS, 2026)).toEqual([2025, 2026]);
    expect(spendingYears([], 2026)).toEqual([2026]);
    expect(spendingYears([withdrawal(100, '2024-02-02')], 2026)).toEqual([2024, 2026]);
  });

  it('ignore les versements', () => {
    expect(spendingYears([deposit(100, '2019-02-02')], 2026)).toEqual([2026]);
  });
});

describe('spendingReport', () => {
  it('ventile les retraits de l’année par poste, sans poste, et ajoute les mensualités de prêts', () => {
    const report = spendingReport(MOVEMENTS, BUDGETS, [LOAN], 2026);

    expect(report.year).toBe(2026);
    expect(report.lines.map((line) => [line.budget.id, line.amount, line.count])).toEqual([
      ['vac', 200_000, 2],
      ['trav', 300_000, 1],
    ]);
    expect(report.untagged).toEqual({ amount: 55_000, count: 2 }); // 450 € sans poste + 100 € d'un poste supprimé
    expect(report.taggedTotal).toBe(500_000);
    expect(report.loans).toBe(3 * 105_000); // octobre à décembre 2026
    expect(report.total).toBe(500_000 + 55_000 + 315_000);
  });

  it('suit l’ordre des postes et n’affiche que ceux qui ont des dépenses', () => {
    const report = spendingReport([withdrawal(1_000, '2026-01-01', 'trav'), withdrawal(2_000, '2026-01-02', 'vac')], BUDGETS, [], 2026);
    expect(report.lines.map((line) => line.budget.id)).toEqual(['vac', 'trav']);
  });

  it('couvre une autre année', () => {
    const report = spendingReport(MOVEMENTS, BUDGETS, [LOAN], 2025);
    expect(report.lines.map((line) => line.amount)).toEqual([999_000]);
    expect(report.untagged).toEqual({ amount: 0, count: 0 });
    expect(report.loans).toBe(0);
    expect(report.total).toBe(999_000);
  });

  it('est vide sans mouvement ni prêt', () => {
    expect(spendingReport([], BUDGETS, [], 2026)).toEqual({
      year: 2026,
      lines: [],
      untagged: { amount: 0, count: 0 },
      taggedTotal: 0,
      loans: 0,
      total: 0,
    });
  });
});
