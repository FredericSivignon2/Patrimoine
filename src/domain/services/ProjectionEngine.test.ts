import { describe, expect, it } from 'vitest';
import type { Account } from '../models/Account';
import type { Movement, MovementType } from '../models/Movement';
import { PROJECTION_HORIZONS } from '../models/Projection';
import {
  averageMonthlyNet,
  computeBalance,
  monthlyNetSeries,
  projectAccount,
  projectBalances,
  projectPortfolio,
} from './ProjectionEngine';

// 21 septembre 2026 (calendrier local) : mois courant = 2026-09, dernier mois complet = 2026-08.
const REFERENCE = new Date(2026, 8, 21);

let sequence = 0;
const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'a1',
  name: 'Livret',
  type: 'SAVINGS',
  initialBalance: 100_000,
  ...overrides,
});
const movement = (
  type: MovementType,
  amount: number,
  date: string,
  accountId = 'a1',
): Movement => ({ id: `m${++sequence}`, accountId, type, amount, date });
const deposit = (amount: number, date: string, accountId?: string): Movement =>
  movement('DEPOSIT', amount, date, accountId);
const withdrawal = (amount: number, date: string, accountId?: string): Movement =>
  movement('WITHDRAWAL', amount, date, accountId);

describe('computeBalance', () => {
  it('renvoie le solde initial sans mouvement', () => {
    expect(computeBalance(account({ initialBalance: 123_456 }), [])).toBe(123_456);
  });

  it('ajoute les versements et retire les retraits', () => {
    const movements = [deposit(20_000, '2026-01-10'), deposit(5_000, '2026-02-10'), withdrawal(3_000, '2026-03-10')];
    expect(computeBalance(account(), movements)).toBe(100_000 + 20_000 + 5_000 - 3_000);
  });

  it("ignore les mouvements des autres comptes", () => {
    const movements = [deposit(20_000, '2026-01-10'), deposit(999_999, '2026-01-10', 'autre')];
    expect(computeBalance(account(), movements)).toBe(120_000);
  });

  it('peut être négatif', () => {
    expect(computeBalance(account({ initialBalance: 1_000 }), [withdrawal(5_000, '2026-01-10')])).toBe(-4_000);
  });
});

describe('monthlyNetSeries', () => {
  it('agrège versements, retraits et net par mois, mois vides compris', () => {
    const movements = [
      deposit(30_000, '2026-06-05'),
      deposit(10_000, '2026-06-20'),
      withdrawal(5_000, '2026-06-25'),
      withdrawal(2_000, '2026-08-01'),
    ];
    expect(monthlyNetSeries(movements, '2026-06', '2026-08')).toEqual([
      { month: '2026-06', deposits: 40_000, withdrawals: 5_000, net: 35_000 },
      { month: '2026-07', deposits: 0, withdrawals: 0, net: 0 },
      { month: '2026-08', deposits: 0, withdrawals: 2_000, net: -2_000 },
    ]);
  });

  it('ignore les mouvements hors de la plage', () => {
    const series = monthlyNetSeries([deposit(1_000, '2026-01-01'), deposit(1_000, '2026-12-31')], '2026-06', '2026-07');
    expect(series.map((month) => month.net)).toEqual([0, 0]);
  });

  it('renvoie une liste vide si la plage est inversée', () => {
    expect(monthlyNetSeries([], '2026-08', '2026-06')).toEqual([]);
  });
});

