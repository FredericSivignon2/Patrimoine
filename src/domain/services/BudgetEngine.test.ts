import { describe, expect, it } from 'vitest';
import type { Budget } from '../models/Budget';
import type { ProjectionPoint } from '../models/Projection';
import type { SafetySettings } from '../models/Safety';
import {
  budgetAmount,
  deadlinePosition,
  evaluateObjective,
  evaluateObjectives,
  minimumBasisPoints,
  planBudgets,
  planBudgetsOverTime,
  remainingBasisPoints,
  remainingPercent,
  spendableAmount,
  spendableTimeline,
  summarizeObjectives,
} from './BudgetEngine';
import { shareOf } from './FinancialMath';
import { addMonths } from './Months';

const SAFETY: SafetySettings = { threshold: 2_000_000, comfortMargin: 500_000 }; // seuil 20 000 €
const budget = (id: string, percent: number, name = id): Budget => ({ id, name, percent });

/** Projection simplifiée : 27 550 € déblocables aujourd'hui, puis +500 € par mois (sept. 2026 = point 0). */
export const linearPoints = (start = 2_755_000, monthly = 50_000): ProjectionPoint[] =>
  Array.from({ length: 61 }, (_, index) => {
    const available = start + index * monthly;
    return { month: addMonths('2026-09', index), balance: available, locked: 0, available };
  });

describe('spendableAmount', () => {
  it('retire le seuil de sécurité du patrimoine déblocable', () => {
    expect(spendableAmount(2_755_000, SAFETY)).toBe(755_000);
  });

  it('considère tout le déblocable comme dépensable sans seuil défini', () => {
    expect(spendableAmount(2_755_000, undefined)).toBe(2_755_000);
  });

  it('ne descend jamais sous zéro', () => {
    expect(spendableAmount(2_000_000, SAFETY)).toBe(0);
    expect(spendableAmount(1_500_000, SAFETY)).toBe(0);
    expect(spendableAmount(-50_000, undefined)).toBe(0);
  });
});

describe('remainingBasisPoints et remainingPercent', () => {
  it('compte ce qui reste à répartir', () => {
    const budgets = [budget('a', 25), budget('b', 30)];
    expect(remainingBasisPoints(budgets)).toBe(4_500);
    expect(remainingPercent(budgets)).toBe(45);
  });

  it('ignore le poste que l’on modifie', () => {
    const budgets = [budget('a', 25), budget('b', 30)];
    expect(remainingPercent(budgets, 'b')).toBe(75);
  });

  it('gère les pourcentages décimaux sans erreur de flottant', () => {
    expect(remainingBasisPoints([budget('a', 12.5), budget('b', 12.5)])).toBe(7_500);
    expect(remainingBasisPoints([budget('a', 33.33), budget('b', 33.33), budget('c', 33.33)])).toBe(1);
    expect(remainingBasisPoints([budget('a', 0.29), budget('b', 0.29)])).toBe(9_942);
  });

  it('vaut 100 % sans poste et jamais moins que zéro', () => {
    expect(remainingPercent([])).toBe(100);
    expect(remainingPercent([budget('a', 60), budget('b', 60)])).toBe(0);
  });
});

describe('budgetAmount', () => {
  it('prend une part du dépensable', () => {
    expect(budgetAmount(755_000, 25)).toBe(188_750);
    expect(budgetAmount(755_000, 100)).toBe(755_000);
    expect(budgetAmount(755_000, 0)).toBe(0);
  });

  it('arrondit au centime inférieur', () => {
    expect(budgetAmount(1_000, 33.33)).toBe(333); // 333,3
    expect(budgetAmount(1_001, 33.33)).toBe(333); // 333,63
  });
});

