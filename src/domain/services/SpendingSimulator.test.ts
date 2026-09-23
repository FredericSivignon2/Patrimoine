import { describe, expect, it } from 'vitest';
import type { Budget } from '../models/Budget';
import type { ProjectionPoint } from '../models/Projection';
import type { SafetySettings } from '../models/Safety';
import { addMonths } from './Months';
import { SIMULATION_DELAYS, simulateSpending } from './SpendingSimulator';

// 27 550 € déblocables aujourd'hui, puis +500 € par mois ; seuil de sécurité 20 000 €, marge de confort 5 000 €.
const POINTS: ProjectionPoint[] = Array.from({ length: 61 }, (_, index) => {
  const available = 2_755_000 + index * 50_000;
  return { month: addMonths('2026-09', index), balance: available, locked: 0, reserved: 0, available };
});
const SAFETY: SafetySettings = { threshold: 2_000_000, comfortMargin: 500_000 };
const BUDGETS: Budget[] = [
  { id: 'vac', name: 'Vacances', percent: 25 },
  { id: 'auto', name: 'Voiture', percent: 10 },
];

/** `safety: null` = aucun seuil défini (un `undefined` déclencherait la valeur par défaut). */
const simulate = (amount: number, monthIndex = 0, budgetId?: string, safety: SafetySettings | null = SAFETY) =>
  simulateSpending({ amount, monthIndex, budgetId }, POINTS, safety ?? undefined, BUDGETS);

describe('simulateSpending', () => {
  it('juge raisonnable une dépense qui laisse une marge confortable', () => {
    const result = simulate(100_000); // 1 000 €
    expect(result).toMatchObject({
      monthIndex: 0,
      month: '2026-09',
      availableBefore: 2_755_000,
      availableAfter: 2_655_000,
      spendableBefore: 755_000,
      spendableAfter: 655_000,
      threshold: 2_000_000,
      verdict: 'reasonable',
    });
    expect(result.safety).toMatchObject({ level: 'ok', margin: 655_000 });
    expect(result.budget).toBeUndefined();
  });

  it('signale une marge réduite (jaune) puis proche du seuil (orange)', () => {
    expect(simulate(300_000).safety?.level).toBe('warning'); // marge 4 550 €
    expect(simulate(300_000).verdict).toBe('tight');
    expect(simulate(700_000).safety?.level).toBe('alert'); // marge 550 €
    expect(simulate(700_000).verdict).toBe('tight');
  });

  it('déconseille une dépense qui passe sous le seuil de sécurité', () => {
    const result = simulate(800_000); // il ne reste que 19 550 €
    expect(result.verdict).toBe('unsafe');
    expect(result.safety?.level).toBe('critical');
    expect(result.spendableAfter).toBe(0);
    expect(simulate(755_000).verdict).toBe('tight'); // pile au seuil : orange, encore possible
  });

  it('compare la dépense au budget du poste choisi', () => {
    const within = simulate(188_750, 0, 'vac'); // 25 % de 7 550 € = 1 887,50 €
    expect(within.budget).toEqual({ id: 'vac', name: 'Vacances', before: 188_750, after: 0, exceeds: false });
    expect(within.verdict).toBe('reasonable');

    const over = simulate(200_000, 0, 'vac');
    expect(over.budget).toEqual({ id: 'vac', name: 'Vacances', before: 188_750, after: -11_250, exceeds: true });
    expect(over.verdict).toBe('over-budget');
  });

  it('tient compte de ce qui a déjà été dépensé sur le poste cette année', () => {
    // vacances : base 7 550 € + 1 000 € déjà dépensés = 8 550 € ; enveloppe 25 % = 2 137,50 € ; reste 1 137,50 €
    const spent = new Map([['vac', 100_000]]);
    const result = simulateSpending({ amount: 120_000, monthIndex: 0, budgetId: 'vac' }, POINTS, SAFETY, BUDGETS, spent);
    expect(result.budget).toEqual({ id: 'vac', name: 'Vacances', before: 113_750, after: -6_250, exceeds: true });
    expect(result.verdict).toBe('over-budget');

    const fine = simulateSpending({ amount: 100_000, monthIndex: 0, budgetId: 'vac' }, POINTS, SAFETY, BUDGETS, spent);
    expect(fine.budget?.exceeds).toBe(false);
  });

  it('donne la priorité au seuil de sécurité sur le budget du poste', () => {
    expect(simulate(800_000, 0, 'vac').verdict).toBe('unsafe');
  });

  it('projette la dépense à une échéance future', () => {
    const result = simulate(1_000_000, 12, 'auto'); // dans 1 an, 10 000 € pour la voiture
    expect(result.monthIndex).toBe(12);
    expect(result.month).toBe('2027-09');
    expect(result.availableBefore).toBe(3_355_000);
    expect(result.spendableBefore).toBe(1_355_000);
    expect(result.budget).toMatchObject({ before: 135_500, after: 864_500 * -1, exceeds: true }); // 10 % de 13 550 €
    expect(result.safety?.margin).toBe(355_000);
  });

  it('sans seuil défini, ne compte que le déblocable', () => {
    const fine = simulate(1_000_000, 0, undefined, null);
    expect(fine.safety).toBeUndefined();
    expect(fine.threshold).toBe(0);
    expect(fine.verdict).toBe('reasonable');

    expect(simulate(3_000_000, 0, undefined, null).verdict).toBe('unsafe'); // plus que le déblocable
  });

  it('borne le délai à la projection', () => {
    expect(simulate(1, 999).monthIndex).toBe(60);
    expect(simulate(1, -5).monthIndex).toBe(0);
    expect(simulate(1, 6.9).monthIndex).toBe(6);
  });

  it('ignore un poste inconnu', () => {
    expect(simulate(100_000, 0, 'inconnu').budget).toBeUndefined();
  });

  it('propose des délais croissants qui commencent aujourd’hui', () => {
    expect(SIMULATION_DELAYS[0]).toBe(0);
    expect([...SIMULATION_DELAYS].sort((a, b) => a - b)).toEqual([...SIMULATION_DELAYS]);
    expect(Math.max(...SIMULATION_DELAYS)).toBeLessThanOrEqual(60);
  });
});