describe('averageMonthlyNet', () => {
  it('vaut 0 sans mouvement', () => {
    expect(averageMonthlyNet([], REFERENCE)).toBe(0);
  });

  it('moyenne les mois complets et exclut le mois en cours', () => {
    const movements = [
      deposit(30_000, '2026-06-10'),
      deposit(10_000, '2026-07-10'),
      deposit(20_000, '2026-08-10'),
      deposit(500_000, '2026-09-02'), // mois en cours : exclu
    ];
    expect(averageMonthlyNet(movements, REFERENCE)).toBe(20_000);
  });

  it('compte les mois sans mouvement pour zéro, à partir du premier mouvement', () => {
    const movements = [deposit(30_000, '2026-06-10'), deposit(30_000, '2026-08-10')];
    // juin, juillet (0), août => 60 000 / 3
    expect(averageMonthlyNet(movements, REFERENCE)).toBe(20_000);
  });

  it("utilise le mois en cours s'il n'existe pas encore de mois complet", () => {
    expect(averageMonthlyNet([deposit(25_000, '2026-09-03')], REFERENCE)).toBe(25_000);
  });

  it('limite la fenêtre aux 12 derniers mois complets', () => {
    const recent = Array.from({ length: 12 }, (_, index) =>
      deposit(10_000, `${index < 4 ? '2025' : '2026'}-${String(((index + 8) % 12) + 1).padStart(2, '0')}-15`),
    ); // 2025-09 … 2026-08
    const tooOld = deposit(9_999_900, '2025-08-15');
    expect(averageMonthlyNet([...recent, tooOld], REFERENCE)).toBe(10_000);
  });

  it('accepte une fenêtre personnalisée', () => {
    const movements = [deposit(90_000, '2026-05-10'), deposit(10_000, '2026-07-10'), deposit(20_000, '2026-08-10')];
    expect(averageMonthlyNet(movements, REFERENCE, 2)).toBe(15_000);
  });

  it('peut être négatif quand les retraits dominent', () => {
    const movements = [deposit(10_000, '2026-07-10'), withdrawal(30_000, '2026-08-10')];
    expect(averageMonthlyNet(movements, REFERENCE)).toBe(-10_000);
  });

  it('arrondit au centime', () => {
    expect(averageMonthlyNet([deposit(100, '2026-06-10')], REFERENCE)).toBe(33); // 100 / 3 mois
  });

  it("ignore les mouvements futurs et ne renvoie jamais NaN", () => {
    expect(averageMonthlyNet([deposit(50_000, '2026-11-10')], REFERENCE)).toBe(0);
  });
});

describe('projectBalances', () => {
  it('sans taux, progresse linéairement avec le versement mensuel', () => {
    const balances = projectBalances({
      startingBalance: 100_000,
      monthlyContribution: 10_000,
      annualRatePercent: 0,
      months: 12,
    });
    expect(balances).toHaveLength(13);
    expect(balances[0]).toBe(100_000);
    expect(balances[12]).toBe(220_000);
  });

  it('capitalise les intérêts chaque mois (12 % annuel = 1 % par mois)', () => {
    const balances = projectBalances({
      startingBalance: 100_000,
      monthlyContribution: 0,
      annualRatePercent: 12,
      months: 3,
    });
    expect(balances).toEqual([100_000, 101_000, 102_010, 103_030]); // 3e mois : 1 020,1 c d'intérêts, arrondis à 1 020 c
  });

  it("calcule les intérêts sur le solde d'ouverture puis ajoute le versement en fin de mois", () => {
    const balances = projectBalances({
      startingBalance: 100_000,
      monthlyContribution: 10_000,
      annualRatePercent: 12,
      months: 2,
    });
    expect(balances).toEqual([100_000, 111_000, 122_110]);
  });

  it('arrondit les intérêts au centime à chaque mois', () => {
    const balances = projectBalances({
      startingBalance: 100_050,
      monthlyContribution: 0,
      annualRatePercent: 3,
      months: 1,
    });
    expect(balances[1]).toBe(100_300); // 250,125 c => 250 c
  });

  it("ne génère pas d'intérêts sur un solde négatif", () => {
    const balances = projectBalances({
      startingBalance: -50_000,
      monthlyContribution: 0,
      annualRatePercent: 5,
      months: 6,
    });
    expect(new Set(balances)).toEqual(new Set([-50_000]));
  });

  it('diminue avec un versement net négatif', () => {
    const balances = projectBalances({
      startingBalance: 100_000,
      monthlyContribution: -10_000,
      annualRatePercent: 0,
      months: 3,
    });
    expect(balances).toEqual([100_000, 90_000, 80_000, 70_000]);
  });

  it("renvoie uniquement le solde de départ pour 0 mois", () => {
    expect(
      projectBalances({ startingBalance: 42, monthlyContribution: 10, annualRatePercent: 2, months: 0 }),
    ).toEqual([42]);
  });

  it('reste en centimes entiers sur 60 mois avec un taux « difficile »', () => {
    const balances = projectBalances({
      startingBalance: 123_457,
      monthlyContribution: 33_333,
      annualRatePercent: 2.75,
      months: 60,
    });
    expect(balances.every((balance) => Number.isSafeInteger(balance))).toBe(true);
    expect(balances[60]).toBeGreaterThan(123_457 + 60 * 33_333);
  });
});

