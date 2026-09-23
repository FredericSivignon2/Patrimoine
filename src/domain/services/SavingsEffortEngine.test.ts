import { describe, expect, it } from 'vitest';
import type { Account } from '../models/Account';
import type { Loan } from '../models/Loan';
import type { Movement } from '../models/Movement';
import type { SavingsEffortSettings } from '../models/SavingsEffort';
import {
  averageMonthlyBudgetSpending,
  computeSavingsCapacity,
  evaluateEffortWindow,
  evaluateSavingsEffort,
  suggestRecalibration,
  totalMonthlyIncome,
  type EffortWindow,
} from './SavingsEffortEngine';

// 21 septembre 2026 : les mois complets s'arrêtent donc à août 2026.
const REFERENCE = new Date(2026, 8, 21);

const checking: Account = { id: 'c1', name: 'Courant', type: 'CHECKING', initialBalance: 0 };
const livret: Account = { id: 's1', name: 'Livret', type: 'SAVINGS', initialBalance: 0 };
const autreLivret: Account = { id: 's2', name: 'Autre livret', type: 'SAVINGS', initialBalance: 0 };

const deposit = (accountId: string, amount: number, date: string): Movement => ({
  id: `d-${accountId}-${date}-${amount}`,
  accountId,
  type: 'DEPOSIT',
  amount,
  date,
});
const withdrawal = (accountId: string, amount: number, date: string, budgetId?: string): Movement => ({
  id: `w-${accountId}-${date}-${amount}`,
  accountId,
  type: 'WITHDRAWAL',
  amount,
  date,
  ...(budgetId ? { budgetId } : {}),
});

const settings = (overrides: Partial<SavingsEffortSettings> = {}): SavingsEffortSettings => ({
  incomeSources: [{ name: 'Salaire', monthlyAmount: 300_000 }],
  targetRatePercent: 20,
  ...overrides,
});

const loan = (overrides: Partial<Loan> = {}): Loan => ({
  id: 'l1',
  name: 'Prêt',
  kind: 'MORTGAGE',
  principal: 1_200_000,
  annualRate: 0,
  monthlyPayment: 100_000,
  firstPaymentDate: '2026-10-05',
  ...overrides,
});

describe('totalMonthlyIncome', () => {
  it('additionne tous les revenus, et vaut 0 sans revenu', () => {
    expect(totalMonthlyIncome([{ name: 'A', monthlyAmount: 200_000 }, { name: 'B', monthlyAmount: 150_000 }])).toBe(350_000);
    expect(totalMonthlyIncome([])).toBe(0);
  });
});

describe('averageMonthlyBudgetSpending', () => {
  it('vaut 0 sans aucun retrait rattaché à un poste', () => {
    expect(averageMonthlyBudgetSpending([withdrawal('s1', 10_000, '2026-08-01')], REFERENCE)).toBe(0);
  });

  it('moyenne les retraits rattachés sur les mois complets, en ignorant le mois en cours', () => {
    const movements = [
      withdrawal('s1', 60_000, '2026-07-15', 'vacances'),
      withdrawal('s1', 30_000, '2026-08-01', 'vacances'),
      withdrawal('s1', 999_999, '2026-09-05', 'vacances'), // mois en cours, exclu
      withdrawal('s1', 5_000, '2026-08-10'), // sans poste, ignoré
    ];
    // fenêtre par défaut (12 mois) mais un seul retrait rattaché existe depuis juillet : (60 000+30 000)/2 mois
    expect(averageMonthlyBudgetSpending(movements, REFERENCE)).toBe(45_000);
  });

  it('ne remonte pas avant le premier retrait rattaché', () => {
    const movements = [withdrawal('s1', 120_000, '2026-08-20', 'travaux')];
    expect(averageMonthlyBudgetSpending(movements, REFERENCE, 12)).toBe(120_000); // un seul mois disponible
  });

  it('respecte la fenêtre demandée', () => {
    const movements = [
      withdrawal('s1', 100_000, '2026-01-15', 'vacances'),
      withdrawal('s1', 100_000, '2026-08-15', 'vacances'),
    ];
    expect(averageMonthlyBudgetSpending(movements, REFERENCE, 3)).toBe(Math.round(100_000 / 3)); // juin, juillet, août
  });
});

describe('computeSavingsCapacity', () => {
  it('combine revenus, mensualités actives et dépenses de postes', () => {
    const movements = [withdrawal('s1', 120_000, '2026-08-20', 'vacances')];
    const capacity = computeSavingsCapacity(settings(), [loan()], movements, REFERENCE);
    expect(capacity.income).toBe(300_000);
    expect(capacity.loanPayments).toBe(100_000); // prêt actif, pas encore débuté mais compté comme actif
    expect(capacity.budgetProvisions).toBe(120_000);
    expect(capacity.residual).toBe(300_000 - 100_000 - 120_000);
    expect(capacity.target).toBe(Math.floor(capacity.residual * 0.2));
  });

  it('ignore les prêts déjà soldés', () => {
    const finished = loan({ firstPaymentDate: '2020-01-05', monthlyPayment: 1_200_000 }); // soldé en un mois
    const capacity = computeSavingsCapacity(settings(), [finished], [], REFERENCE);
    expect(capacity.loanPayments).toBe(0);
  });

  it('plafonne la capacité résiduelle à 0 (jamais négative)', () => {
    const capacity = computeSavingsCapacity(settings({ incomeSources: [{ name: 'Salaire', monthlyAmount: 50_000 }] }), [loan()], [], REFERENCE);
    expect(capacity.residual).toBe(0);
    expect(capacity.target).toBe(0);
  });
});