describe('planBudgets', () => {
  it('répartit le dépensable entre les postes et laisse le reste non affecté', () => {
    const plan = planBudgets(2_755_000, SAFETY, [budget('vac', 25), budget('trav', 30), budget('auto', 20)]);

    expect(plan.spendable).toBe(755_000);
    expect(plan.threshold).toBe(2_000_000);
    expect(plan.shares.map((share) => [share.budget.id, share.amount])).toEqual([
      ['vac', 188_750],
      ['trav', 226_500],
      ['auto', 151_000],
    ]);
    expect(plan.allocatedPercent).toBe(75);
    expect(plan.unallocatedPercent).toBe(25);
    expect(plan.allocatedAmount).toBe(566_250);
    expect(plan.unallocatedAmount).toBe(188_750);
    expect(plan.overAllocated).toBe(false);
  });

  it('ne distribue jamais plus que le dépensable, même avec des pourcentages qui ne tombent pas juste', () => {
    const plan = planBudgets(1_000, undefined, [budget('a', 33.33), budget('b', 33.33), budget('c', 33.34)]);
    expect(plan.shares.map((share) => share.amount)).toEqual([333, 333, 333]);
    expect(plan.allocatedAmount).toBe(999);
    expect(plan.unallocatedAmount).toBe(1); // le centime restant est « non affecté »
    expect(plan.allocatedAmount + plan.unallocatedAmount).toBe(plan.spendable);
  });

  it('donne tout le dépensable au non affecté quand il n’y a aucun poste', () => {
    const plan = planBudgets(2_755_000, SAFETY, []);
    expect(plan.shares).toEqual([]);
    expect(plan.unallocatedPercent).toBe(100);
    expect(plan.unallocatedAmount).toBe(755_000);
  });

  it('n’alloue rien sous le seuil de sécurité', () => {
    const plan = planBudgets(1_500_000, SAFETY, [budget('a', 50)]);
    expect(plan.spendable).toBe(0);
    expect(plan.shares[0].amount).toBe(0);
    expect(plan.unallocatedAmount).toBe(0);
  });

  it('utilise tout le déblocable quand aucun seuil n’est défini', () => {
    const plan = planBudgets(400_000, undefined, [budget('a', 50)]);
    expect(plan.threshold).toBe(0);
    expect(plan.spendable).toBe(400_000);
    expect(plan.shares[0].amount).toBe(200_000);
  });

  it('signale une somme supérieure à 100 % sans planter', () => {
    const plan = planBudgets(2_755_000, SAFETY, [budget('a', 60), budget('b', 60)]);
    expect(plan.overAllocated).toBe(true);
    expect(plan.allocatedPercent).toBe(120);
    expect(plan.unallocatedPercent).toBe(0);
    expect(plan.unallocatedAmount).toBe(0);
  });
});

describe('spendableTimeline', () => {
  it('donne le dépensable de chaque mois de la projection', () => {
    const timeline = spendableTimeline(linearPoints(), SAFETY);
    expect(timeline).toHaveLength(61);
    expect(timeline[0]).toBe(755_000);
    expect(timeline[12]).toBe(1_355_000);
    expect(timeline[60]).toBe(3_755_000);
  });

  it('reste à zéro tant que le déblocable projeté n’a pas dépassé le seuil', () => {
    const timeline = spendableTimeline(linearPoints(1_000_000, 50_000), SAFETY); // 10 000 € + 500 €/mois
    expect(timeline[0]).toBe(0);
    expect(timeline[20]).toBe(0); // exactement au seuil
    expect(timeline[21]).toBe(50_000);
  });

  it('compte tout le déblocable sans seuil', () => {
    expect(spendableTimeline(linearPoints(), undefined)[0]).toBe(2_755_000);
  });
});

describe('planBudgetsOverTime', () => {
  it('répartit le dépensable aujourd’hui, dans 1, 2, 3 et 5 ans', () => {
    const plans = planBudgetsOverTime(linearPoints(), SAFETY, [budget('a', 25)]);

    expect(plans.map((plan) => plan.months)).toEqual([0, 12, 24, 36, 60]);
    expect(plans.map((plan) => plan.spendable)).toEqual([755_000, 1_355_000, 1_955_000, 2_555_000, 3_755_000]);
    expect(plans.map((plan) => plan.shares[0].amount)).toEqual([188_750, 338_750, 488_750, 638_750, 938_750]);
    expect(plans.map((plan) => plan.unallocatedAmount)).toEqual([566_250, 1_016_250, 1_466_250, 1_916_250, 2_816_250]);
  });

  it('donne le même résultat aujourd’hui que planBudgets', () => {
    const budgets = [budget('a', 25), budget('b', 30)];
    const [today] = planBudgetsOverTime(linearPoints(), SAFETY, budgets);
    expect(today).toEqual({ months: 0, ...planBudgets(2_755_000, SAFETY, budgets) });
  });
});

