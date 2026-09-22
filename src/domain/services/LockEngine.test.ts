import { describe, expect, it } from 'vitest';
import type { Account } from '../models/Account';
import type { Movement } from '../models/Movement';
import { lockedAmountAt, lockLotsOf, unlockSchedule } from './LockEngine';
import { computeLocked } from './ProjectionEngine';

// 21 septembre 2026
const REFERENCE = new Date(2026, 8, 21);

const savings = (overrides: Partial<Account> = {}): Account => ({
  id: 'pee',
  name: 'PEE',
  type: 'SAVINGS',
  initialBalance: 0,
  ...overrides,
});
const deposit = (amount: number, date: string, accountId = 'pee'): Movement => ({
  id: `${accountId}-${date}-${amount}`,
  accountId,
  type: 'DEPOSIT',
  amount,
  date,
});
const withdrawal = (amount: number, date: string, accountId = 'pee'): Movement => ({
  ...deposit(amount, date, accountId),
  id: `w-${accountId}-${date}-${amount}`,
  type: 'WITHDRAWAL',
});

describe('lockLotsOf', () => {
  it('reprend les tranches saisies', () => {
    const account = savings({
      lockedTranches: [
        { amount: 100_000, unlockDate: '2028-03-15' },
        { amount: 200_000, unlockDate: '2029-03-15' },
      ],
    });
    expect(lockLotsOf(account, [])).toEqual(account.lockedTranches);
  });

  it('bloque chaque versement N ans si le compte le demande, et pas les retraits', () => {
    const account = savings({ depositLockYears: 5 });
    const lots = lockLotsOf(account, [
      deposit(100_000, '2025-03-15'),
      deposit(50_000, '2026-01-31'),
      withdrawal(10_000, '2026-02-01'),
      deposit(999_999, '2026-01-01', 'autre'),
    ]);
    expect(lots).toEqual([
      { amount: 100_000, unlockDate: '2030-03-15' },
      { amount: 50_000, unlockDate: '2031-01-31' },
    ]);
  });

  it('laisse les versements libres sans durée de blocage', () => {
    expect(lockLotsOf(savings(), [deposit(100_000, '2026-01-01')])).toEqual([]);
  });

  it('combine le stock saisi et les versements bloqués', () => {
    const account = savings({ lockedTranches: [{ amount: 300_000, unlockDate: '2027-01-01' }], depositLockYears: 2 });
    expect(lockLotsOf(account, [deposit(10_000, '2026-06-01')])).toEqual([
      { amount: 300_000, unlockDate: '2027-01-01' },
      { amount: 10_000, unlockDate: '2028-06-01' },
    ]);
  });

  it('reprend une tranche « disponible à la retraite » sans date', () => {
    const account = savings({ lockedTranches: [{ amount: 300_000, unlockAtRetirement: true }] });
    expect(lockLotsOf(account, [])).toEqual([{ amount: 300_000, unlockDate: undefined }]);
  });

  it('ne bloque jamais un compte courant', () => {
    const account: Account = {
      id: 'c',
      name: 'Courant',
      type: 'CHECKING',
      initialBalance: 0,
      lockedTranches: [{ amount: 100, unlockDate: '2030-01-01' }],
      depositLockYears: 5,
    };
    expect(lockLotsOf(account, [deposit(100, '2026-01-01', 'c')])).toEqual([]);
  });
});

