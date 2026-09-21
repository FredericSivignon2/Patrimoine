import { describe, expect, it } from 'vitest';
import { parsePatrimoineJson, serializePatrimoineData } from '../../infrastructure/storage/parsePatrimoineData';
import { evaluateObjectives, planBudgets, spendableTimeline, summarizeObjectives } from './BudgetEngine';
import { createDemoData } from './DemoData';
import { buildAmortization, finalRegularPayment, loanSnapshot, projectLoans } from './LoanEngine';
import { evaluateSafety } from './SafetyEngine';
import { computeLocked, projectPortfolio } from './ProjectionEngine';
import { spentByBudget } from './SpendingReport';

const REFERENCE = new Date(2026, 8, 21);

describe('createDemoData', () => {
  const demo = createDemoData(REFERENCE);

  it('produit un fichier valide qui survit à un aller-retour JSON', () => {
    expect(parsePatrimoineJson(serializePatrimoineData(demo))).toEqual(demo);
  });

  it('montre un PEE aux fonds bloqués et une épargne de sécurité confortable', () => {
    const pee = demo.accounts.find((account) => account.name === 'PEE');
    expect(pee?.depositLockYears).toBe(5);
    expect(pee?.lockedTranches).toHaveLength(3);

    const portfolio = projectPortfolio(demo.accounts, demo.movements, REFERENCE);
    expect(portfolio.currentLocked).toBeGreaterThan(0);
    expect(demo.safety).toBeDefined();
    if (demo.safety) expect(evaluateSafety(portfolio.currentAvailable, demo.safety).level).toBe('ok');
  });

  it('propose des postes de dépense qui n’allouent pas plus de 100 % du dépensable', () => {
    expect(demo.budgets.map((budget) => budget.name)).toEqual(['Vacances', 'Travaux', 'Future voiture']);
    const portfolio = projectPortfolio(demo.accounts, demo.movements, REFERENCE);
    const plan = planBudgets(portfolio.currentAvailable, demo.safety, demo.budgets);

    expect(plan.spendable).toBeGreaterThan(0);
    expect(plan.overAllocated).toBe(false);
    expect(plan.unallocatedPercent).toBe(25);
  });

  it('montre cinq prêts, dont un à taux zéro, avec des échéanciers valides', () => {
    expect(demo.loans.map((loan) => loan.kind)).toEqual(['MORTGAGE', 'MORTGAGE', 'MORTGAGE', 'RENOVATION', 'CONSUMER']);
    expect(demo.loans.some((loan) => loan.annualRate === 0)).toBe(true);

    const projection = projectLoans(demo.loans, REFERENCE);
    // échéances les 5, 10, 15, 20 et 25 du mois : celles du 5 au 20 sont payées au 21, la dernière ne l'est pas
    const borrowed = 9_500_000 + 2_400_000 + 1_800_000 + 1_500_000 + 800_000;
    expect(projection.points[0].outstanding).toBeLessThan(borrowed);
    expect(projection.points[0].outstanding).toBeGreaterThan(borrowed - 400_000);
    expect(projection.points[0].payments).toBe(141_300); // 1 413 € ce mois-ci, assurances comprises
    expect(projection.ends).toHaveLength(5);
    expect(projection.points[60].outstanding).toBeGreaterThan(0); // les prêts immobiliers durent plus de 5 ans
    expect(projection.points[60].outstanding).toBeLessThan(projection.points[0].outstanding);
  });

  it('prévoit deux remboursements anticipés : le prêt conso raccourcit, l’éco-PTZ allège sa mensualité', () => {
    const conso = demo.loans.find((loan) => loan.kind === 'CONSUMER');
    const ecoPtz = demo.loans.find((loan) => loan.kind === 'RENOVATION');
    if (!conso || !ecoPtz) throw new Error('prêts de démonstration manquants');

    const consoImpact = loanSnapshot(conso, '2026-09-21')?.prepaymentImpact;
    expect(consoImpact?.installmentsSaved).toBeGreaterThan(0);
    expect(consoImpact?.interestSaved).toBeGreaterThan(0);

    const ptz = buildAmortization(ecoPtz);
    expect(ptz.complete).toBe(true);
    expect(finalRegularPayment(ptz.rows)).toBeLessThan(ecoPtz.monthlyPayment);
    expect(loanSnapshot(ecoPtz, '2026-09-21')?.prepaymentImpact?.installmentsSaved).toBe(0);

    // Les autres prêts n'ont pas de remboursement anticipé, et aucun n'est sans effet.
    expect(demo.loans.filter((loan) => loan.prepayments).map((loan) => loan.kind)).toEqual(['RENOVATION', 'CONSUMER']);
    expect(demo.loans.every((loan) => buildAmortization(loan).ignoredPrepayments === 0)).toBe(true);
  });

  it('rattache des retraits à des postes, pour l’année en cours', () => {
    const spent = spentByBudget(demo.movements, demo.budgets, 2026);
    const names = demo.budgets.filter((budget) => spent.has(budget.id)).map((budget) => budget.name);
    expect(names).toEqual(['Vacances', 'Travaux']);
    expect(demo.movements.filter((movement) => movement.budgetId).every((movement) => movement.type === 'WITHDRAWAL')).toBe(true);
  });

  it('montre un objectif atteignable et un objectif qui demande un pourcentage plus élevé', () => {
    const portfolio = projectPortfolio(demo.accounts, demo.movements, REFERENCE);
    const timeline = spendableTimeline(portfolio.points, demo.safety);
    const spent = spentByBudget(demo.movements, demo.budgets, 2026);
    const entries = evaluateObjectives(demo.budgets, timeline, portfolio.points[0].month, spent);
    const outcomeOf = (name: string) => entries.find((entry) => entry.budget.name === name)?.outcome;

    const voiture = outcomeOf('Future voiture');
    expect(voiture?.reached).toBe(true);
    expect(voiture?.index).toBe(48);

    const travaux = outcomeOf('Travaux');
    expect(travaux?.reached).toBe(false);
    expect(travaux?.achievable).toBe(true);
    expect(travaux?.requiredPercent).toBeGreaterThan(30);

    expect(summarizeObjectives(entries)).toMatchObject({ count: 2, notReached: 1, unreachable: 0, overCommitted: false });
  });

  it('bloque tout le PEE aujourd’hui (stock saisi + versements), mais pas les autres comptes', () => {
    const pee = demo.accounts.find((account) => account.name === 'PEE');
    const livret = demo.accounts.find((account) => account.name === 'Livret A');
    if (!pee || !livret) throw new Error('comptes de démonstration manquants');
    expect(computeLocked(pee, demo.movements, REFERENCE)).toBe(600_000 + 12 * 10_000);
    expect(computeLocked(livret, demo.movements, REFERENCE)).toBe(0);
  });
});
