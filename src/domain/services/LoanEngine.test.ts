import { describe, expect, it } from 'vitest';
import type { Loan, LoanPrepayment } from '../models/Loan';
import {
  buildAmortization,
  finalRegularPayment,
  loanPaymentsInYear,
  loanSnapshot,
  measurePrepayments,
  monthlyCommitment,
  outstandingAt,
  paymentForTerm,
  projectLoans,
  reservedLotsOf,
} from './LoanEngine';

// 21 septembre 2026
const REFERENCE = new Date(2026, 8, 21);

const loan = (overrides: Partial<Loan> = {}): Loan => ({
  id: 'l1',
  name: 'Prêt',
  kind: 'CONSUMER',
  principal: 1_200_000,
  annualRate: 0,
  monthlyPayment: 100_000,
  firstPaymentDate: '2026-10-05',
  ...overrides,
});

describe('buildAmortization', () => {
  it('rembourse un prêt à taux zéro par mensualités égales', () => {
    const { rows, complete } = buildAmortization(loan());
    expect(complete).toBe(true);
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.interest === 0 && row.principal === 100_000 && row.payment === 100_000)).toBe(true);
    expect(rows[0]).toMatchObject({ number: 1, date: '2026-10-05', balanceAfter: 1_100_000 });
    expect(rows[11]).toMatchObject({ number: 12, date: '2027-09-05', balanceAfter: 0 });
  });

  it('calcule les intérêts sur le capital restant dû (12 % annuel = 1 % par mois)', () => {
    const { rows } = buildAmortization(loan({ principal: 1_000_000, annualRate: 12 }));
    expect(rows[0]).toMatchObject({ interest: 10_000, principal: 90_000, payment: 100_000, balanceAfter: 910_000 });
    expect(rows[1]).toMatchObject({ interest: 9_100, principal: 90_900, balanceAfter: 819_100 });
  });

  it('arrondit les intérêts au centime chaque mois', () => {
    const { rows } = buildAmortization(loan({ principal: 100_050, annualRate: 3, monthlyPayment: 50_000 }));
    expect(rows[0].interest).toBe(250); // 250,125 c
  });

  it('solde le prêt par une dernière échéance plus petite', () => {
    const { rows, complete } = buildAmortization(loan({ principal: 250_000 }));
    expect(complete).toBe(true);
    expect(rows.map((row) => row.payment)).toEqual([100_000, 100_000, 50_000]);
    expect(rows[2].balanceAfter).toBe(0);
  });

  it('garde le jour du mois, ramené à la fin du mois quand il n’existe pas', () => {
    const { rows } = buildAmortization(loan({ principal: 400_000, firstPaymentDate: '2026-01-31' }));
    expect(rows.map((row) => row.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('démarre à la date de première échéance, même dans le futur (différé)', () => {
    const { rows } = buildAmortization(loan({ principal: 200_000, firstPaymentDate: '2028-03-15' }));
    expect(rows.map((row) => row.date)).toEqual(['2028-03-15', '2028-04-15']);
  });

  it('s’arrête, incomplet, quand la mensualité ne couvre pas les intérêts', () => {
    const insufficient = buildAmortization(loan({ principal: 1_000_000, annualRate: 12, monthlyPayment: 10_000 }));
    expect(insufficient).toEqual({ rows: [], complete: false, ignoredPrepayments: 0 });
    expect(buildAmortization(loan({ principal: 1_000_000, annualRate: 12, monthlyPayment: 9_000 })).complete).toBe(false);
  });

  it('s’arrête, incomplet, au-delà de 50 ans', () => {
    const { rows, complete } = buildAmortization(loan({ principal: 100_000_000, monthlyPayment: 1_000 }));
    expect(complete).toBe(false);
    expect(rows).toHaveLength(600);
  });

  it('ne produit aucune échéance pour un capital nul', () => {
    expect(buildAmortization(loan({ principal: 0 }))).toEqual({ rows: [], complete: true, ignoredPrepayments: 0 });
  });
});

describe('remboursements anticipés', () => {
  const duration = (date: string, amount: number): LoanPrepayment => ({ date, amount, effect: 'DURATION' });
  const payment = (date: string, amount: number): LoanPrepayment => ({ date, amount, effect: 'PAYMENT' });
  const withPrepayments = (prepayments: LoanPrepayment[], overrides: Partial<Loan> = {}) =>
    buildAmortization(loan({ prepayments, ...overrides }));

  it('réduit la durée : la mensualité reste, le prêt finit plus tôt', () => {
    const { rows, complete, ignoredPrepayments } = withPrepayments([duration('2027-01-05', 300_000)]);

    expect(complete).toBe(true);
    expect(ignoredPrepayments).toBe(0);
    expect(rows).toHaveLength(9); // au lieu de 12
    expect(rows[3]).toMatchObject({ date: '2027-01-05', payment: 100_000, prepayment: 300_000, balanceAfter: 500_000 });
    expect(rows.filter((row) => row.prepayment > 0)).toHaveLength(1);
    expect(rows.every((row) => row.payment === 100_000)).toBe(true);
    expect(rows[8]).toMatchObject({ date: '2027-06-05', balanceAfter: 0 });
  });

  it('réduit la mensualité : la fin est conservée', () => {
    const { rows } = withPrepayments([payment('2027-01-05', 300_000)]);

    expect(rows).toHaveLength(12);
    expect(rows[11]).toMatchObject({ date: '2027-09-05', balanceAfter: 0 });
    expect(rows.slice(0, 4).every((row) => row.payment === 100_000)).toBe(true);
    expect(rows.slice(4).every((row) => row.payment === 62_500)).toBe(true); // 500 000 c / 8 échéances restantes
  });

  it('impute le remboursement après les intérêts de l’échéance du jour, puis les calcule sur le nouveau capital', () => {
    const { rows } = withPrepayments([duration('2026-10-05', 200_000)], { principal: 1_000_000, annualRate: 12 });
    expect(rows[0]).toMatchObject({ interest: 10_000, principal: 90_000, prepayment: 200_000, balanceAfter: 710_000 });
    expect(rows[1]).toMatchObject({ interest: 7_100, principal: 92_900, balanceAfter: 617_100 });
  });

  it('impute un remboursement antérieur à la première échéance à la première échéance', () => {
    const early = withPrepayments([duration('2026-09-25', 200_000)], { principal: 1_000_000, annualRate: 12 });
    const onTheDay = withPrepayments([duration('2026-10-05', 200_000)], { principal: 1_000_000, annualRate: 12 });
    expect(early.rows).toEqual(onTheDay.rows);
  });

  it('impute un remboursement daté entre deux échéances à l’échéance suivante', () => {
    const { rows } = withPrepayments([duration('2026-10-20', 200_000)], { principal: 1_000_000, annualRate: 12 });
    expect(rows[0]).toMatchObject({ prepayment: 0, balanceAfter: 910_000 });
    expect(rows[1]).toMatchObject({ date: '2026-11-05', interest: 9_100, prepayment: 200_000, balanceAfter: 619_100 });
  });

  it('plafonne le remboursement au capital restant dû et solde le prêt', () => {
    const { rows, complete } = withPrepayments([duration('2026-11-05', 5_000_000)], { principal: 1_000_000, annualRate: 12 });
    expect(complete).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ prepayment: 819_100, balanceAfter: 0 });
  });

  it('ignore un remboursement postérieur à la fin du prêt, en le signalant', () => {
    const baseline = buildAmortization(loan());
    const { rows, complete, ignoredPrepayments } = withPrepayments([duration('2035-01-01', 100_000)]);
    expect(rows).toEqual(baseline.rows);
    expect(complete).toBe(true);
    expect(ignoredPrepayments).toBe(1);
  });

  it('cumule plusieurs remboursements le même jour, quel que soit l’ordre de saisie', () => {
    const { rows } = withPrepayments([duration('2027-01-05', 50_000), duration('2026-11-05', 100_000), duration('2027-01-05', 100_000)]);
    expect(rows[1].prepayment).toBe(100_000);
    expect(rows[3].prepayment).toBe(150_000);
    expect(rows[3].balanceAfter).toBe(1_200_000 - 400_000 - 100_000 - 150_000); // 4 échéances + 250 000 c remboursés
  });

  it('enchaîne un remboursement qui réduit la durée puis un autre qui réduit la mensualité', () => {
    const { rows, complete } = withPrepayments([duration('2026-11-05', 100_000), payment('2027-01-05', 200_000)]);
    expect(complete).toBe(true);
    // après la 4e échéance : 700 000 c restants, 7 échéances à venir ; 200 000 c remboursés => 500 000 c sur 7 échéances
    expect(rows[3].balanceAfter).toBe(500_000);
    expect(rows.slice(4, 10).every((row) => row.payment === 71_429)).toBe(true);
    expect(rows).toHaveLength(11);
    expect(rows[10]).toMatchObject({ date: '2027-08-05', payment: 71_426, balanceAfter: 0 });
  });

  it('avec un taux, réduire la mensualité conserve (à une échéance près) la date de fin', () => {
    const terms = { principal: 1_000_000, annualRate: 12 };
    const baseline = buildAmortization(loan(terms));
    const { rows } = withPrepayments([payment('2026-11-05', 300_000)], terms);

    expect(rows.length).toBeLessThanOrEqual(baseline.rows.length);
    expect(rows.length).toBeGreaterThanOrEqual(baseline.rows.length - 1);
    expect(rows[rows.length - 2].payment).toBeLessThan(100_000);
  });

  it('avec un taux, réduire la durée finit plus tôt', () => {
    const terms = { principal: 1_000_000, annualRate: 12 };
    const baseline = buildAmortization(loan(terms));
    const { rows } = withPrepayments([duration('2026-11-05', 300_000)], terms);
    expect(rows.length).toBeLessThan(baseline.rows.length - 2);
  });

  it('reste complet même si tous les remboursements sont ignorés ou nuls', () => {
    expect(withPrepayments([]).complete).toBe(true);
  });
});