describe('lockedAmountAt', () => {
  const lots = [
    { amount: 100_000, unlockDate: '2027-03-15' },
    { amount: 200_000, unlockDate: '2028-03-15' },
  ];

  it('compte les lots pas encore débloqués', () => {
    expect(lockedAmountAt(lots, '2026-09-21', 1_000_000)).toBe(300_000);
    expect(lockedAmountAt(lots, '2027-06-01', 1_000_000)).toBe(200_000);
    expect(lockedAmountAt(lots, '2028-06-01', 1_000_000)).toBe(0);
  });

  it('débloque un lot le jour même de sa date', () => {
    expect(lockedAmountAt(lots, '2027-03-14', 1_000_000)).toBe(300_000);
    expect(lockedAmountAt(lots, '2027-03-15', 1_000_000)).toBe(200_000);
  });

  it('ne dépasse jamais le solde du compte', () => {
    expect(lockedAmountAt(lots, '2026-09-21', 120_000)).toBe(120_000);
    expect(lockedAmountAt(lots, '2026-09-21', 0)).toBe(0);
    expect(lockedAmountAt(lots, '2026-09-21', -50_000)).toBe(0);
  });

  it('compte un lot sans date (retraite) comme bloqué à n’importe quelle date', () => {
    const withRetirement = [...lots, { amount: 50_000, unlockDate: undefined }];
    expect(lockedAmountAt(withRetirement, '2026-09-21', 1_000_000)).toBe(350_000);
    expect(lockedAmountAt(withRetirement, '2099-01-01', 1_000_000)).toBe(50_000);
  });
});

describe('computeLocked', () => {
  it('utilise le solde du compte pour plafonner le bloqué', () => {
    const account = savings({
      initialBalance: 100_000,
      lockedTranches: [{ amount: 500_000, unlockDate: '2030-01-01' }],
    });
    expect(computeLocked(account, [], REFERENCE)).toBe(100_000);
    expect(computeLocked(account, [deposit(50_000, '2026-01-01')], REFERENCE)).toBe(150_000);
  });

  it('vaut zéro sans blocage', () => {
    expect(computeLocked(savings({ initialBalance: 100_000 }), [], REFERENCE)).toBe(0);
  });

  it('bloque indéfiniment une tranche « disponible à la retraite »', () => {
    const account = savings({ initialBalance: 500_000, lockedTranches: [{ amount: 300_000, unlockAtRetirement: true }] });
    expect(computeLocked(account, [], REFERENCE)).toBe(300_000);
    expect(computeLocked(account, [], new Date(2060, 0, 1))).toBe(300_000);
  });
});

describe('unlockSchedule', () => {
  it('liste les déblocages à venir par compte et par mois, du plus proche au plus lointain', () => {
    const accounts = [
      savings({
        lockedTranches: [
          { amount: 100_000, unlockDate: '2027-03-01' },
          { amount: 50_000, unlockDate: '2027-03-20' },
          { amount: 200_000, unlockDate: '2026-01-01' }, // déjà débloqué
        ],
      }),
      savings({ id: 'per', name: 'PER', lockedTranches: [{ amount: 70_000, unlockDate: '2026-12-31' }] }),
    ];
    expect(unlockSchedule(accounts, [], REFERENCE)).toEqual([
      { accountId: 'per', month: '2026-12', amount: 70_000 },
      { accountId: 'pee', month: '2027-03', amount: 150_000 },
    ]);
  });

  it('inclut les versements bloqués', () => {
    const accounts = [savings({ depositLockYears: 1 })];
    const schedule = unlockSchedule(accounts, [deposit(10_000, '2026-01-10'), deposit(20_000, '2026-01-25')], REFERENCE);
    expect(schedule).toEqual([{ accountId: 'pee', month: '2027-01', amount: 30_000 }]);
  });

  it('est vide sans blocage', () => {
    expect(unlockSchedule([savings()], [deposit(10_000, '2026-01-10')], REFERENCE)).toEqual([]);
  });

  it('omet une tranche « disponible à la retraite » (date inconnue)', () => {
    const accounts = [
      savings({
        lockedTranches: [
          { amount: 100_000, unlockDate: '2027-03-01' },
          { amount: 300_000, unlockAtRetirement: true },
        ],
      }),
    ];
    expect(unlockSchedule(accounts, [], REFERENCE)).toEqual([{ accountId: 'pee', month: '2027-03', amount: 100_000 }]);
  });
});