describe('projectAccount', () => {
  it('combine solde courant, moyenne constatée et taux du compte', () => {
    const movements = [
      deposit(10_000, '2026-06-10'),
      deposit(10_000, '2026-07-10'),
      deposit(10_000, '2026-08-10'),
      deposit(50_000, '2026-01-10', 'autre'),
    ];
    const projection = projectAccount(account({ interestRate: 0 }), movements, REFERENCE);

    expect(projection.currentBalance).toBe(130_000);
    expect(projection.monthlyContribution).toBe(10_000);
    expect(projection.annualRate).toBe(0);
    expect(projection.points).toHaveLength(61);
    const free = (month: string, balance: number) => ({ month, balance, locked: 0, available: balance });
    expect(projection.points[0]).toEqual(free('2026-09', 130_000));
    expect(projection.points[12]).toEqual(free('2027-09', 130_000 + 12 * 10_000));
    expect(projection.points[60]).toEqual(free('2031-09', 130_000 + 60 * 10_000));
  });

  it('reste plat sans mouvement ni taux', () => {
    const projection = projectAccount(account(), [], REFERENCE);
    expect(projection.points.every((point) => point.balance === 100_000)).toBe(true);
  });

  it('applique les intérêts composés quand un taux est défini', () => {
    const projection = projectAccount(account({ initialBalance: 100_000, interestRate: 12 }), [], REFERENCE);
    expect(projection.points[1].balance).toBe(101_000);
    expect(projection.points[2].balance).toBe(102_010);
  });
});

describe('projection avec fonds bloqués', () => {
  const pee = (overrides: Partial<Account> = {}): Account => ({
    id: 'pee',
    name: 'PEE',
    type: 'SAVINGS',
    initialBalance: 0,
    ...overrides,
  });

  it('débloque chaque annuité d’un PEE 5 ans après son versement', () => {
    // Versements annuels bloqués 5 ans : déblocage en mars 2028, 2029 et 2030.
    const movements = [
      deposit(100_000, '2023-03-15', 'pee'),
      deposit(100_000, '2024-03-15', 'pee'),
      deposit(100_000, '2025-03-15', 'pee'),
    ];
    const { points } = projectAccount(pee({ depositLockYears: 5 }), movements, REFERENCE);
    const at = (index: number) => [points[index].locked, points[index].available];

    expect(at(0)).toEqual([300_000, 0]); // aujourd'hui
    expect(at(12)).toEqual([300_000, 0]); // sept. 2027
    expect(at(17)).toEqual([300_000, 0]); // fév. 2028 : rien n'est encore libre
    expect(at(18)).toEqual([200_000, 100_000]); // mars 2028 : la 1re annuité se libère
    expect(at(24)).toEqual([200_000, 100_000]);
    expect(at(36)).toEqual([100_000, 200_000]); // sept. 2029
    expect(at(60)).toEqual([0, 300_000]); // sept. 2031
  });

  it('libère les tranches saisies aux dates prévues, les intérêts restant disponibles', () => {
    const account = pee({
      initialBalance: 500_000,
      interestRate: 12,
      lockedTranches: [
        { amount: 200_000, unlockDate: '2027-01-10' },
        { amount: 300_000, unlockDate: '2028-01-10' },
      ],
    });
    const { points } = projectAccount(account, [], REFERENCE);

    expect(points[0]).toMatchObject({ balance: 500_000, locked: 500_000, available: 0 });
    expect(points[1]).toMatchObject({ balance: 505_000, locked: 500_000, available: 5_000 });
    expect(points[3].locked).toBe(500_000); // déc. 2026
    expect(points[4].locked).toBe(300_000); // janv. 2027 : 1re tranche libérée
    expect(points[4].available).toBe(points[4].balance - 300_000);
    expect(points[16].locked).toBe(0); // janv. 2028
  });

  it('bloque aussi les versements futurs projetés quand le compte bloque ses versements', () => {
    const account = pee({ initialBalance: 50_000, depositLockYears: 1 });
    const movements = [
      deposit(10_000, '2026-06-10', 'pee'),
      deposit(10_000, '2026-07-10', 'pee'),
      deposit(10_000, '2026-08-10', 'pee'),
    ];
    const projection = projectAccount(account, movements, REFERENCE);
    const { points } = projection;

    expect(projection.monthlyContribution).toBe(10_000);
    expect(points[0]).toMatchObject({ balance: 80_000, locked: 30_000, available: 50_000 });
    // mars 2027 : 3 versements passés (libres en juin-août 2027) + 6 versements projetés
    expect(points[6]).toMatchObject({ balance: 140_000, locked: 90_000, available: 50_000 });
    // sept. 2027 : les 3 versements passés sont libérés, les 12 projetés sont bloqués
    expect(points[12]).toMatchObject({ balance: 200_000, locked: 120_000, available: 80_000 });
    // régime permanent : toujours les 12 derniers mois de versements bloqués
    expect(points[24]).toMatchObject({ balance: 320_000, locked: 120_000, available: 200_000 });
    expect(points[60].locked).toBe(120_000);
  });

  it('laisse les versements projetés libres sans durée de blocage', () => {
    const movements = [deposit(10_000, '2026-06-10', 'pee'), deposit(10_000, '2026-08-10', 'pee')];
    const { points } = projectAccount(pee({ initialBalance: 50_000 }), movements, REFERENCE);
    expect(points.every((point) => point.locked === 0)).toBe(true);
  });

  it('ne bloque rien de plus quand les retraits l’emportent sur les versements', () => {
    const account = pee({
      initialBalance: 1_000_000,
      depositLockYears: 5,
      lockedTranches: [{ amount: 100_000, unlockDate: '2030-01-01' }],
    });
    const movements = [
      withdrawal(10_000, '2026-06-10', 'pee'),
      withdrawal(10_000, '2026-07-10', 'pee'),
      withdrawal(10_000, '2026-08-10', 'pee'),
    ];
    const projection = projectAccount(account, movements, REFERENCE);

    expect(projection.monthlyContribution).toBe(-10_000);
    expect(projection.points[0].locked).toBe(100_000);
    expect(projection.points[12].locked).toBe(100_000);
    expect(projection.points[60].locked).toBe(0); // 2030 est passé
  });

  it('plafonne le bloqué au solde quand des retraits vident le compte', () => {
    const account = pee({ initialBalance: 100_000, lockedTranches: [{ amount: 500_000, unlockDate: '2035-01-01' }] });
    expect(projectAccount(account, [], REFERENCE).points[0]).toMatchObject({ locked: 100_000, available: 0 });
  });

  it('cumule bloqué et déblocable de tous les comptes du portefeuille', () => {
    const accounts = [
      pee({ depositLockYears: 5 }),
      account({ id: 'courant', type: 'CHECKING', initialBalance: 500_000 }),
    ];
    const movements = [
      deposit(100_000, '2023-03-15', 'pee'),
      deposit(100_000, '2024-03-15', 'pee'),
      deposit(100_000, '2025-03-15', 'pee'),
    ];
    const portfolio = projectPortfolio(accounts, movements, REFERENCE);

    expect(portfolio.currentBalance).toBe(800_000);
    expect(portfolio.currentLocked).toBe(300_000);
    expect(portfolio.currentAvailable).toBe(500_000);
    expect(portfolio.horizons.map((horizon) => [horizon.months, horizon.locked, horizon.available])).toEqual([
      [12, 300_000, 500_000],
      [24, 200_000, 600_000],
      [36, 100_000, 700_000],
      [60, 0, 800_000],
    ]);
    for (const point of portfolio.points) expect(point.available).toBe(point.balance - point.locked);
  });
});