describe('reservedLotsOf', () => {
  it('est vide sans prêt, ou si aucun prêt n’a de fonds réservés', () => {
    expect(reservedLotsOf('a1', [])).toEqual([]);
    expect(reservedLotsOf('a1', [loan()])).toEqual([]);
  });

  it('ne renvoie que les allocations du compte demandé, sans date de fin', () => {
    const withReservation = loan({
      reservedFunds: {
        note: 'À verser à l’artisan',
        allocations: [
          { accountId: 'a1', amount: 300_000 },
          { accountId: 'a2', amount: 200_000 },
        ],
      },
    });
    expect(reservedLotsOf('a1', [withReservation])).toEqual([{ amount: 300_000 }]);
    expect(reservedLotsOf('a2', [withReservation])).toEqual([{ amount: 200_000 }]);
    expect(reservedLotsOf('a3', [withReservation])).toEqual([]);
  });

  it('cumule les allocations de plusieurs prêts pour le même compte', () => {
    const first = loan({ id: 'l1', reservedFunds: { allocations: [{ accountId: 'a1', amount: 100_000 }] } });
    const second = loan({ id: 'l2', reservedFunds: { allocations: [{ accountId: 'a1', amount: 50_000 }] } });
    expect(reservedLotsOf('a1', [first, second])).toEqual([{ amount: 100_000 }, { amount: 50_000 }]);
  });
});