describe('deadlinePosition', () => {
  it('prend la fin du mois d’échéance', () => {
    expect(deadlinePosition('2026-09-30', '2026-09')).toEqual({ index: 0, overdue: false, beyondHorizon: false });
    expect(deadlinePosition('2027-09-01', '2026-09')).toEqual({ index: 12, overdue: false, beyondHorizon: false });
    expect(deadlinePosition('2031-09-15', '2026-09')).toEqual({ index: 60, overdue: false, beyondHorizon: false });
  });

  it('signale une échéance déjà passée et évalue avec les chiffres d’aujourd’hui', () => {
    expect(deadlinePosition('2026-08-31', '2026-09')).toEqual({ index: 0, overdue: true, beyondHorizon: false });
  });

  it('signale une échéance au-delà de la projection et évalue au dernier point', () => {
    expect(deadlinePosition('2031-10-01', '2026-09')).toEqual({ index: 60, overdue: false, beyondHorizon: true });
    expect(deadlinePosition('2035-01-01', '2026-09', 24)).toEqual({ index: 24, overdue: false, beyondHorizon: true });
  });
});

describe('minimumBasisPoints', () => {
  it('trouve la part exacte qui atteint l’objectif', () => {
    expect(minimumBasisPoints(1_000_000, 250_000)).toBe(2_500);
    expect(minimumBasisPoints(1_000_000, 250_001)).toBe(2_501);
    expect(minimumBasisPoints(1_000_000, 1)).toBe(1);
    expect(minimumBasisPoints(1_000_000, 0)).toBe(0);
  });

  it('résiste aux erreurs d’arrondi du quotient flottant', () => {
    expect(minimumBasisPoints(3, 1)).toBe(3_334); // 3 × 3 333 = 9 999 < 10 000 : il en faut 3 334
    expect(minimumBasisPoints(7, 7)).toBe(10_000);
  });

  it('est toujours le plus petit pourcentage qui suffit', () => {
    for (const [spendable, target] of [
      [755_000, 188_750],
      [1_955_000, 500_000],
      [123_457, 99_999],
      [999_999, 333_333],
      [50_000, 49_999],
    ]) {
      const basisPoints = minimumBasisPoints(spendable, target);
      expect(basisPoints).not.toBeNull();
      expect(shareOf(spendable, basisPoints ?? 0)).toBeGreaterThanOrEqual(target);
      expect(shareOf(spendable, (basisPoints ?? 0) - 1)).toBeLessThan(target);
    }
  });

  it('dépasse 100 % quand même la totalité ne suffit pas', () => {
    expect(minimumBasisPoints(1_000_000, 1_500_000)).toBe(15_000);
  });

  it('renvoie null quand rien n’est dépensable', () => {
    expect(minimumBasisPoints(0, 100)).toBeNull();
    expect(minimumBasisPoints(-5, 100)).toBeNull();
  });
});

describe('evaluateObjective', () => {
  const timeline = spendableTimeline(linearPoints(), SAFETY); // 755 000 + 50 000 × mois
  const objective = (overrides: Partial<{ percent: number; targetAmount: number; targetDate: string }> = {}) => ({
    percent: 20,
    targetAmount: 500_000, // 5 000 €
    targetDate: '2028-09-15', // dans 24 mois
    ...overrides,
  });

  it('dit combien il manque et quel pourcentage il faudrait', () => {
    const outcome = evaluateObjective(objective(), timeline, '2026-09');

    expect(outcome.index).toBe(24);
    expect(outcome.month).toBe('2028-09');
    expect(outcome.spendable).toBe(1_955_000);
    expect(outcome.projected).toBe(391_000); // 20 % de 19 550 €
    expect(outcome.reached).toBe(false);
    expect(outcome.shortfall).toBe(109_000);
    expect(outcome.requiredPercent).toBe(25.58);
    expect(outcome.achievable).toBe(true);
  });

  it('constate que l’objectif est atteint avec un pourcentage suffisant', () => {
    const outcome = evaluateObjective(objective({ percent: 30 }), timeline, '2026-09');
    expect(outcome.projected).toBe(586_500);
    expect(outcome.reached).toBe(true);
    expect(outcome.shortfall).toBe(0);
    expect(outcome.requiredPercent).toBe(25.58); // le pourcentage nécessaire ne dépend pas du pourcentage choisi
  });

  it('atteint pile l’objectif quand le pourcentage nécessaire est utilisé', () => {
    expect(evaluateObjective(objective({ percent: 25.58 }), timeline, '2026-09').reached).toBe(true);
    expect(evaluateObjective(objective({ percent: 25.57 }), timeline, '2026-09').reached).toBe(false);
  });

  it('juge un objectif hors d’atteinte même avec 100 % du dépensable', () => {
    const outcome = evaluateObjective(
      objective({ targetAmount: 5_000_000, targetDate: '2026-09-30' }),
      timeline,
      '2026-09',
    );
    expect(outcome.achievable).toBe(false);
    expect(outcome.requiredPercent).toBeGreaterThan(100);
    expect(outcome.reached).toBe(false);
  });

  it('n’a pas de pourcentage nécessaire quand rien n’est dépensable à l’échéance', () => {
    const outcome = evaluateObjective(objective(), new Array<number>(61).fill(0), '2026-09');
    expect(outcome.requiredPercent).toBeNull();
    expect(outcome.achievable).toBe(false);
    expect(outcome.projected).toBe(0);
    expect(outcome.shortfall).toBe(500_000);
  });

  it('signale une échéance passée ou au-delà de 5 ans', () => {
    expect(evaluateObjective(objective({ targetDate: '2026-01-01' }), timeline, '2026-09')).toMatchObject({
      index: 0,
      overdue: true,
      spendable: 755_000,
    });
    expect(evaluateObjective(objective({ targetDate: '2040-01-01' }), timeline, '2026-09')).toMatchObject({
      index: 60,
      beyondHorizon: true,
      spendable: 3_755_000,
    });
  });
});

