import { describe, expect, it } from 'vitest';
import { InvalidDataError } from '../../domain/models/errors';
import { DATA_VERSION, type PatrimoineData } from '../../domain/models/PatrimoineData';
import { parsePatrimoineData, parsePatrimoineJson, serializePatrimoineData } from './parsePatrimoineData';

const valid: PatrimoineData = {
  version: DATA_VERSION,
  accounts: [
    { id: 'a1', name: 'Compte courant', type: 'CHECKING', initialBalance: 12_345 },
    { id: 'a2', name: 'Livret', type: 'SAVINGS', initialBalance: 0, interestRate: 2.4 },
  ],
  movements: [
    { id: 'm1', accountId: 'a1', type: 'DEPOSIT', amount: 5_000, date: '2026-03-01', note: 'Salaire' },
    { id: 'm2', accountId: 'a2', type: 'WITHDRAWAL', amount: 1, date: '2026-03-02', budgetId: 'b1' },
  ],
  budgets: [
    { id: 'b1', name: 'Vacances', percent: 25 },
    { id: 'b2', name: 'Travaux', percent: 12.5, targetAmount: 1_000_000, targetDate: '2028-03-15' },
  ],
  loans: [
    {
      id: 'l1',
      name: 'Prêt immobilier',
      kind: 'MORTGAGE',
      principal: 15_000_000,
      annualRate: 1.45,
      monthlyPayment: 90_000,
      monthlyInsurance: 3_500,
      firstPaymentDate: '2026-10-05',
      prepayments: [
        { date: '2027-03-05', amount: 500_000, effect: 'DURATION' },
        { date: '2028-03-05', amount: 200_000, effect: 'PAYMENT' },
      ],
      reservedFunds: {
        note: 'À verser à l’artisan',
        since: '2026-06-10',
        allocations: [
          { accountId: 'a1', amount: 300_000 },
          { accountId: 'a2', amount: 200_000 },
        ],
      },
    },
    {
      id: 'l2',
      name: 'Éco-PTZ',
      kind: 'RENOVATION',
      principal: 1_500_000,
      annualRate: 0,
      monthlyPayment: 12_500,
      firstPaymentDate: '2027-01-15',
    },
  ],
  banks: [{ id: 'bk1', name: 'La Banque Postale' }],
  properties: [
    { id: 'pr1', name: 'Appartement loué', estimatedValue: 22_000_000, loanId: 'l1', sellingFeePercent: 8 },
  ],
  savingsEffort: { incomeSources: [{ name: 'Salaire', monthlyAmount: 300_000 }], targetRatePercent: 20 },
};