describe('projectPortfolio', () => {
  it('somme les projections de chaque compte à 1, 2, 3 et 5 ans', () => {
    const accounts = [
      account({ id: 'a1', initialBalance: 0 }),
      account({ id: 'a2', initialBalance: 100_000, interestRate: 12 }),
    ];
    const movements = [
      deposit(10_000, '2026-06-10', 'a1'),
      deposit(10_000, '2026-07-10', 'a1'),
      deposit(10_000, '2026-08-10', 'a1'),
    ];
    const portfolio = projectPortfolio(accounts, movements, REFERENCE);

    expect(portfolio.currentBalance).toBe(30_000 + 100_000);
    expect(portfolio.monthlyContribution).toBe(10_000);
    expect(portfolio.horizons.map((horizon) => horizon.months)).toEqual([...PROJECTION_HORIZONS]);

    const [first, second] = portfolio.accounts;
    for (const horizon of portfolio.horizons) {
      expect(horizon.balance).toBe(first.points[horizon.months].balance + second.points[horizon.months].balance);
    }
    // Compte sans taux : 30 000 c + 12 × 10 000 c ; compte à 12 % : 100 000 c × 1,01^12 (arrondi mois par mois).
    expect(first.points[12].balance).toBe(150_000);
    expect(portfolio.horizons[0].balance).toBe(150_000 + second.points[12].balance);
    expect(second.points[12].balance).toBeGreaterThan(112_600);
    expect(second.points[12].balance).toBeLessThan(112_700);
  });

  it("renvoie une projection nulle sans compte", () => {
    const portfolio = projectPortfolio([], [], REFERENCE);
    expect(portfolio.currentBalance).toBe(0);
    expect(portfolio.points).toHaveLength(61);
    expect(portfolio.horizons.every((horizon) => horizon.balance === 0)).toBe(true);
  });

  it('démarre au mois de référence', () => {
    const portfolio = projectPortfolio([account()], [], REFERENCE);
    expect(portfolio.points[0].month).toBe('2026-09');
    expect(portfolio.points[60].month).toBe('2031-09');
  });
});