describe('evaluateObjectives et summarizeObjectives', () => {
  const timeline = spendableTimeline(linearPoints(), SAFETY);
  const withObjective = (id: string, percent: number, targetAmount: number, targetDate: string): Budget => ({
    id,
    name: id,
    percent,
    targetAmount,
    targetDate,
  });

  it('n’évalue que les postes qui ont un objectif', () => {
    const entries = evaluateObjectives(
      [budget('sans', 10), withObjective('avec', 20, 500_000, '2028-09-15')],
      timeline,
      '2026-09',
    );
    expect(entries.map((entry) => entry.budget.id)).toEqual(['avec']);
  });

  it('additionne les pourcentages nécessaires et signale quand ils dépassent 100 %', () => {
    const entries = evaluateObjectives(
      [
        withObjective('a', 10, 1_000_000, '2028-09-15'), // 10 000 € sur 19 550 € : 51,16 % (arrondi au-dessus)
        withObjective('b', 10, 1_000_000, '2028-09-15'),
      ],
      timeline,
      '2026-09',
    );
    const summary = summarizeObjectives(entries);
    expect(summary.count).toBe(2);
    expect(summary.notReached).toBe(2);
    expect(summary.unreachable).toBe(0);
    expect(summary.totalRequiredPercent).toBe(102.32);
    expect(summary.overCommitted).toBe(true);
  });

  it('reste raisonnable quand les besoins tiennent ensemble', () => {
    const entries = evaluateObjectives(
      [withObjective('a', 30, 500_000, '2028-09-15'), withObjective('b', 20, 600_000, '2031-09-15')],
      timeline,
      '2026-09',
    );
    const summary = summarizeObjectives(entries);
    expect(summary).toMatchObject({ count: 2, notReached: 0, unreachable: 0, overCommitted: false });
    expect(summary.totalRequiredPercent).toBeLessThan(100);
  });

  it('compte les objectifs hors d’atteinte et considère un dépensable nul comme un dépassement', () => {
    const zero = new Array<number>(61).fill(0);
    const summary = summarizeObjectives(
      evaluateObjectives([withObjective('a', 50, 100_000, '2028-09-15')], zero, '2026-09'),
    );
    expect(summary).toMatchObject({ count: 1, unreachable: 1, notReached: 1, overCommitted: true });
  });

  it('résume l’absence d’objectif', () => {
    expect(summarizeObjectives([])).toEqual({
      count: 0,
      notReached: 0,
      unreachable: 0,
      totalRequiredPercent: 0,
      overCommitted: false,
    });
  });
});