describe('paymentForTerm', () => {
  it('divise le capital pour un prêt à taux zéro', () => {
    expect(paymentForTerm(1_200_000, 0, 12)).toBe(100_000);
    expect(paymentForTerm(1_500_000, 0, 120)).toBe(12_500);
    expect(paymentForTerm(1_000_000, 0, 13)).toBe(76_924);
  });

  it.each([
    [15_000_000, 1.45, 180],
    [800_000, 4.9, 48],
    [2_400_000, 2.1, 120],
    [1_000_000, 12, 24],
  ])('donne la plus petite mensualité qui rembourse %i c à %d %% en %i mois', (principal, rate, months) => {
    const payment = paymentForTerm(principal, rate, months);
    expect(payment).not.toBeNull();
    const enough = buildAmortization({ principal, annualRate: rate, monthlyPayment: payment ?? 0, firstPaymentDate: '2026-01-01' });
    expect(enough.complete).toBe(true);
    expect(enough.rows.length).toBeLessThanOrEqual(months);

    const less = buildAmortization({ principal, annualRate: rate, monthlyPayment: (payment ?? 0) - 1, firstPaymentDate: '2026-01-01' });
    expect(!less.complete || less.rows.length > months).toBe(true);
  });

  it('accepte une durée d’une seule échéance', () => {
    expect(paymentForTerm(100_000, 12, 1)).toBe(101_000);
  });

  it.each([
    [0, 0, 12],
    [1_000_000, 0, 0],
    [1_000_000, 0, 601],
    [1_000_000, 0, 1.5],
  ])('refuse capital %i, taux %d %%, durée %d', (principal, rate, months) => {
    expect(paymentForTerm(principal, rate, months)).toBeNull();
  });
});