describe('evaluateEffortWindow', () => {
  const accounts = [checking, livret, autreLivret];

  it('vaut « ok » sans historique du tout', () => {
    expect(evaluateEffortWindow(3, accounts, [], 100_000, REFERENCE)).toEqual({
      months: 3,
      availableMonths: 0,
      realized: 0,
      target: 100_000,
      ratio: null,
      level: 'ok',
    });
  });

  it('ignore les comptes courants, additionne toutes les épargnes, verse net des retraits', () => {
    const movements = [
      deposit('s1', 100_000, '2026-08-05'),
      deposit('s2', 50_000, '2026-08-10'),
      withdrawal('s1', 20_000, '2026-08-15'),
      deposit('c1', 999_999, '2026-08-01'), // compte courant, ignoré
    ];
    const window = evaluateEffortWindow(1, accounts, movements, 100_000, REFERENCE);
    expect(window.availableMonths).toBe(1);
    expect(window.realized).toBe(100_000 + 50_000 - 20_000);
  });

  it('moyenne sur les mois disponibles et calcule le ratio', () => {
    const movements = [deposit('s1', 60_000, '2026-07-05'), deposit('s1', 100_000, '2026-08-05')];
    const window = evaluateEffortWindow(3, accounts, movements, 80_000, REFERENCE);
    expect(window.availableMonths).toBe(2); // premier mouvement en juillet : juillet + août
    expect(window.realized).toBe(80_000);
    expect(window.ratio).toBe(1);
    expect(window.level).toBe('ok');
  });

  it("ne remonte pas avant le premier mouvement de l'application", () => {
    const movements = [deposit('s1', 40_000, '2026-08-20')];
    const window = evaluateEffortWindow(24, accounts, movements, 100_000, REFERENCE);
    expect(window.availableMonths).toBe(1);
  });

  it('vaut « ok » sans alerte quand la cible est nulle, quel que soit le réalisé', () => {
    const movements = [deposit('s1', 5_000, '2026-08-05')];
    const window = evaluateEffortWindow(1, accounts, movements, 0, REFERENCE);
    expect(window.ratio).toBeNull();
    expect(window.level).toBe('ok');
  });

  it.each<[string, number, EffortWindow['level']]>([
    ['réalisé au-dessus de l’objectif', 100_000, 'ok'],
    ['réalisé légèrement en dessous', 90_000, 'warning'],
    ['réalisé nettement en dessous', 70_000, 'alert'],
    ['réalisé très faible', 30_000, 'critical'],
  ])('classe %s comme %s', (_label, realizedAmount, expectedLevel) => {
    const movements = [deposit('s1', realizedAmount, '2026-08-05')];
    expect(evaluateEffortWindow(1, accounts, movements, 100_000, REFERENCE).level).toBe(expectedLevel);
  });
});

describe('suggestRecalibration', () => {
  const complete = (overrides: Partial<EffortWindow> = {}): EffortWindow => ({
    months: 6,
    availableMonths: 6,
    realized: 100_000,
    target: 100_000,
    ratio: 1,
    level: 'ok',
    ...overrides,
  });

  it('ne suggère rien avec un historique insuffisant', () => {
    expect(suggestRecalibration(complete({ availableMonths: 5 }), 20)).toBeNull();
  });

  it('ne suggère rien sans cible (ratio nul)', () => {
    expect(suggestRecalibration(complete({ ratio: null }), 20)).toBeNull();
  });

  it('ne suggère rien dans la zone raisonnable', () => {
    expect(suggestRecalibration(complete({ ratio: 1.1 }), 20)).toBeNull();
    expect(suggestRecalibration(complete({ ratio: 0.75 }), 20)).toBeNull();
  });

  it('suggère de relever le taux si le réalisé dépasse durablement l’objectif', () => {
    const suggestion = suggestRecalibration(complete({ ratio: 1.5 }), 20);
    expect(suggestion).toEqual({ direction: 'raise', currentRatePercent: 20, suggestedRatePercent: 30, averageRatio: 1.5 });
  });

  it('suggère de baisser le taux si le réalisé reste durablement en dessous', () => {
    const suggestion = suggestRecalibration(complete({ ratio: 0.5 }), 20);
    expect(suggestion).toEqual({ direction: 'lower', currentRatePercent: 20, suggestedRatePercent: 10, averageRatio: 0.5 });
  });

  it('arrondit le taux suggéré au multiple de 5, borné à 100', () => {
    expect(suggestRecalibration(complete({ ratio: 4 }), 20)?.suggestedRatePercent).toBe(80);
    expect(suggestRecalibration(complete({ ratio: 10 }), 20)?.suggestedRatePercent).toBe(100);
  });
});

describe('evaluateSavingsEffort', () => {
  it('assemble la capacité, les fenêtres et la suggestion de réajustement', () => {
    const accounts = [checking, livret];
    const movements = Array.from({ length: 8 }, (_, index) => deposit('s1', 200_000, `2026-0${index + 1}-05`));
    const report = evaluateSavingsEffort(settings(), { loans: [loan()], accounts, movements }, REFERENCE);

    expect(report.capacity.income).toBe(300_000);
    expect(report.windows).toHaveLength(4); // 3, 6, 12, 24 mois
    expect(report.current).toBe(report.windows[0]);
    expect(report.current.months).toBe(3);
    // 200 000 réalisés chaque mois, largement au-dessus d'un objectif construit sur 300 000 de revenu : suggestion de relever
    expect(report.recalibration?.direction).toBe('raise');
  });
});