describe('dépenses rattachées aux postes (enveloppes)', () => {
  const budgets = [budget('vac', 25), budget('trav', 30)];
  const shareOfId = (plan: ReturnType<typeof planBudgets>, id: string) => {
    const share = plan.shares.find((candidate) => candidate.budget.id === id);
    if (!share) throw new Error(`poste ${id} absent`);
    return share;
  };

  it('déduit la dépense de l’enveloppe du poste, sans toucher aux autres', () => {
    // Avant : 28 550 € déblocables (dépensable 8 550 €). On dépense ensuite 1 000 € sur « vac ».
    const before = planBudgets(2_855_000, SAFETY, budgets);
    const after = planBudgets(2_755_000, SAFETY, budgets, new Map([['vac', 100_000]]));

    expect(after.spendable).toBe(755_000);
    expect(after.spentTotal).toBe(100_000);
    expect(after.pool).toBe(855_000); // le dépensable d'avant la dépense
    expect(shareOfId(after, 'vac')).toMatchObject({ amount: 213_750, spent: 100_000, remaining: 113_750 });
    expect(shareOfId(after, 'vac').remaining).toBe(shareOfId(before, 'vac').remaining - 100_000);
    expect(shareOfId(after, 'trav').remaining).toBe(shareOfId(before, 'trav').remaining);
    expect(after.unallocatedAmount).toBe(before.unallocatedAmount);
  });

  it('garde une comptabilité exacte : restes + non affecté = dépensable réel', () => {
    const plan = planBudgets(2_755_000, SAFETY, budgets, new Map([['vac', 70_001], ['trav', 33_333]]));
    const remaining = plan.shares.reduce((sum, share) => sum + share.remaining, 0);
    expect(remaining + plan.unallocatedAmount).toBe(plan.spendable);
  });

  it('laisse le reste devenir négatif quand un poste est dépassé', () => {
    const plan = planBudgets(2_755_000, SAFETY, budgets, new Map([['vac', 500_000]]));
    expect(shareOfId(plan, 'vac').remaining).toBeLessThan(0);
    expect(shareOfId(plan, 'trav').remaining).toBeGreaterThan(0);
  });

  it('ignore les dépenses rattachées à un poste qui n’existe plus', () => {
    const plan = planBudgets(2_755_000, SAFETY, budgets, new Map([['supprime', 999_999]]));
    expect(plan.spentTotal).toBe(0);
    expect(plan.pool).toBe(plan.spendable);
  });

  it('sans dépense rattachée, se comporte comme avant', () => {
    const plan = planBudgets(2_755_000, SAFETY, budgets);
    expect(plan.pool).toBe(plan.spendable);
    expect(plan.shares.every((share) => share.spent === 0 && share.remaining === share.amount)).toBe(true);
  });

  it('applique les dépenses de l’année à chaque échéance', () => {
    const plans = planBudgetsOverTime(linearPoints(), SAFETY, budgets, new Map([['vac', 100_000]]));
    // dans 1 an : dépensable 13 550 € + 1 000 € déjà dépensés = base 14 550 € ; 25 % = 3 637,50 € ; reste 2 637,50 €
    expect(shareOfId(plans[1], 'vac')).toMatchObject({ amount: 363_750, remaining: 263_750 });
    expect(plans.every((plan) => plan.spentTotal === 100_000)).toBe(true);
  });

  it('déduit les dépenses du poste dans l’évaluation de son objectif', () => {
    const timeline = spendableTimeline(linearPoints(), SAFETY);
    const outcome = evaluateObjective(
      { percent: 30, targetAmount: 500_000, targetDate: '2028-09-15', spent: 100_000 },
      timeline,
      '2026-09',
      100_000,
    );
    // base = 19 550 € + 1 000 € ; enveloppe 30 % = 6 165 € ; disponible = 5 165 €
    expect(outcome.projected).toBe(516_500);
    expect(outcome.reached).toBe(true);
    expect(outcome.maxAvailable).toBe(1_955_000);
    expect(outcome.requiredPercent).toBe(29.2); // (5 000 € + 1 000 dépensés) / 20 550 €
  });

  it('évalue les objectifs de tous les postes avec le total dépensé', () => {
    const timeline = spendableTimeline(linearPoints(), SAFETY);
    const withTarget: Budget[] = [
      { id: 'vac', name: 'vac', percent: 30, targetAmount: 500_000, targetDate: '2028-09-15' },
      budget('trav', 30),
    ];
    const [entry] = evaluateObjectives(withTarget, timeline, '2026-09', new Map([['vac', 100_000], ['trav', 50_000]]));
    // base = 19 550 € + 1 500 € = 21 050 € ; 30 % = 6 315 € ; moins 1 000 € dépensés = 5 315 €
    expect(entry.outcome.projected).toBe(531_500);
  });
});