describe('outstandingAt', () => {
  const { rows } = buildAmortization(loan());

  it('vaut le capital avant la première échéance puis suit l’échéancier', () => {
    expect(outstandingAt(rows, 1_200_000, '2026-10-04')).toBe(1_200_000);
    expect(outstandingAt(rows, 1_200_000, '2026-10-05')).toBe(1_100_000);
    expect(outstandingAt(rows, 1_200_000, '2027-01-31')).toBe(800_000);
    expect(outstandingAt(rows, 1_200_000, '2030-01-01')).toBe(0);
  });
});

describe('monthlyCommitment', () => {
  it('ajoute l’assurance à la mensualité', () => {
    expect(monthlyCommitment({ monthlyPayment: 90_000, monthlyInsurance: 3_500 })).toBe(93_500);
    expect(monthlyCommitment({ monthlyPayment: 90_000 })).toBe(90_000);
  });
});

describe('loanSnapshot', () => {
  const withInsurance = loan({ monthlyInsurance: 5_000 });

  it('décrit un prêt en cours', () => {
    const snapshot = loanSnapshot(withInsurance, '2027-01-10');
    expect(snapshot).toEqual({
      totalPayments: 12,
      paymentsMade: 4,
      remainingPayments: 8,
      outstanding: 800_000,
      monthlyPayment: 100_000,
      remainingInterest: 0,
      next: { date: '2027-02-05', amount: 105_000 },
      endDate: '2027-09-05',
      repaidRatio: 1 / 3,
      active: true,
      ignoredPrepayments: 0,
    });
    expect(snapshot?.prepaymentImpact).toBeUndefined();
  });

  it('compte l’échéance du jour comme payée', () => {
    expect(loanSnapshot(withInsurance, '2026-10-05')).toMatchObject({ paymentsMade: 1, outstanding: 1_100_000 });
    expect(loanSnapshot(withInsurance, '2026-10-04')).toMatchObject({ paymentsMade: 0, outstanding: 1_200_000 });
  });

  it('garde le capital entier tant que le prêt n’a pas commencé (différé)', () => {
    const snapshot = loanSnapshot(loan({ firstPaymentDate: '2028-03-15' }), '2026-09-21');
    expect(snapshot).toMatchObject({
      paymentsMade: 0,
      remainingPayments: 12,
      outstanding: 1_200_000,
      repaidRatio: 0,
      next: { date: '2028-03-15', amount: 100_000 },
    });
  });

  it('solde le prêt après la dernière échéance', () => {
    const snapshot = loanSnapshot(withInsurance, '2027-12-01');
    expect(snapshot).toMatchObject({ paymentsMade: 12, remainingPayments: 0, outstanding: 0, repaidRatio: 1, active: false });
    expect(snapshot?.next).toBeUndefined();
  });

  it('additionne les intérêts des échéances à venir', () => {
    const rate = loan({ principal: 1_000_000, annualRate: 12, monthlyPayment: 100_000 });
    const all = buildAmortization(rate).rows;
    const snapshot = loanSnapshot(rate, '2026-11-30'); // 2 échéances payées
    expect(snapshot?.remainingInterest).toBe(all.slice(2).reduce((sum, row) => sum + row.interest, 0));
    expect(snapshot?.remainingInterest).toBeGreaterThan(0);
  });

  it('renvoie null quand l’échéancier est invalide', () => {
    expect(loanSnapshot(loan({ annualRate: 12, principal: 1_000_000, monthlyPayment: 5_000 }), '2026-09-21')).toBeNull();
  });

  describe('avec remboursements anticipés', () => {
    it('mesure l’avance sur la fin du prêt (taux zéro : aucun intérêt économisé)', () => {
      const prepaid = loan({ prepayments: [{ date: '2027-01-05', amount: 300_000, effect: 'DURATION' }] });
      const snapshot = loanSnapshot(prepaid, '2026-09-21');

      expect(snapshot).toMatchObject({ totalPayments: 9, remainingPayments: 9, endDate: '2027-06-05' });
      expect(snapshot?.prepaymentImpact).toEqual({ interestSaved: 0, installmentsSaved: 3, baselineEndDate: '2027-09-05' });
    });

    it('chiffre les intérêts économisés sur les échéances à venir', () => {
      const terms = { principal: 1_000_000, annualRate: 12, monthlyPayment: 100_000 };
      const prepaid = loan({ ...terms, prepayments: [{ date: '2026-10-05', amount: 200_000, effect: 'DURATION' }] });
      const withoutRows = buildAmortization(loan(terms)).rows;
      const withRows = buildAmortization(prepaid).rows;
      const sum = (rows: typeof withRows) => rows.reduce((total, row) => total + row.interest, 0);

      const impact = loanSnapshot(prepaid, '2026-09-21')?.prepaymentImpact;
      expect(impact?.interestSaved).toBe(sum(withoutRows) - sum(withRows));
      expect(impact?.interestSaved).toBeGreaterThan(0);
      expect(impact?.installmentsSaved).toBe(withoutRows.length - withRows.length);
    });

    it('économise aussi des intérêts en réduisant seulement la mensualité', () => {
      const prepaid = loan({
        principal: 1_000_000,
        annualRate: 12,
        prepayments: [{ date: '2026-11-05', amount: 300_000, effect: 'PAYMENT' }],
      });
      const impact = loanSnapshot(prepaid, '2026-09-21')?.prepaymentImpact;
      expect(impact?.interestSaved).toBeGreaterThan(0);
      expect(impact?.installmentsSaved).toBeLessThanOrEqual(1);
    });

    it('reflète un remboursement déjà effectué dans le capital restant dû d’aujourd’hui', () => {
      const prepaid = loan({ prepayments: [{ date: '2026-11-05', amount: 300_000, effect: 'DURATION' }] });
      // 2 échéances payées (1 100 000, 1 000 000 c), puis 300 000 c remboursés à la 2e échéance
      expect(loanSnapshot(prepaid, '2026-12-01')).toMatchObject({ paymentsMade: 2, outstanding: 700_000 });
    });

    it('signale les remboursements sans échéance pour les recevoir', () => {
      const prepaid = loan({ prepayments: [{ date: '2040-01-01', amount: 100_000, effect: 'DURATION' }] });
      expect(loanSnapshot(prepaid, '2026-09-21')?.ignoredPrepayments).toBe(1);
    });

    it('suit la mensualité réduite dans la prochaine échéance', () => {
      const prepaid = loan({ prepayments: [{ date: '2026-10-05', amount: 300_000, effect: 'PAYMENT' }] });
      // après la 1re échéance : 1 100 000 c, 11 échéances restantes ; 300 000 c remboursés => 800 000 c sur 11 échéances
      const snapshot = loanSnapshot(prepaid, '2026-10-10');
      expect(snapshot?.next).toEqual({ date: '2026-11-05', amount: 72_728 });
      expect(snapshot?.monthlyPayment).toBe(72_728);
      expect(loanSnapshot(prepaid, '2026-09-21')?.monthlyPayment).toBe(100_000); // avant l'échéance qui reçoit le remboursement
    });

    it('garde la mensualité pleine (et non la dernière, plus petite) quand il ne reste qu’une échéance', () => {
      const small = loan({ principal: 250_000, monthlyPayment: 100_000 }); // 100 000, 100 000, 50 000
      expect(loanSnapshot(small, '2026-11-10')).toMatchObject({ remainingPayments: 1, monthlyPayment: 100_000, next: { amount: 50_000 } });
    });
  });
});