describe('parsePatrimoineData', () => {
  it('relit à l’identique ce que serializePatrimoineData écrit', () => {
    expect(parsePatrimoineJson(serializePatrimoineData(valid))).toEqual(valid);
  });

  it('accepte un fichier sans numéro de version', () => {
    expect(parsePatrimoineData({ accounts: [], movements: [] })).toEqual({
      version: DATA_VERSION,
      accounts: [],
      movements: [],
      budgets: [],
      loans: [],
      banks: [],
      properties: [],
    });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('lit un fichier en version %i et le migre en version courante', (version) => {
    const parsed = parsePatrimoineData({
      version,
      accounts: [{ id: 'a', name: 'Livret', type: 'SAVINGS', initialBalance: 100, interestRate: 2 }],
      movements: [{ id: 'm', accountId: 'a', type: 'DEPOSIT', amount: 50, date: '2025-01-01' }],
    });
    expect(parsed.version).toBe(DATA_VERSION);
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.budgets).toEqual([]);
    expect(parsed.loans).toEqual([]);
    expect(parsed.banks).toEqual([]);
    expect(parsed.properties).toEqual([]);
    expect(parsed.safety).toBeUndefined();
    expect(parsed.savingsEffort).toBeUndefined();
  });

  it('relit les tranches bloquées, la durée de blocage des versements et l’épargne de sécurité', () => {
    const data: PatrimoineData = {
      version: DATA_VERSION,
      accounts: [
        {
          id: 'pee',
          name: 'PEE',
          type: 'SAVINGS',
          initialBalance: 500_000,
          lockedTranches: [
            { amount: 200_000, unlockDate: '2028-03-15' },
            { amount: 300_000, unlockDate: '2029-03-15' },
          ],
          depositLockYears: 5,
        },
      ],
      movements: [],
      budgets: [],
      loans: [],
      banks: [],
      properties: [],
      safety: { threshold: 1_000_000, comfortMargin: 500_000 },
    };
    expect(parsePatrimoineJson(serializePatrimoineData(data))).toEqual(data);
  });

  it('relit une tranche « disponible à la retraite », sans date', () => {
    const data: PatrimoineData = {
      version: DATA_VERSION,
      accounts: [
        {
          id: 'pee',
          name: 'PEE',
          type: 'SAVINGS',
          initialBalance: 500_000,
          lockedTranches: [{ amount: 300_000, unlockAtRetirement: true }],
        },
      ],
      movements: [],
      budgets: [],
      loans: [],
      banks: [],
      properties: [],
    };
    expect(parsePatrimoineJson(serializePatrimoineData(data))).toEqual(data);
  });

  it('rejette une tranche à la fois datée et « à la retraite »', () => {
    expect(() =>
      parsePatrimoineData({
        accounts: [
          {
            id: 'pee',
            name: 'PEE',
            type: 'SAVINGS',
            initialBalance: 0,
            lockedTranches: [{ amount: 300_000, unlockDate: '2028-01-01', unlockAtRetirement: true }],
          },
        ],
        movements: [],
      }),
    ).toThrow(InvalidDataError);
  });

  it('ignore les champs inconnus', () => {
    const parsed = parsePatrimoineData({
      accounts: [{ id: 'a', name: 'x', type: 'CHECKING', initialBalance: 0, extra: true }],
      movements: [],
    });
    expect(parsed.accounts[0]).toEqual({ id: 'a', name: 'x', type: 'CHECKING', initialBalance: 0 });
  });

  it.each([
    ['un tableau', []],
    ['null', null],
    ['une chaîne', 'texte'],
    ['une version future', { version: DATA_VERSION + 1, accounts: [], movements: [] }],
    ['une version nulle', { version: 0, accounts: [], movements: [] }],
    ['des postes qui ne sont pas une liste', { accounts: [], movements: [], budgets: 'bientôt' }],
    ['un poste sans identifiant', { accounts: [], movements: [], budgets: [{ name: 'Vacances', percent: 10 }] }],
    [
      'un poste de plus de 100 %',
      { accounts: [], movements: [], budgets: [{ id: 'b', name: 'Vacances', percent: 120 }] },
    ],
    [
      'un poste au pourcentage négatif',
      { accounts: [], movements: [], budgets: [{ id: 'b', name: 'Vacances', percent: -5 }] },
    ],
    [
      'un poste au pourcentage texte',
      { accounts: [], movements: [], budgets: [{ id: 'b', name: 'Vacances', percent: '10' }] },
    ],
    [
      'un objectif sans échéance',
      { accounts: [], movements: [], budgets: [{ id: 'b', name: 'Voiture', percent: 10, targetAmount: 100_000 }] },
    ],
    [
      'un objectif sans montant',
      { accounts: [], movements: [], budgets: [{ id: 'b', name: 'Voiture', percent: 10, targetDate: '2028-01-01' }] },
    ],
    [
      'un objectif au montant décimal',
      {
        accounts: [],
        movements: [],
        budgets: [{ id: 'b', name: 'Voiture', percent: 10, targetAmount: 10.5, targetDate: '2028-01-01' }],
      },
    ],
    [
      'un objectif au montant nul',
      {
        accounts: [],
        movements: [],
        budgets: [{ id: 'b', name: 'Voiture', percent: 10, targetAmount: 0, targetDate: '2028-01-01' }],
      },
    ],
    ['des prêts qui ne sont pas une liste', { accounts: [], movements: [], loans: 'bientôt' }],
    ['un rattachement à un poste vide', { accounts: [], movements: [{ id: 'm', accountId: 'a', type: 'WITHDRAWAL', amount: 100, date: '2026-01-01', budgetId: '' }] }],
    [
      'un objectif à l’échéance impossible',
      {
        accounts: [],
        movements: [],
        budgets: [{ id: 'b', name: 'Voiture', percent: 10, targetAmount: 100_000, targetDate: '2028-02-30' }],
      },
    ],
    [
      'une tranche bloquée sans date',
      {
        accounts: [{ id: 'a', name: 'x', type: 'SAVINGS', initialBalance: 0, lockedTranches: [{ amount: 100 }] }],
        movements: [],
      },
    ],
    [
      'une tranche bloquée de montant décimal',
      {
        accounts: [
          {
            id: 'a',
            name: 'x',
            type: 'SAVINGS',
            initialBalance: 0,
            lockedTranches: [{ amount: 10.5, unlockDate: '2030-01-01' }],
          },
        ],
        movements: [],
      },
    ],
    [
      'des tranches qui ne sont pas une liste',
      {
        accounts: [{ id: 'a', name: 'x', type: 'SAVINGS', initialBalance: 0, lockedTranches: 'bientôt' }],
        movements: [],
      },
    ],
    [
      'une durée de blocage hors bornes',
      {
        accounts: [{ id: 'a', name: 'x', type: 'SAVINGS', initialBalance: 0, depositLockYears: 80 }],
        movements: [],
      },
    ],
    ['un seuil de sécurité négatif', { accounts: [], movements: [], safety: { threshold: -1, comfortMargin: 0 } }],
    ['une marge de confort manquante', { accounts: [], movements: [], safety: { threshold: 1_000 } }],
    ['des comptes manquants', { movements: [] }],
    ['des mouvements manquants', { accounts: [] }],
    ['un compte sans id', { accounts: [{ name: 'x', type: 'CHECKING', initialBalance: 0 }], movements: [] }],
    [
      'un solde décimal',
      { accounts: [{ id: 'a', name: 'x', type: 'CHECKING', initialBalance: 12.5 }], movements: [] },
    ],
    [
      'un type de compte inconnu',
      { accounts: [{ id: 'a', name: 'x', type: 'PEA', initialBalance: 0 }], movements: [] },
    ],
    [
      'un taux négatif',
      { accounts: [{ id: 'a', name: 'x', type: 'SAVINGS', initialBalance: 0, interestRate: -1 }], movements: [] },
    ],
    [
      'un montant nul',
      { accounts: [], movements: [{ id: 'm', accountId: 'a', type: 'DEPOSIT', amount: 0, date: '2026-01-01' }] },
    ],
    [
      'un montant décimal',
      { accounts: [], movements: [{ id: 'm', accountId: 'a', type: 'DEPOSIT', amount: 1.5, date: '2026-01-01' }] },
    ],
    [
      'une date impossible',
      { accounts: [], movements: [{ id: 'm', accountId: 'a', type: 'DEPOSIT', amount: 100, date: '2026-02-30' }] },
    ],
    [
      'un type de mouvement inconnu',
      { accounts: [], movements: [{ id: 'm', accountId: 'a', type: 'VIREMENT', amount: 100, date: '2026-01-01' }] },
    ],
  ])('rejette %s', (_label, raw) => {
    expect(() => parsePatrimoineData(raw)).toThrow(InvalidDataError);
  });

  describe('prêts', () => {
    const withLoan = (override: Record<string, unknown>) => ({
      accounts: [],
      movements: [],
      loans: [
        {
          id: 'l',
          name: 'Prêt',
          kind: 'CONSUMER',
          principal: 1_000_000,
          annualRate: 3,
          monthlyPayment: 50_000,
          firstPaymentDate: '2026-10-05',
          ...override,
        },
      ],
    });

    it('lit un prêt valide, avec ou sans assurance', () => {
      expect(parsePatrimoineData(withLoan({})).loans).toHaveLength(1);
      expect(parsePatrimoineData(withLoan({ monthlyInsurance: 2_000 })).loans[0].monthlyInsurance).toBe(2_000);
      expect(parsePatrimoineData(withLoan({ annualRate: 0 })).loans[0].annualRate).toBe(0);
    });

    it.each<[string, Record<string, unknown>]>([
      ['un prêt sans identifiant', { id: undefined }],
      ['un prêt de type inconnu', { kind: 'PEA' }],
      ['un prêt au capital décimal', { principal: 100.5 }],
      ['un prêt au capital nul', { principal: 0 }],
      ['un prêt au taux négatif', { annualRate: -2 }],
      ['un prêt au taux texte', { annualRate: '1,5' }],
      ['un prêt à la mensualité nulle', { monthlyPayment: 0 }],
      ['un prêt à l’assurance négative', { monthlyInsurance: -5 }],
      ['un prêt à la date impossible', { firstPaymentDate: '2026-02-30' }],
      ['un prêt à la mensualité trop faible', { principal: 10_000_000, annualRate: 12, monthlyPayment: 100_000 }],
      ['un prêt de plus de 50 ans', { principal: 100_000_000, annualRate: 0, monthlyPayment: 1_000 }],
      ['des remboursements anticipés qui ne sont pas une liste', { prepayments: 'bientôt' }],
      ['un remboursement anticipé qui n’est pas un objet', { prepayments: [42] }],
      ['un remboursement anticipé sans date', { prepayments: [{ amount: 100_000, effect: 'DURATION' }] }],
      ['un remboursement anticipé à la date impossible', { prepayments: [{ date: '2027-02-30', amount: 100_000, effect: 'DURATION' }] }],
      ['un remboursement anticipé au montant décimal', { prepayments: [{ date: '2027-03-05', amount: 100.5, effect: 'DURATION' }] }],
      ['un remboursement anticipé au montant nul', { prepayments: [{ date: '2027-03-05', amount: 0, effect: 'DURATION' }] }],
      ['un remboursement anticipé d’effet inconnu', { prepayments: [{ date: '2027-03-05', amount: 100_000, effect: 'AUTRE' }] }],
    ])('rejette %s', (_label, override) => {
      expect(() => parsePatrimoineData(withLoan(override))).toThrow(InvalidDataError);
    });

    it('lit les remboursements anticipés en les triant par date, et accepte leur absence', () => {
      const loan = parsePatrimoineData(
        withLoan({
          prepayments: [
            { date: '2028-01-05', amount: 100_000, effect: 'PAYMENT' },
            { date: '2027-03-05', amount: 200_000, effect: 'DURATION' },
          ],
        }),
      ).loans[0];
      expect(loan.prepayments).toEqual([
        { date: '2027-03-05', amount: 200_000, effect: 'DURATION' },
        { date: '2028-01-05', amount: 100_000, effect: 'PAYMENT' },
      ]);
      expect(parsePatrimoineData(withLoan({})).loans[0].prepayments).toBeUndefined();
      expect(parsePatrimoineData(withLoan({ prepayments: null })).loans[0].prepayments).toBeUndefined();
    });

    it('garde un remboursement anticipé postérieur à la fin du prêt (sans effet)', () => {
      const loan = parsePatrimoineData(
        withLoan({ prepayments: [{ date: '2040-01-05', amount: 100_000, effect: 'DURATION' }] }),
      ).loans[0];
      expect(loan.prepayments).toHaveLength(1);
    });

    it('lit la banque rattachée à un prêt', () => {
      expect(parsePatrimoineData(withLoan({ bankId: 'bk1' })).loans[0].bankId).toBe('bk1');
      expect(parsePatrimoineData(withLoan({})).loans[0].bankId).toBeUndefined();
    });

    it('rejette une banque de prêt invalide', () => {
      expect(() => parsePatrimoineData(withLoan({ bankId: '' }))).toThrow(InvalidDataError);
      expect(() => parsePatrimoineData(withLoan({ bankId: 42 }))).toThrow(InvalidDataError);
    });

    describe('fonds réservés', () => {
      it('lit une note, une date et des allocations, et accepte leur absence', () => {
        const loan = parsePatrimoineData(
          withLoan({
            reservedFunds: {
              note: 'À verser à l’artisan',
              since: '2026-06-10',
              allocations: [
                { accountId: 'a1', amount: 300_000 },
                { accountId: 'a2', amount: 200_000 },
              ],
            },
          }),
        ).loans[0];
        expect(loan.reservedFunds).toEqual({
          note: 'À verser à l’artisan',
          since: '2026-06-10',
          allocations: [
            { accountId: 'a1', amount: 300_000 },
            { accountId: 'a2', amount: 200_000 },
          ],
        });
        expect(parsePatrimoineData(withLoan({})).loans[0].reservedFunds).toBeUndefined();
      });

      it('accepte des fonds réservés sans note ni date', () => {
        const loan = parsePatrimoineData(withLoan({ reservedFunds: { allocations: [{ accountId: 'a1', amount: 100_000 }] } }))
          .loans[0];
        expect(loan.reservedFunds).toEqual({ allocations: [{ accountId: 'a1', amount: 100_000 }] });
      });

      it.each<[string, unknown]>([
        ['un objet invalide', 'bientôt'],
        ['des allocations qui ne sont pas une liste', { allocations: 'bientôt' }],
        ['une allocation qui n’est pas un objet', { allocations: [42] }],
        ['une allocation sans compte', { allocations: [{ amount: 100_000 }] }],
        ['une allocation au compte vide', { allocations: [{ accountId: '', amount: 100_000 }] }],
        ['une allocation au montant décimal', { allocations: [{ accountId: 'a1', amount: 10.5 }] }],
        ['une allocation au montant nul', { allocations: [{ accountId: 'a1', amount: 0 }] }],
        ['une note invalide', { note: 42, allocations: [{ accountId: 'a1', amount: 100_000 }] }],
        ['une date invalide', { since: '2026-02-30', allocations: [{ accountId: 'a1', amount: 100_000 }] }],
      ])('rejette %s', (_label, reservedFunds) => {
        expect(() => parsePatrimoineData(withLoan({ reservedFunds }))).toThrow(InvalidDataError);
      });
    });
  });

  describe('banques', () => {
    it('lit une liste de banques', () => {
      const parsed = parsePatrimoineData({
        accounts: [],
        movements: [],
        banks: [
          { id: 'bk1', name: 'La Banque Postale' },
          { id: 'bk2', name: 'LCL' },
        ],
      });
      expect(parsed.banks).toEqual([{ id: 'bk1', name: 'La Banque Postale' }, { id: 'bk2', name: 'LCL' }]);
    });

    it('lit la banque rattachée à un compte', () => {
      const parsed = parsePatrimoineData({
        accounts: [{ id: 'a', name: 'Livret', type: 'SAVINGS', initialBalance: 0, bankId: 'bk1' }],
        movements: [],
      });
      expect(parsed.accounts[0].bankId).toBe('bk1');
    });

    it.each<[string, unknown]>([
      ['une liste qui n’est pas un tableau', { accounts: [], movements: [], banks: 'bientôt' }],
      ['une banque qui n’est pas un objet', { accounts: [], movements: [], banks: [42] }],
      ['une banque sans identifiant', { accounts: [], movements: [], banks: [{ name: 'LCL' }] }],
      ['une banque sans nom', { accounts: [], movements: [], banks: [{ id: 'bk1' }] }],
      ['une banque de compte invalide', { accounts: [{ id: 'a', name: 'x', type: 'CHECKING', initialBalance: 0, bankId: '' }], movements: [] }],
    ])('rejette %s', (_label, raw) => {
      expect(() => parsePatrimoineData(raw)).toThrow(InvalidDataError);
    });
  });

  describe('biens immobiliers', () => {
    const withProperty = (override: Record<string, unknown>) => ({
      accounts: [],
      movements: [],
      properties: [{ id: 'pr1', name: 'Appartement loué', estimatedValue: 22_000_000, sellingFeePercent: 8, ...override }],
    });

    it('lit un bien, avec ou sans prêt rattaché', () => {
      expect(parsePatrimoineData(withProperty({})).properties[0].loanId).toBeUndefined();
      expect(parsePatrimoineData(withProperty({ loanId: 'l1' })).properties[0].loanId).toBe('l1');
    });

    it.each<[string, Record<string, unknown>]>([
      ['un bien sans identifiant', { id: undefined }],
      ['un bien sans nom', { name: undefined }],
      ['un bien à la valeur décimale', { estimatedValue: 100.5 }],
      ['un bien à la valeur nulle', { estimatedValue: 0 }],
      ['un bien aux frais de vente négatifs', { sellingFeePercent: -1 }],
      ['un bien aux frais de vente supérieurs à 100 %', { sellingFeePercent: 120 }],
      ['un bien au prêt rattaché vide', { loanId: '' }],
    ])('rejette %s', (_label, override) => {
      expect(() => parsePatrimoineData(withProperty(override))).toThrow(InvalidDataError);
    });
  });

  describe('effort d’épargne', () => {
    const withEffort = (savingsEffort: unknown) => ({ accounts: [], movements: [], savingsEffort });

    it('lit les revenus et le taux cible, et accepte leur absence', () => {
      const parsed = parsePatrimoineData(
        withEffort({ incomeSources: [{ name: 'Salaire', monthlyAmount: 300_000 }], targetRatePercent: 20 }),
      );
      expect(parsed.savingsEffort).toEqual({ incomeSources: [{ name: 'Salaire', monthlyAmount: 300_000 }], targetRatePercent: 20 });
      expect(parsePatrimoineData({ accounts: [], movements: [] }).savingsEffort).toBeUndefined();
    });

    it('accepte une liste de revenus vide', () => {
      expect(parsePatrimoineData(withEffort({ incomeSources: [], targetRatePercent: 15 })).savingsEffort?.incomeSources).toEqual([]);
    });

    it.each<[string, unknown]>([
      ['un objet invalide', 'bientôt'],
      ['des revenus qui ne sont pas une liste', { incomeSources: 'bientôt', targetRatePercent: 20 }],
      ['un revenu qui n’est pas un objet', { incomeSources: [42], targetRatePercent: 20 }],
      ['un revenu sans nom', { incomeSources: [{ monthlyAmount: 100_000 }], targetRatePercent: 20 }],
      ['un revenu au montant décimal', { incomeSources: [{ name: 'Salaire', monthlyAmount: 10.5 }], targetRatePercent: 20 }],
      ['un revenu au montant nul', { incomeSources: [{ name: 'Salaire', monthlyAmount: 0 }], targetRatePercent: 20 }],
      ['un taux manquant', { incomeSources: [] }],
      ['un taux négatif', { incomeSources: [], targetRatePercent: -1 }],
      ['un taux supérieur à 100 %', { incomeSources: [], targetRatePercent: 120 }],
    ])('rejette %s', (_label, savingsEffort) => {
      expect(() => parsePatrimoineData(withEffort(savingsEffort))).toThrow(InvalidDataError);
    });
  });

  it('rejette un JSON invalide', () => {
    expect(() => parsePatrimoineJson('{oups')).toThrow(InvalidDataError);
  });
});
