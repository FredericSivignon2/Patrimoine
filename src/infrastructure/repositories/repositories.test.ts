import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../domain/models/errors';
import { MockStorageDriver } from '../storage/MockStorageDriver';
import { PatrimoineStore } from '../storage/PatrimoineStore';
import type { NewLoan } from '../../domain/models/Loan';
import type { NewProperty } from '../../domain/models/Property';
import { AccountRepository } from './AccountRepository';
import { BankRepository } from './BankRepository';
import { BudgetRepository } from './BudgetRepository';
import { LoanRepository } from './LoanRepository';
import { MovementRepository } from './MovementRepository';
import { PropertyRepository } from './PropertyRepository';
import { SettingsRepository } from './SettingsRepository';

let driver: MockStorageDriver;
let store: PatrimoineStore;
let accounts: AccountRepository;
let movements: MovementRepository;
let settings: SettingsRepository;
let budgets: BudgetRepository;
let loans: LoanRepository;
let banks: BankRepository;
let properties: PropertyRepository;

beforeEach(async () => {
  driver = new MockStorageDriver();
  store = new PatrimoineStore(driver);
  await store.load();
  accounts = new AccountRepository(store);
  movements = new MovementRepository(store);
  settings = new SettingsRepository(store);
  budgets = new BudgetRepository(store);
  loans = new LoanRepository(store);
  banks = new BankRepository(store);
  properties = new PropertyRepository(store);
});