describe('measurePrepayments', () => {
  const terms = { principal: 1_000_000, annualRate: 12, monthlyPayment: 100_000 };
  const build = (prepayments: LoanPrepayment[] | undefined) => buildAmortization(loan({ ...terms, prepayments }));
  const baseline = build(undefined);

  it('mesure les intérêts et les échéances économisés, et la date de fin d’origine', () => {
    const actual = build([{ date: '2026-11-05', amount: 300_000, effect: 'DURATION' }]);
    const impact = measurePrepayments(actual, baseline, '');

    const interest = (rows: typeof baseline.rows) => rows.reduce((total, row) => total + row.interest, 0);
    expect(impact?.interestSaved).toBe(interest(baseline.rows) - interest(actual.rows));
    expect(impact?.installmentsSaved).toBe(baseline.rows.length - actual.rows.length);
    expect(impact?.baselineEndDate).toBe(baseline.rows[baseline.rows.length - 1].date);
    expect(impact?.reducedPayment).toBeUndefined();
  });

  it('ne compte que les intérêts postérieurs à la date donnée', () => {
    const actual = build([{ date: '2026-11-05', amount: 300_000, effect: 'DURATION' }]);
    const all = measurePrepayments(actual, baseline, '');
    const later = measurePrepayments(actual, baseline, '2026-11-05');
    const none = measurePrepayments(actual, baseline, '2099-01-01');

    // les intérêts de la 1re échéance et de la 2e (avant / le jour du remboursement) sont communs aux deux échéanciers
    expect(later?.interestSaved).toBe(all?.interestSaved);
    expect(none?.interestSaved).toBe(0);
  });

  it('indique la mensualité réduite quand un remboursement réduit la mensualité', () => {
    const actual = build([{ date: '2026-11-05', amount: 300_000, effect: 'PAYMENT' }]);
    const impact = measurePrepayments(actual, baseline, '');
    expect(impact?.reducedPayment).toBe(finalRegularPayment(actual.rows));
    expect(impact?.reducedPayment).toBeLessThan(100_000);
  });

  it('ne renvoie rien si l’un des échéanciers est incomplet ou vide', () => {
    const incomplete = buildAmortization(loan({ principal: 1_000_000, annualRate: 12, monthlyPayment: 5_000 }));
    expect(measurePrepayments(incomplete, baseline, '')).toBeUndefined();
    expect(measurePrepayments(baseline, incomplete, '')).toBeUndefined();
    expect(measurePrepayments(buildAmortization(loan({ principal: 0 })), baseline, '')).toBeUndefined();
  });
});