describe('AccountRepository', () => {
  it('crée un compte avec un id et le persiste', async () => {
    const account = await accounts.create({ name: '  Livret A ', type: 'SAVINGS', initialBalance: 50_000, interestRate: 2.4 });

    expect(account).toMatchObject({ name: 'Livret A', type: 'SAVINGS', initialBalance: 50_000, interestRate: 2.4 });
    expect(account.id).toBeTruthy();
    expect(await accounts.list()).toEqual([account]);
    expect(await accounts.getById(account.id)).toEqual(account);
    expect(driver.stored?.accounts).toEqual([account]);
  });

  it('ignore le taux sur un compte courant', async () => {
    const account = await accounts.create({ name: 'Courant', type: 'CHECKING', initialBalance: 0, interestRate: 3 });
    expect(account.interestRate).toBeUndefined();
  });

  it.each([
    ['un nom vide', { name: '   ', type: 'CHECKING', initialBalance: 0 } as const],
    ['un solde décimal', { name: 'x', type: 'CHECKING', initialBalance: 10.5 } as const],
    ['un taux hors bornes', { name: 'x', type: 'SAVINGS', initialBalance: 0, interestRate: 150 } as const],
    ['un taux négatif', { name: 'x', type: 'SAVINGS', initialBalance: 0, interestRate: -2 } as const],
  ])('refuse %s', async (_label, input) => {
    await expect(accounts.create(input)).rejects.toBeInstanceOf(ValidationError);
    expect(await accounts.list()).toEqual([]);
  });

  it('modifie un compte et peut retirer son taux', async () => {
    const account = await accounts.create({ name: 'Livret', type: 'SAVINGS', initialBalance: 0, interestRate: 2 });

    const renamed = await accounts.update(account.id, { name: 'Livret A' });
    expect(renamed).toMatchObject({ id: account.id, name: 'Livret A', interestRate: 2 });

    const withoutRate = await accounts.update(account.id, { interestRate: undefined });
    expect(withoutRate.interestRate).toBeUndefined();
  });

  it("signale un compte inexistant", async () => {
    await expect(accounts.update('inconnu', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(accounts.remove('inconnu')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('supprime un compte avec ses mouvements uniquement', async () => {
    const a = await accounts.create({ name: 'A', type: 'CHECKING', initialBalance: 0 });
    const b = await accounts.create({ name: 'B', type: 'SAVINGS', initialBalance: 0 });
    await movements.create({ accountId: a.id, type: 'DEPOSIT', amount: 100, date: '2026-01-01' });
    const kept = await movements.create({ accountId: b.id, type: 'DEPOSIT', amount: 200, date: '2026-01-02' });

    await accounts.remove(a.id);

    expect(await accounts.list()).toEqual([b]);
    expect(await movements.list()).toEqual([kept]);
    expect(driver.stored?.movements).toEqual([kept]);
  });

  it('rattache un compte à une banque existante, et refuse une banque inconnue', async () => {
    const bank = await banks.create({ name: 'LCL' });
    const account = await accounts.create({ name: 'Livret', type: 'SAVINGS', initialBalance: 0, bankId: bank.id });
    expect(account.bankId).toBe(bank.id);

    await expect(
      accounts.create({ name: 'x', type: 'CHECKING', initialBalance: 0, bankId: 'inconnue' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('AccountRepository : fonds bloqués', () => {
  it('enregistre les tranches triées par date et la durée de blocage des versements', async () => {
    const account = await accounts.create({
      name: 'PEE',
      type: 'SAVINGS',
      initialBalance: 500_000,
      depositLockYears: 5,
      lockedTranches: [
        { amount: 300_000, unlockDate: '2029-03-15' },
        { amount: 200_000, unlockDate: '2028-03-15' },
      ],
    });

    expect(account.depositLockYears).toBe(5);
    expect(account.lockedTranches).toEqual([
      { amount: 200_000, unlockDate: '2028-03-15' },
      { amount: 300_000, unlockDate: '2029-03-15' },
    ]);
    expect(driver.stored?.accounts[0]).toEqual(account);
  });

  it('ignore les fonds bloqués sur un compte courant', async () => {
    const account = await accounts.create({
      name: 'Courant',
      type: 'CHECKING',
      initialBalance: 0,
      depositLockYears: 5,
      lockedTranches: [{ amount: 100, unlockDate: '2030-01-01' }],
    });
    expect(account.lockedTranches).toBeUndefined();
    expect(account.depositLockYears).toBeUndefined();
  });

  it('traite une durée nulle ou une liste vide comme une absence de blocage', async () => {
    const account = await accounts.create({
      name: 'Livret',
      type: 'SAVINGS',
      initialBalance: 0,
      depositLockYears: 0,
      lockedTranches: [],
    });
    expect('depositLockYears' in account).toBe(false);
    expect('lockedTranches' in account).toBe(false);
  });

  it.each([
    ['un montant nul', { lockedTranches: [{ amount: 0, unlockDate: '2030-01-01' }] }],
    ['un montant décimal', { lockedTranches: [{ amount: 10.5, unlockDate: '2030-01-01' }] }],
    ['une date impossible', { lockedTranches: [{ amount: 100, unlockDate: '2030-02-30' }] }],
    ['une durée décimale', { depositLockYears: 2.5 }],
    ['une durée négative', { depositLockYears: -1 }],
    ['une durée excessive', { depositLockYears: 51 }],
  ])('refuse %s', async (_label, locks) => {
    await expect(
      accounts.create({ name: 'PEE', type: 'SAVINGS', initialBalance: 0, ...locks }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await accounts.list()).toEqual([]);
  });

  it('conserve les tranches lors d’une modification du nom, et les efface quand on les retire', async () => {
    const account = await accounts.create({
      name: 'PEE',
      type: 'SAVINGS',
      initialBalance: 0,
      depositLockYears: 5,
      lockedTranches: [{ amount: 100_000, unlockDate: '2030-01-01' }],
    });

    const renamed = await accounts.update(account.id, { name: 'PEE Entreprise' });
    expect(renamed.lockedTranches).toEqual(account.lockedTranches);
    expect(renamed.depositLockYears).toBe(5);

    const cleared = await accounts.update(account.id, { lockedTranches: [], depositLockYears: undefined });
    expect('lockedTranches' in cleared).toBe(false);
    expect('depositLockYears' in cleared).toBe(false);
  });

  it('efface les fonds bloqués quand un compte d’épargne devient un compte courant', async () => {
    const account = await accounts.create({
      name: 'Compte',
      type: 'SAVINGS',
      initialBalance: 0,
      lockedTranches: [{ amount: 100_000, unlockDate: '2030-01-01' }],
    });
    const converted = await accounts.update(account.id, { type: 'CHECKING' });
    expect(converted.lockedTranches).toBeUndefined();
  });
});

describe('SettingsRepository', () => {
  it('n’a pas de seuil tant qu’aucun n’est défini', async () => {
    expect(await settings.getSafety()).toBeUndefined();
  });

  it('enregistre, relit et supprime l’épargne de sécurité', async () => {
    const saved = await settings.saveSafety({ threshold: 1_000_000, comfortMargin: 500_000 });
    expect(saved).toEqual({ threshold: 1_000_000, comfortMargin: 500_000 });
    expect(await settings.getSafety()).toEqual(saved);
    expect(driver.stored?.safety).toEqual(saved);

    await settings.clearSafety();
    expect(await settings.getSafety()).toBeUndefined();
    expect(driver.stored && 'safety' in driver.stored).toBe(false);
  });

  it('remplace le seuil existant et laisse comptes et mouvements intacts', async () => {
    const account = await accounts.create({ name: 'A', type: 'CHECKING', initialBalance: 100 });
    await settings.saveSafety({ threshold: 100, comfortMargin: 0 });
    await settings.saveSafety({ threshold: 200, comfortMargin: 50 });

    expect(await settings.getSafety()).toEqual({ threshold: 200, comfortMargin: 50 });
    expect(await accounts.list()).toEqual([account]);
  });

  it.each([
    ['un seuil négatif', { threshold: -1, comfortMargin: 0 }],
    ['un seuil décimal', { threshold: 10.5, comfortMargin: 0 }],
    ['une marge négative', { threshold: 0, comfortMargin: -1 }],
  ])('refuse %s', async (_label, invalid) => {
    await expect(settings.saveSafety(invalid)).rejects.toBeInstanceOf(ValidationError);
    expect(await settings.getSafety()).toBeUndefined();
  });

  it('n’a pas d’effort d’épargne configuré tant que rien n’est enregistré', async () => {
    expect(await settings.getSavingsEffort()).toBeUndefined();
  });

  it('enregistre, relit et supprime l’effort d’épargne', async () => {
    const input = { incomeSources: [{ name: '  Salaire  ', monthlyAmount: 300_000 }], targetRatePercent: 20 };
    const saved = await settings.saveSavingsEffort(input);
    expect(saved).toEqual({ incomeSources: [{ name: 'Salaire', monthlyAmount: 300_000 }], targetRatePercent: 20 });
    expect(await settings.getSavingsEffort()).toEqual(saved);
    expect(driver.stored?.savingsEffort).toEqual(saved);

    await settings.clearSavingsEffort();
    expect(await settings.getSavingsEffort()).toBeUndefined();
    expect(driver.stored && 'savingsEffort' in driver.stored).toBe(false);
  });

  it('accepte une liste de revenus vide', async () => {
    const saved = await settings.saveSavingsEffort({ incomeSources: [], targetRatePercent: 15 });
    expect(saved.incomeSources).toEqual([]);
  });

  it.each([
    ['un revenu sans nom', { incomeSources: [{ name: '  ', monthlyAmount: 100_000 }], targetRatePercent: 20 }],
    ['un revenu au montant nul', { incomeSources: [{ name: 'Salaire', monthlyAmount: 0 }], targetRatePercent: 20 }],
    ['un revenu au montant décimal', { incomeSources: [{ name: 'Salaire', monthlyAmount: 10.5 }], targetRatePercent: 20 }],
    ['un taux négatif', { incomeSources: [], targetRatePercent: -1 }],
    ['un taux supérieur à 100 %', { incomeSources: [], targetRatePercent: 120 }],
  ])('refuse %s', async (_label, invalid) => {
    await expect(settings.saveSavingsEffort(invalid)).rejects.toBeInstanceOf(ValidationError);
    expect(await settings.getSavingsEffort()).toBeUndefined();
  });
});

describe('BudgetRepository', () => {
  it('crée un poste avec un id et le persiste', async () => {
    const budget = await budgets.create({ name: '  Vacances ', percent: 25 });

    expect(budget).toMatchObject({ name: 'Vacances', percent: 25 });
    expect(budget.id).toBeTruthy();
    expect(await budgets.list()).toEqual([budget]);
    expect(driver.stored?.budgets).toEqual([budget]);
  });

  it('arrondit le pourcentage à 2 décimales', async () => {
    expect((await budgets.create({ name: 'A', percent: 12.3456 })).percent).toBe(12.35);
  });

  it('enregistre un objectif : montant visé et échéance', async () => {
    const budget = await budgets.create({
      name: 'Voiture',
      percent: 20,
      targetAmount: 1_500_000,
      targetDate: '2028-06-30',
    });
    expect(budget).toMatchObject({ targetAmount: 1_500_000, targetDate: '2028-06-30' });
    expect(driver.stored?.budgets[0]).toEqual(budget);
  });

  it('ne garde aucun champ d’objectif quand il n’y en a pas', async () => {
    const budget = await budgets.create({ name: 'Vacances', percent: 20 });
    expect('targetAmount' in budget).toBe(false);
    expect('targetDate' in budget).toBe(false);
  });

  it.each([
    ['un montant sans échéance', { targetAmount: 100_000 }],
    ['une échéance sans montant', { targetDate: '2028-06-30' }],
    ['un montant nul', { targetAmount: 0, targetDate: '2028-06-30' }],
    ['un montant décimal', { targetAmount: 100.5, targetDate: '2028-06-30' }],
    ['une échéance impossible', { targetAmount: 100_000, targetDate: '2028-02-30' }],
  ])('refuse un objectif avec %s', async (_label, objective) => {
    await expect(budgets.create({ name: 'Voiture', percent: 10, ...objective })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await budgets.list()).toEqual([]);
  });

  it('conserve l’objectif lors d’une modification et l’efface quand on le retire', async () => {
    const budget = await budgets.create({ name: 'Voiture', percent: 10, targetAmount: 100_000, targetDate: '2028-06-30' });

    const renamed = await budgets.update(budget.id, { name: 'Future voiture' });
    expect(renamed).toMatchObject({ targetAmount: 100_000, targetDate: '2028-06-30' });

    const changed = await budgets.update(budget.id, { targetAmount: 250_000, targetDate: '2029-01-15' });
    expect(changed).toMatchObject({ targetAmount: 250_000, targetDate: '2029-01-15' });

    const cleared = await budgets.update(budget.id, { targetAmount: undefined, targetDate: undefined });
    expect('targetAmount' in cleared).toBe(false);
    expect('targetDate' in cleared).toBe(false);
  });

  it('accepte un poste à 0 % (poste en préparation)', async () => {
    expect((await budgets.create({ name: 'Voiture', percent: 0 })).percent).toBe(0);
  });

  it.each([
    ['un nom vide', { name: '   ', percent: 10 }],
    ['un pourcentage négatif', { name: 'A', percent: -1 }],
    ['un pourcentage supérieur à 100', { name: 'A', percent: 100.5 }],
    ['un pourcentage non numérique', { name: 'A', percent: Number.NaN }],
  ])('refuse %s', async (_label, input) => {
    await expect(budgets.create(input)).rejects.toBeInstanceOf(ValidationError);
    expect(await budgets.list()).toEqual([]);
  });

  it('plafonne la somme des pourcentages à 100 %', async () => {
    await budgets.create({ name: 'Vacances', percent: 60 });
    await expect(budgets.create({ name: 'Travaux', percent: 40.01 })).rejects.toThrow(/il reste 40 % à répartir/);
    await expect(budgets.create({ name: 'Travaux', percent: 50 })).rejects.toBeInstanceOf(ValidationError);

    const exact = await budgets.create({ name: 'Voiture', percent: 40 }); // 100 % pile : accepté
    expect(exact.percent).toBe(40);
    await expect(budgets.create({ name: 'Autre', percent: 0.01 })).rejects.toThrow(/il reste 0 % à répartir/);
  });

  it('indique le reste avec une virgule décimale', async () => {
    await budgets.create({ name: 'Vacances', percent: 62.5 });
    await expect(budgets.create({ name: 'Travaux', percent: 40 })).rejects.toThrow(/il reste 37,5 % à répartir/);
  });

  it('modifie un poste en ignorant sa propre part dans le plafond', async () => {
    const vacances = await budgets.create({ name: 'Vacances', percent: 60 });
    await budgets.create({ name: 'Travaux', percent: 30 });

    const renamed = await budgets.update(vacances.id, { name: 'Grandes vacances' });
    expect(renamed).toMatchObject({ id: vacances.id, name: 'Grandes vacances', percent: 60 });

    expect((await budgets.update(vacances.id, { percent: 70 })).percent).toBe(70); // 70 + 30 = 100
    await expect(budgets.update(vacances.id, { percent: 71 })).rejects.toBeInstanceOf(ValidationError);
    expect((await budgets.list()).find((budget) => budget.id === vacances.id)?.percent).toBe(70);
  });

  it('supprime un poste et libère son pourcentage', async () => {
    const vacances = await budgets.create({ name: 'Vacances', percent: 80 });
    await budgets.remove(vacances.id);
    expect(await budgets.list()).toEqual([]);
    expect((await budgets.create({ name: 'Travaux', percent: 100 })).percent).toBe(100);
  });

  it('signale un poste inexistant', async () => {
    await expect(budgets.update('inconnu', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(budgets.remove('inconnu')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('n’est pas touché par la suppression d’un compte', async () => {
    const account = await accounts.create({ name: 'A', type: 'CHECKING', initialBalance: 0 });
    const budget = await budgets.create({ name: 'Vacances', percent: 25 });
    await accounts.remove(account.id);
    expect(await budgets.list()).toEqual([budget]);
  });

  it('détache les retraits d’un poste supprimé sans les supprimer', async () => {
    const account = await accounts.create({ name: 'A', type: 'SAVINGS', initialBalance: 0 });
    const vacances = await budgets.create({ name: 'Vacances', percent: 25 });
    const travaux = await budgets.create({ name: 'Travaux', percent: 25 });
    const tagged = await movements.create({ accountId: account.id, type: 'WITHDRAWAL', amount: 500, date: '2026-01-01', budgetId: vacances.id });
    const other = await movements.create({ accountId: account.id, type: 'WITHDRAWAL', amount: 300, date: '2026-01-02', budgetId: travaux.id });

    await budgets.remove(vacances.id);

    const remaining = await movements.list();
    expect(remaining).toHaveLength(2);
    expect(remaining.find((movement) => movement.id === tagged.id)).toEqual({
      id: tagged.id,
      accountId: account.id,
      type: 'WITHDRAWAL',
      amount: 500,
      date: '2026-01-01',
    });
    expect(remaining.find((movement) => movement.id === other.id)?.budgetId).toBe(travaux.id);
    expect(driver.stored?.movements.some((movement) => movement.budgetId === vacances.id)).toBe(false);
  });
});

describe('MovementRepository : rattachement à un poste', () => {
  it('rattache un retrait à un poste existant', async () => {
    const account = await accounts.create({ name: 'A', type: 'SAVINGS', initialBalance: 0 });
    const budget = await budgets.create({ name: 'Vacances', percent: 25 });
    const movement = await movements.create({
      accountId: account.id,
      type: 'WITHDRAWAL',
      amount: 12_000,
      date: '2026-07-10',
      budgetId: budget.id,
    });
    expect(movement.budgetId).toBe(budget.id);
    expect(driver.stored?.movements[0].budgetId).toBe(budget.id);
  });

  it('refuse un poste inconnu et le rattachement d’un versement', async () => {
    const account = await accounts.create({ name: 'A', type: 'SAVINGS', initialBalance: 0 });
    const budget = await budgets.create({ name: 'Vacances', percent: 25 });
    const base = { accountId: account.id, amount: 100, date: '2026-01-01' } as const;

    await expect(movements.create({ ...base, type: 'WITHDRAWAL', budgetId: 'inconnu' })).rejects.toBeInstanceOf(ValidationError);
    await expect(movements.create({ ...base, type: 'DEPOSIT', budgetId: budget.id })).rejects.toThrow(/seul un retrait/i);
    expect(await movements.list()).toEqual([]);
  });

  it('détache ou change le poste d’un retrait, et refuse d’en faire un versement rattaché', async () => {
    const account = await accounts.create({ name: 'A', type: 'SAVINGS', initialBalance: 0 });
    const vacances = await budgets.create({ name: 'Vacances', percent: 25 });
    const travaux = await budgets.create({ name: 'Travaux', percent: 25 });
    const movement = await movements.create({ accountId: account.id, type: 'WITHDRAWAL', amount: 500, date: '2026-01-01', budgetId: vacances.id });

    expect((await movements.update(movement.id, { budgetId: travaux.id })).budgetId).toBe(travaux.id);
    await expect(movements.update(movement.id, { type: 'DEPOSIT' })).rejects.toBeInstanceOf(ValidationError);

    const detached = await movements.update(movement.id, { budgetId: undefined });
    expect('budgetId' in detached).toBe(false);
    expect((await movements.update(movement.id, { type: 'DEPOSIT' })).type).toBe('DEPOSIT'); // plus rattaché : possible
  });
});

describe('LoanRepository', () => {
  const input: NewLoan = {
    name: '  Prêt immobilier ',
    kind: 'MORTGAGE',
    principal: 9_500_000,
    annualRate: 1.3,
    monthlyPayment: 69_000,
    monthlyInsurance: 2_800,
    firstPaymentDate: '2026-10-05',
  };

  it('crée un prêt et le persiste', async () => {
    const loan = await loans.create(input);
    expect(loan).toMatchObject({ ...input, name: 'Prêt immobilier' });
    expect(loan.id).toBeTruthy();
    expect(await loans.list()).toEqual([loan]);
    expect(driver.stored?.loans).toEqual([loan]);
  });

  it('accepte un prêt à taux zéro sans assurance', async () => {
    const loan = await loans.create({
      name: 'Éco-PTZ',
      kind: 'RENOVATION',
      principal: 1_500_000,
      annualRate: 0,
      monthlyPayment: 12_500,
      monthlyInsurance: 0,
      firstPaymentDate: '2027-01-15',
    });
    expect(loan.annualRate).toBe(0);
    expect('monthlyInsurance' in loan).toBe(false);
  });

  it('arrondit le taux à 2 décimales', async () => {
    expect((await loans.create({ ...input, annualRate: 1.456 })).annualRate).toBe(1.46);
  });

  it.each([
    ['un nom vide', { name: '  ' }],
    ['un capital nul', { principal: 0 }],
    ['un capital décimal', { principal: 100.5 }],
    ['un taux négatif', { annualRate: -1 }],
    ['un taux supérieur à 100 %', { annualRate: 120 }],
    ['une mensualité nulle', { monthlyPayment: 0 }],
    ['une assurance négative', { monthlyInsurance: -1 }],
    ['une date impossible', { firstPaymentDate: '2026-02-30' }],
  ])('refuse %s', async (_label, override) => {
    await expect(loans.create({ ...input, ...override })).rejects.toBeInstanceOf(ValidationError);
    expect(await loans.list()).toEqual([]);
  });

  it('refuse une mensualité qui ne couvre pas les intérêts', async () => {
    await expect(
      loans.create({ ...input, principal: 10_000_000, annualRate: 12, monthlyPayment: 100_000 }), // 1 000 € d'intérêts par mois
    ).rejects.toThrow(/ne couvre pas les intérêts/i);
  });

  it('refuse un prêt qui durerait plus de 50 ans', async () => {
    await expect(
      loans.create({ ...input, principal: 100_000_000, annualRate: 0, monthlyPayment: 1_000 }),
    ).rejects.toThrow(/plus de 50 ans/i);
  });

  it('modifie un prêt en revalidant son échéancier, et peut retirer l’assurance', async () => {
    const loan = await loans.create(input);

    const renamed = await loans.update(loan.id, { name: 'Prêt principal' });
    expect(renamed).toMatchObject({ name: 'Prêt principal', principal: 9_500_000, monthlyInsurance: 2_800 });

    await expect(loans.update(loan.id, { monthlyPayment: 1_000 })).rejects.toBeInstanceOf(ValidationError);
    expect((await loans.list())[0].monthlyPayment).toBe(69_000);

    const noInsurance = await loans.update(loan.id, { monthlyInsurance: undefined });
    expect('monthlyInsurance' in noInsurance).toBe(false);
  });

  it('supprime un prêt et signale un prêt inexistant', async () => {
    const loan = await loans.create(input);
    await loans.remove(loan.id);
    expect(await loans.list()).toEqual([]);
    await expect(loans.remove(loan.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(loans.update('inconnu', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('détache le bien immobilier rattaché quand son prêt est supprimé', async () => {
    const loan = await loans.create(input);
    const property = await properties.create({
      name: 'Appartement loué',
      estimatedValue: 20_000_000,
      sellingFeePercent: 8,
      loanId: loan.id,
    });

    await loans.remove(loan.id);

    const remaining = (await properties.list())[0];
    expect(remaining).toMatchObject({ id: property.id, name: 'Appartement loué' });
    expect(remaining).not.toHaveProperty('loanId');
  });

  it('rattache un prêt à une banque existante, et refuse une banque inconnue', async () => {
    const bank = await banks.create({ name: 'LCL' });
    const loan = await loans.create({ ...input, bankId: bank.id });
    expect(loan.bankId).toBe(bank.id);

    await expect(loans.create({ ...input, bankId: 'inconnue' })).rejects.toBeInstanceOf(ValidationError);
  });

  describe('remboursements anticipés', () => {
    const conso: NewLoan = {
      name: 'Prêt conso',
      kind: 'CONSUMER',
      principal: 800_000,
      annualRate: 4.9,
      monthlyPayment: 19_000,
      firstPaymentDate: '2026-10-25',
    };

    it('enregistre les remboursements anticipés triés par date, sans champ superflu', async () => {
      const loan = await loans.create({
        ...conso,
        prepayments: [
          { date: '2027-06-25', amount: 100_000, effect: 'PAYMENT' },
          { date: '2027-03-25', amount: 300_000, effect: 'DURATION' },
        ],
      });
      expect(loan.prepayments).toEqual([
        { date: '2027-03-25', amount: 300_000, effect: 'DURATION' },
        { date: '2027-06-25', amount: 100_000, effect: 'PAYMENT' },
      ]);
      expect(driver.stored?.loans[0].prepayments).toHaveLength(2);
    });

    it('n’écrit pas de liste vide', async () => {
      const loan = await loans.create({ ...conso, prepayments: [] });
      expect('prepayments' in loan).toBe(false);
    });

    it.each([
      ['un montant nul', { date: '2027-03-25', amount: 0, effect: 'DURATION' as const }],
      ['un montant décimal', { date: '2027-03-25', amount: 10.5, effect: 'DURATION' as const }],
      ['une date impossible', { date: '2027-02-30', amount: 100_000, effect: 'DURATION' as const }],
      ['une date vide', { date: '', amount: 100_000, effect: 'DURATION' as const }],
    ])('refuse un remboursement anticipé avec %s', async (_label, prepayment) => {
      await expect(loans.create({ ...conso, prepayments: [prepayment] })).rejects.toBeInstanceOf(ValidationError);
      expect(await loans.list()).toEqual([]);
    });

    it('modifie, puis retire, les remboursements anticipés d’un prêt existant', async () => {
      const loan = await loans.create(conso);

      const prepaid = await loans.update(loan.id, {
        prepayments: [{ date: '2027-03-25', amount: 300_000, effect: 'DURATION' }],
      });
      expect(prepaid.prepayments).toHaveLength(1);
      expect(prepaid.name).toBe('Prêt conso');

      const renamed = await loans.update(loan.id, { name: 'Prêt travaux' });
      expect(renamed.prepayments).toHaveLength(1); // conservés quand le patch n'en parle pas

      const cleared = await loans.update(loan.id, { prepayments: [] });
      expect('prepayments' in cleared).toBe(false);
    });

    it('accepte un remboursement anticipé supérieur au capital restant dû : le calcul le plafonne', async () => {
      const loan = await loans.create({
        ...conso,
        prepayments: [{ date: '2026-10-25', amount: 5_000_000, effect: 'DURATION' }], // plafonné au capital restant dû
      });
      expect(loan.prepayments).toHaveLength(1);
    });
  });

  describe('fonds réservés', () => {
    const conso: NewLoan = {
      name: 'Prêt conso travaux',
      kind: 'CONSUMER',
      principal: 1_400_000,
      annualRate: 0,
      monthlyPayment: 100_000,
      firstPaymentDate: '2026-10-25',
    };

    it('enregistre des fonds réservés répartis sur plusieurs comptes, avec note et date', async () => {
      const ldd = await accounts.create({ name: 'LDD', type: 'SAVINGS', initialBalance: 800_000 });
      const livretA = await accounts.create({ name: 'Livret A', type: 'SAVINGS', initialBalance: 600_000 });
      const loan = await loans.create({
        ...conso,
        reservedFunds: {
          note: '  À verser à l’artisan  ',
          since: '2026-06-10',
          allocations: [
            { accountId: ldd.id, amount: 500_000 },
            { accountId: livretA.id, amount: 300_000 },
          ],
        },
      });

      expect(loan.reservedFunds).toEqual({
        note: 'À verser à l’artisan',
        since: '2026-06-10',
        allocations: [
          { accountId: ldd.id, amount: 500_000 },
          { accountId: livretA.id, amount: 300_000 },
        ],
      });
      expect(driver.stored?.loans[0].reservedFunds).toEqual(loan.reservedFunds);
    });

    it('accepte des fonds réservés sans note ni date', async () => {
      const account = await accounts.create({ name: 'Livret A', type: 'SAVINGS', initialBalance: 600_000 });
      const loan = await loans.create({ ...conso, reservedFunds: { allocations: [{ accountId: account.id, amount: 100_000 }] } });
      expect(loan.reservedFunds).toEqual({ allocations: [{ accountId: account.id, amount: 100_000 }] });
    });

    it('n’écrit pas de fonds réservés sans allocation', async () => {
      const loan = await loans.create({ ...conso, reservedFunds: { note: 'Rien à réserver', allocations: [] } });
      expect('reservedFunds' in loan).toBe(false);
    });

    it('refuse un compte introuvable', async () => {
      await expect(
        loans.create({ ...conso, reservedFunds: { allocations: [{ accountId: 'inconnu', amount: 100_000 }] } }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('refuse un compte répété dans le même prêt', async () => {
      const account = await accounts.create({ name: 'Livret A', type: 'SAVINGS', initialBalance: 600_000 });
      await expect(
        loans.create({
          ...conso,
          reservedFunds: {
            allocations: [
              { accountId: account.id, amount: 100_000 },
              { accountId: account.id, amount: 50_000 },
            ],
          },
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it.each([
      ['un montant nul', 0],
      ['un montant décimal', 10.5],
      ['un montant négatif', -100],
    ])('refuse %s', async (_label, amount) => {
      const account = await accounts.create({ name: 'Livret A', type: 'SAVINGS', initialBalance: 600_000 });
      await expect(
        loans.create({ ...conso, reservedFunds: { allocations: [{ accountId: account.id, amount }] } }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('refuse une date de réservation invalide', async () => {
      const account = await accounts.create({ name: 'Livret A', type: 'SAVINGS', initialBalance: 600_000 });
      await expect(
        loans.create({
          ...conso,
          reservedFunds: { since: '2026-02-30', allocations: [{ accountId: account.id, amount: 100_000 }] },
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('modifie puis retire les fonds réservés', async () => {
      const account = await accounts.create({ name: 'Livret A', type: 'SAVINGS', initialBalance: 600_000 });
      const loan = await loans.create({ ...conso, reservedFunds: { allocations: [{ accountId: account.id, amount: 100_000 }] } });

      const updated = await loans.update(loan.id, {
        reservedFunds: { allocations: [{ accountId: account.id, amount: 40_000 }] },
      });
      expect(updated.reservedFunds?.allocations).toEqual([{ accountId: account.id, amount: 40_000 }]);

      const cleared = await loans.update(loan.id, { reservedFunds: { allocations: [] } });
      expect('reservedFunds' in cleared).toBe(false);
    });

    it('détache l’allocation d’un compte supprimé, sans toucher aux autres', async () => {
      const ldd = await accounts.create({ name: 'LDD', type: 'SAVINGS', initialBalance: 800_000 });
      const livretA = await accounts.create({ name: 'Livret A', type: 'SAVINGS', initialBalance: 600_000 });
      await loans.create({
        ...conso,
        reservedFunds: {
          allocations: [
            { accountId: ldd.id, amount: 500_000 },
            { accountId: livretA.id, amount: 300_000 },
          ],
        },
      });

      await accounts.remove(ldd.id);

      const remaining = (await loans.list())[0];
      expect(remaining.reservedFunds?.allocations).toEqual([{ accountId: livretA.id, amount: 300_000 }]);
    });

    it('retire tous les fonds réservés quand le dernier compte concerné est supprimé', async () => {
      const account = await accounts.create({ name: 'Livret A', type: 'SAVINGS', initialBalance: 600_000 });
      await loans.create({ ...conso, reservedFunds: { allocations: [{ accountId: account.id, amount: 100_000 }] } });

      await accounts.remove(account.id);

      expect((await loans.list())[0]).not.toHaveProperty('reservedFunds');
    });
  });
});

describe('BankRepository', () => {
  it('crée une banque et la persiste', async () => {
    const bank = await banks.create({ name: '  LCL ' });
    expect(bank).toMatchObject({ name: 'LCL' });
    expect(bank.id).toBeTruthy();
    expect(await banks.list()).toEqual([bank]);
    expect(driver.stored?.banks).toEqual([bank]);
  });

  it('refuse un nom vide ou déjà utilisé (insensible à la casse)', async () => {
    await expect(banks.create({ name: '  ' })).rejects.toBeInstanceOf(ValidationError);
    await banks.create({ name: 'LCL' });
    await expect(banks.create({ name: 'lcl' })).rejects.toBeInstanceOf(ValidationError);
    expect(await banks.list()).toHaveLength(1);
  });

  it('renomme une banque, et signale une banque inexistante', async () => {
    const bank = await banks.create({ name: 'LCL' });
    const renamed = await banks.rename(bank.id, 'LCL Banque');
    expect(renamed).toEqual({ id: bank.id, name: 'LCL Banque' });
    await expect(banks.rename('inconnue', 'x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('détache les comptes et prêts rattachés quand la banque est supprimée', async () => {
    const bank = await banks.create({ name: 'LCL' });
    const account = await accounts.create({ name: 'Livret', type: 'SAVINGS', initialBalance: 0, bankId: bank.id });
    const loan = await loans.create({
      name: 'Prêt',
      kind: 'CONSUMER',
      principal: 100_000,
      annualRate: 0,
      monthlyPayment: 10_000,
      firstPaymentDate: '2026-10-05',
      bankId: bank.id,
    });

    await banks.remove(bank.id);

    expect(await banks.list()).toEqual([]);
    expect((await accounts.getById(account.id))?.bankId).toBeUndefined();
    expect((await loans.list()).find((candidate) => candidate.id === loan.id)?.bankId).toBeUndefined();
    await expect(banks.remove(bank.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('PropertyRepository', () => {
  const input: NewProperty = { name: 'Appartement loué', estimatedValue: 20_000_000, sellingFeePercent: 8 };

  it('crée un bien avec un id et le persiste', async () => {
    const property = await properties.create(input);
    expect(property).toMatchObject(input);
    expect(property.id).toBeTruthy();
    expect(await properties.list()).toEqual([property]);
    expect(driver.stored?.properties).toEqual([property]);
  });

  it('rattache un bien à un prêt existant, et refuse un prêt inconnu', async () => {
    const loan = await loans.create({
      name: 'Prêt',
      kind: 'MORTGAGE',
      principal: 100_000,
      annualRate: 0,
      monthlyPayment: 10_000,
      firstPaymentDate: '2026-10-05',
    });
    const property = await properties.create({ ...input, loanId: loan.id });
    expect(property.loanId).toBe(loan.id);

    await expect(properties.create({ ...input, loanId: 'inconnu' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuse de rattacher deux biens au même prêt', async () => {
    const loan = await loans.create({
      name: 'Prêt',
      kind: 'MORTGAGE',
      principal: 100_000,
      annualRate: 0,
      monthlyPayment: 10_000,
      firstPaymentDate: '2026-10-05',
    });
    await properties.create({ ...input, loanId: loan.id });
    await expect(properties.create({ ...input, name: 'Autre bien', loanId: loan.id })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it.each([
    ['un nom vide', { ...input, name: '  ' }],
    ['une valeur décimale', { ...input, estimatedValue: 100.5 }],
    ['une valeur nulle', { ...input, estimatedValue: 0 }],
    ['des frais négatifs', { ...input, sellingFeePercent: -1 }],
    ['des frais supérieurs à 100 %', { ...input, sellingFeePercent: 120 }],
  ])('refuse %s', async (_label, override) => {
    await expect(properties.create(override)).rejects.toBeInstanceOf(ValidationError);
    expect(await properties.list()).toEqual([]);
  });

  it('modifie un bien, y compris pour rattacher ou détacher son prêt', async () => {
    const loan = await loans.create({
      name: 'Prêt',
      kind: 'MORTGAGE',
      principal: 100_000,
      annualRate: 0,
      monthlyPayment: 10_000,
      firstPaymentDate: '2026-10-05',
    });
    const property = await properties.create(input);

    const attached = await properties.update(property.id, { loanId: loan.id });
    expect(attached.loanId).toBe(loan.id);

    const detached = await properties.update(property.id, { loanId: undefined });
    expect('loanId' in detached).toBe(false);
  });

  it('supprime un bien et signale un bien inexistant', async () => {
    const property = await properties.create(input);
    await properties.remove(property.id);
    expect(await properties.list()).toEqual([]);
    await expect(properties.remove(property.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(properties.update('inconnu', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('MovementRepository', () => {
  it('enregistre un mouvement', async () => {
    const account = await accounts.create({ name: 'A', type: 'CHECKING', initialBalance: 0 });
    const movement = await movements.create({
      accountId: account.id,
      type: 'WITHDRAWAL',
      amount: 1_250,
      date: '2026-05-04',
      note: '  Courses ',
    });

    expect(movement).toMatchObject({ accountId: account.id, type: 'WITHDRAWAL', amount: 1_250, date: '2026-05-04', note: 'Courses' });
    expect(await movements.listByAccount(account.id)).toEqual([movement]);
    expect(await movements.listByAccount('autre')).toEqual([]);
  });

  it('omet une note vide', async () => {
    const account = await accounts.create({ name: 'A', type: 'CHECKING', initialBalance: 0 });
    const movement = await movements.create({ accountId: account.id, type: 'DEPOSIT', amount: 1, date: '2026-05-04', note: '   ' });
    expect('note' in movement).toBe(false);
  });

  it('refuse un compte inconnu, un montant nul ou négatif et une date invalide', async () => {
    const account = await accounts.create({ name: 'A', type: 'CHECKING', initialBalance: 0 });
    const base = { accountId: account.id, type: 'DEPOSIT', amount: 100, date: '2026-01-01' } as const;

    await expect(movements.create({ ...base, accountId: 'inconnu' })).rejects.toBeInstanceOf(ValidationError);
    await expect(movements.create({ ...base, amount: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(movements.create({ ...base, amount: -5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(movements.create({ ...base, amount: 10.5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(movements.create({ ...base, date: '2026-02-30' })).rejects.toBeInstanceOf(ValidationError);
    expect(await movements.list()).toEqual([]);
  });

  it('modifie puis supprime un mouvement', async () => {
    const account = await accounts.create({ name: 'A', type: 'CHECKING', initialBalance: 0 });
    const movement = await movements.create({ accountId: account.id, type: 'DEPOSIT', amount: 100, date: '2026-01-01', note: 'x' });

    const updated = await movements.update(movement.id, { amount: 250, type: 'WITHDRAWAL' });
    expect(updated).toEqual({ ...movement, amount: 250, type: 'WITHDRAWAL' });

    const withoutNote = await movements.update(movement.id, { note: undefined });
    expect(withoutNote.note).toBeUndefined();

    await movements.remove(movement.id);
    expect(await movements.list()).toEqual([]);
    await expect(movements.remove(movement.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(movements.update('inconnu', { amount: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('PatrimoineStore', () => {
  it('notifie les abonnés à chaque modification et jamais après désabonnement', async () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    await accounts.create({ name: 'A', type: 'CHECKING', initialBalance: 0 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await accounts.create({ name: 'B', type: 'CHECKING', initialBalance: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ne change rien quand la modification échoue', async () => {
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.snapshot();

    await expect(accounts.create({ name: '', type: 'CHECKING', initialBalance: 0 })).rejects.toBeInstanceOf(ValidationError);

    expect(store.snapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(driver.saveCount).toBe(0);
  });

  it('charge les données déjà présentes dans le stockage', async () => {
    const other = new PatrimoineStore(driver);
    await accounts.create({ name: 'A', type: 'CHECKING', initialBalance: 100 });
    await other.load();
    expect(other.snapshot().accounts).toHaveLength(1);
  });

  it('sérialise les écritures : la dernière version gagne', async () => {
    await Promise.all([
      accounts.create({ name: 'A', type: 'CHECKING', initialBalance: 0 }),
      accounts.create({ name: 'B', type: 'CHECKING', initialBalance: 0 }),
      accounts.create({ name: 'C', type: 'CHECKING', initialBalance: 0 }),
    ]);
    expect(driver.stored?.accounts.map((account) => account.name)).toEqual(['A', 'B', 'C']);
  });
});