describe('finalRegularPayment', () => {
  it('ignore la dernière échéance quand elle est plus petite', () => {
    expect(finalRegularPayment(buildAmortization(loan({ principal: 250_000, monthlyPayment: 100_000 })).rows)).toBe(100_000);
  });

  it('vaut la seule échéance d’un prêt en une fois, et 0 sans échéance', () => {
    expect(finalRegularPayment(buildAmortization(loan({ principal: 50_000, monthlyPayment: 100_000 })).rows)).toBe(50_000);
    expect(finalRegularPayment([])).toBe(0);
  });
});

describe('projectLoans', () => {
  const a = loan({ id: 'a', principal: 1_200_000, firstPaymentDate: '2026-10-05' }); // 12 × 1 000 €, fin sept. 2027
  const b = loan({ id: 'b', principal: 300_000, monthlyInsurance: 1_000, firstPaymentDate: '2026-11-20' }); // fin janv. 2027
  const projection = projectLoans([a, b], REFERENCE);
  const at = (index: number) => [projection.points[index].month, projection.points[index].outstanding, projection.points[index].payments];

  it('suit le capital restant dû et les mensualités mois par mois', () => {
    expect(projection.points).toHaveLength(61);
    expect(at(0)).toEqual(['2026-09', 1_500_000, 0]);
    expect(at(1)).toEqual(['2026-10', 1_400_000, 100_000]);
    expect(at(2)).toEqual(['2026-11', 1_200_000, 201_000]); // 1 000 € + 1 000 € + 10 € d'assurance
    expect(at(4)).toEqual(['2027-01', 800_000, 201_000]);
    expect(at(5)).toEqual(['2027-02', 700_000, 100_000]); // le prêt b est soldé
    expect(at(12)).toEqual(['2027-09', 0, 100_000]);
    expect(at(13)).toEqual(['2027-10', 0, 0]);
  });

  it('résume aujourd’hui, dans 1, 2, 3 et 5 ans', () => {
    expect(projection.horizons.map((horizon) => [horizon.months, horizon.outstanding, horizon.payments])).toEqual([
      [0, 1_500_000, 0],
      [12, 0, 100_000],
      [24, 0, 0],
      [36, 0, 0],
      [60, 0, 0],
    ]);
  });

  it('liste les fins de prêts à venir avec la charge mensuelle libérée', () => {
    expect(projection.ends).toEqual([
      { loanId: 'b', endDate: '2027-01-20', freedMonthly: 101_000 },
      { loanId: 'a', endDate: '2027-09-05', freedMonthly: 100_000 },
    ]);
  });

  it('ignore les prêts déjà soldés dans les fins à venir', () => {
    const finished = loan({ id: 'old', principal: 200_000, firstPaymentDate: '2025-01-10' });
    expect(projectLoans([finished], REFERENCE).ends).toEqual([]);
    expect(projectLoans([finished], REFERENCE).points[0].outstanding).toBe(0);
  });

  it('est nulle sans prêt', () => {
    const empty = projectLoans([], REFERENCE);
    expect(empty.points.every((point) => point.outstanding === 0 && point.payments === 0)).toBe(true);
    expect(empty.ends).toEqual([]);
  });

  it('tient compte des remboursements anticipés : capital plus bas, fin avancée, mensualités hors remboursement', () => {
    const prepaid = loan({ prepayments: [{ date: '2027-01-05', amount: 300_000, effect: 'DURATION' }] });
    const result = projectLoans([prepaid], REFERENCE);

    expect(result.points[3]).toMatchObject({ month: '2026-12', outstanding: 900_000, payments: 100_000 });
    expect(result.points[4]).toMatchObject({ month: '2027-01', outstanding: 500_000, payments: 100_000 }); // 300 000 c hors « mensualités »
    expect(result.points[9]).toMatchObject({ month: '2027-06', outstanding: 0, payments: 100_000 });
    expect(result.points[10]).toMatchObject({ outstanding: 0, payments: 0 });
    expect(result.ends).toEqual([{ loanId: 'l1', endDate: '2027-06-05', freedMonthly: 100_000 }]);
  });

  it('libère la mensualité réduite (et non l’ancienne) quand un prêt à mensualité réduite se termine', () => {
    const prepaid = loan({ prepayments: [{ date: '2027-01-05', amount: 300_000, effect: 'PAYMENT' }] });
    const result = projectLoans([prepaid], REFERENCE);
    expect(result.ends).toEqual([{ loanId: 'l1', endDate: '2027-09-05', freedMonthly: 62_500 }]);
    expect(result.points[6]).toMatchObject({ month: '2027-03', payments: 62_500 });
  });

  it('compte le capital d’un prêt en différé comme dû', () => {
    const deferred = projectLoans([loan({ firstPaymentDate: '2027-06-15' })], REFERENCE);
    expect(deferred.points[0].outstanding).toBe(1_200_000);
    expect(deferred.points[8].outstanding).toBe(1_200_000); // mai 2027 : rien n'est encore remboursé
    expect(deferred.points[9].outstanding).toBe(1_100_000); // juin 2027 : première échéance
  });
});

describe('loanPaymentsInYear', () => {
  const loans = [
    loan({ id: 'a', principal: 1_200_000, firstPaymentDate: '2026-10-05' }),
    loan({ id: 'b', principal: 300_000, monthlyInsurance: 1_000, firstPaymentDate: '2026-11-20' }),
  ];

  it('n’ajoute pas les remboursements anticipés aux mensualités et raccourcit les années suivantes', () => {
    const prepaid = [loan({ prepayments: [{ date: '2027-01-05', amount: 300_000, effect: 'DURATION' }] })];
    expect(loanPaymentsInYear(prepaid, 2026)).toBe(300_000);
    expect(loanPaymentsInYear(prepaid, 2027)).toBe(600_000); // 6 échéances au lieu de 9
  });

  it('additionne les mensualités, assurance comprise, dues dans l’année civile', () => {
    expect(loanPaymentsInYear(loans, 2026)).toBe(300_000 + 2 * 101_000); // a : oct.-déc. ; b : nov.-déc.
    expect(loanPaymentsInYear(loans, 2027)).toBe(900_000 + 101_000); // a : janv.-sept. ; b : janv.
    expect(loanPaymentsInYear(loans, 2028)).toBe(0);
    expect(loanPaymentsInYear(loans, 2025)).toBe(0);
  });
});
