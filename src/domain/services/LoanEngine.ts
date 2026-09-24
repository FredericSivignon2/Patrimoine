import { BUDGET_HORIZONS, type BudgetHorizon } from '../models/Budget';
import { MAX_LOAN_MONTHS, type Loan } from '../models/Loan';
import { MAX_PROJECTION_MONTHS, type MonthKey } from '../models/Projection';
import { monthlyInterest, sumCents, type Cents } from './FinancialMath';
import type { LockLot } from './LockEngine';
import { addMonths, addMonthsToDate, lastDayOfMonth, monthKeyOfDate, monthKeyOfIso, toIsoDate } from './Months';

/**
 * Lots réservés sur un compte, tous prêts confondus : la part de leur capital versée mais pas encore payée à sa
 * destination. Comme une tranche « disponible à la retraite », sans date de fin : toujours compté comme non
 * disponible jusqu'à ce que l'allocation soit retirée du prêt.
 */
export function reservedLotsOf(accountId: string, loans: readonly Loan[]): LockLot[] {
  return loans.flatMap((loan) =>
    (loan.reservedFunds?.allocations ?? [])
      .filter((allocation) => allocation.accountId === accountId)
      .map((allocation): LockLot => ({ amount: allocation.amount })),
  );
}

export type LoanTerms = Pick<
  Loan,
  'principal' | 'annualRate' | 'monthlyPayment' | 'firstPaymentDate' | 'prepayments'
>;

export interface AmortizationRow {
  /** Numéro d'échéance, à partir de 1. */
  number: number;
  date: string;
  interest: Cents;
  principal: Cents;
  /** Intérêts + capital de l'échéance, hors assurance et hors remboursement anticipé. */
  payment: Cents;
  /** Remboursements anticipés imputés après cette échéance (0 s'il n'y en a pas). */
  prepayment: Cents;
  /** Capital restant dû après cette échéance et ses éventuels remboursements anticipés. */
  balanceAfter: Cents;
}

export interface Amortization {
  rows: AmortizationRow[];
  /** Vrai si le capital est entièrement remboursé dans la limite de durée (`MAX_LOAN_MONTHS`). */
  complete: boolean;
  /** Remboursements anticipés sans échéance pour les recevoir (postérieurs à la fin du prêt). */
  ignoredPrepayments: number;
}

/** Nombre d'échéances pour solder `balance` avec `monthlyPayment` (0 si le prêt ne peut pas être soldé). */
function installmentsToClear(balance: Cents, annualRate: number, monthlyPayment: Cents): number {
  const { rows, complete } = buildAmortization({
    principal: balance,
    annualRate,
    monthlyPayment,
    firstPaymentDate: '2000-01-01',
  });
  return complete ? rows.length : 0;
}

/**
 * Échéancier à mensualités constantes : chaque mois, intérêts = capital restant dû × taux / 12 (arrondis au centime,
 * en points de base entiers), le reste de la mensualité rembourse le capital ; la dernière échéance solde le prêt.
 *
 * Un remboursement anticipé est imputé à la première échéance dont la date est postérieure ou égale à la sienne,
 * APRÈS le paiement de cette échéance (les intérêts de la période portent sur l'ancien capital). Il réduit soit la
 * durée (la mensualité reste), soit la mensualité (le nombre d'échéances restantes est conservé).
 *
 * L'échéancier s'arrête, incomplet, si la mensualité ne couvre pas les intérêts ou si la durée dépasse `MAX_LOAN_MONTHS`.
 */
export function buildAmortization(terms: LoanTerms): Amortization {
  const pending = [...(terms.prepayments ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const rows: AmortizationRow[] = [];
  let balance = terms.principal;
  let monthlyPayment = terms.monthlyPayment;
  let applied = 0;

  while (balance > 0 && rows.length < MAX_LOAN_MONTHS) {
    const date = addMonthsToDate(terms.firstPaymentDate, rows.length);
    const interest = monthlyInterest(balance, terms.annualRate);
    const principal = Math.min(monthlyPayment - interest, balance);
    if (principal <= 0) break;
    balance -= principal;

    let prepayment = 0;
    while (applied < pending.length && pending[applied].date <= date && balance > 0) {
      const { amount: requested, effect } = pending[applied];
      applied += 1;
      const amount = Math.min(requested, balance);
      const remainingInstallments = effect === 'PAYMENT' ? installmentsToClear(balance, terms.annualRate, monthlyPayment) : 0;
      balance -= amount;
      prepayment += amount;
      if (effect === 'PAYMENT' && balance > 0 && remainingInstallments > 0) {
        monthlyPayment = paymentForTerm(balance, terms.annualRate, remainingInstallments) ?? monthlyPayment;
      }
    }

    rows.push({
      number: rows.length + 1,
      date,
      interest,
      principal,
      payment: interest + principal,
      prepayment,
      balanceAfter: balance,
    });
  }
  return { rows, complete: balance === 0, ignoredPrepayments: pending.length - applied };
}

/** Plus petite mensualité qui rembourse le capital en `months` échéances au plus ; `null` si la durée est hors limites. */
export function paymentForTerm(principal: Cents, annualRate: number, months: number): Cents | null {
  if (principal <= 0 || !Number.isInteger(months) || months < 1 || months > MAX_LOAN_MONTHS) return null;

  const finishesInTime = (monthlyPayment: Cents): boolean => {
    const { rows, complete } = buildAmortization({ principal, annualRate, monthlyPayment, firstPaymentDate: '2000-01-01' });
    return complete && rows.length <= months;
  };

  let low = 1;
  let high = principal + monthlyInterest(principal, annualRate); // tout rembourser d'un coup : toujours suffisant
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (finishesInTime(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** Capital restant dû à la date `asOf` : solde après la dernière échéance passée (le capital initial avant la première). */
export function outstandingAt(rows: readonly AmortizationRow[], principal: Cents, asOf: string): Cents {
  let outstanding = principal;
  for (const row of rows) {
    if (row.date > asOf) break;
    outstanding = row.balanceAfter;
  }
  return outstanding;
}

export interface ScheduleProgress {
  /** Échéances dont la date est passée ou égale à `asOf` : considérées payées. */
  paid: number;
  upcoming: AmortizationRow[];
  /** Capital restant dû à `asOf`. */
  outstanding: Cents;
}

/** Où en est un échéancier à la date `asOf` : les échéances passées sont payées, sans rien à saisir. */
export function scheduleProgressAt(rows: readonly AmortizationRow[], principal: Cents, asOf: string): ScheduleProgress {
  const paid = rows.filter((row) => row.date <= asOf).length;
  return { paid, upcoming: rows.slice(paid), outstanding: outstandingAt(rows, principal, asOf) };
}

/** Dernière mensualité « pleine » d'un échéancier (la toute dernière échéance peut être plus petite). */
export function finalRegularPayment(rows: readonly AmortizationRow[]): Cents {
  if (rows.length === 0) return 0;
  return (rows.length > 1 ? rows[rows.length - 2] : rows[0]).payment;
}

/** Charge mensuelle du prêt : mensualité + assurance. */
export function monthlyCommitment(loan: Pick<Loan, 'monthlyPayment' | 'monthlyInsurance'>): Cents {
  return loan.monthlyPayment + (loan.monthlyInsurance ?? 0);
}

/** Ce que les remboursements anticipés changent par rapport au même prêt sans eux (à partir d'aujourd'hui). */
export interface PrepaymentImpact {
  /** Intérêts des échéances à venir en moins. */
  interestSaved: Cents;
  /** Échéances en moins (0 quand les remboursements réduisent seulement la mensualité). */
  installmentsSaved: number;
  /** Date de fin du prêt sans remboursement anticipé. */
  baselineEndDate: string;
  /** Mensualité (hors assurance) en fin de prêt quand un remboursement la réduit ; absente sinon. */
  reducedPayment?: Cents;
}

/**
 * Ce que les remboursements anticipés de `actual` changent par rapport au même prêt sans eux (`baseline`), sur les
 * échéances postérieures à `since` (chaîne vide : toutes). `undefined` si l'un des échéanciers est vide ou incomplet.
 */
export function measurePrepayments(actual: Amortization, baseline: Amortization, since: string): PrepaymentImpact | undefined {
  if (!actual.complete || !baseline.complete || actual.rows.length === 0 || baseline.rows.length === 0) return undefined;

  const interestAfter = (rows: readonly AmortizationRow[]): Cents =>
    sumCents(rows.filter((row) => row.date > since).map((row) => row.interest));
  const payment = finalRegularPayment(actual.rows);
  return {
    interestSaved: Math.max(0, interestAfter(baseline.rows) - interestAfter(actual.rows)),
    installmentsSaved: Math.max(0, baseline.rows.length - actual.rows.length),
    baselineEndDate: baseline.rows[baseline.rows.length - 1].date,
    reducedPayment: payment < finalRegularPayment(baseline.rows) ? payment : undefined,
  };
}

export interface LoanSnapshot {
  totalPayments: number;
  /** Échéances dont la date est passée ou égale à aujourd'hui. */
  paymentsMade: number;
  remainingPayments: number;
  /** Capital restant dû aujourd'hui. */
  outstanding: Cents;
  /** Mensualité courante hors assurance : elle change après un remboursement anticipé qui réduit la mensualité. */
  monthlyPayment: Cents;
  /** Intérêts des échéances à venir. */
  remainingInterest: Cents;
  /** Prochaine échéance, assurance comprise ; absente si le prêt est soldé. */
  next?: { date: string; amount: Cents };
  /** Date de la dernière échéance. */
  endDate: string;
  /** Part du capital déjà remboursée depuis le début de l'échéancier modélisé (0 à 1), pour l'affichage. */
  repaidRatio: number;
  /** Il reste des échéances à payer. */
  active: boolean;
  /** Présent quand le prêt a des remboursements anticipés. */
  prepaymentImpact?: PrepaymentImpact;
  /** Remboursements anticipés sans échéance pour les recevoir (après la fin du prêt). */
  ignoredPrepayments: number;
}

/** Situation d'un prêt à une date donnée ; `null` si son échéancier est invalide (données modifiées à la main). */
export function loanSnapshot(loan: Loan, today: string): LoanSnapshot | null {
  const amortization = buildAmortization(loan);
  const { rows, complete, ignoredPrepayments } = amortization;
  if (!complete || rows.length === 0) return null;

  const { paid: paymentsMade, upcoming, outstanding } = scheduleProgressAt(rows, loan.principal, today);
  const nextRow = upcoming[0];
  const remainingInterest = sumCents(upcoming.map((row) => row.interest));

  const prepaymentImpact = loan.prepayments?.length
    ? measurePrepayments(amortization, buildAmortization({ ...loan, prepayments: undefined }), today)
    : undefined;

  return {
    totalPayments: rows.length,
    paymentsMade,
    remainingPayments: upcoming.length,
    outstanding,
    monthlyPayment: upcoming.length > 1 ? upcoming[0].payment : finalRegularPayment(rows),
    remainingInterest,
    next: nextRow && { date: nextRow.date, amount: nextRow.payment + (loan.monthlyInsurance ?? 0) },
    endDate: rows[rows.length - 1].date,
    repaidRatio: (loan.principal - outstanding) / loan.principal,
    active: upcoming.length > 0,
    prepaymentImpact,
    ignoredPrepayments,
  };
}

export interface LoanProjectionPoint {
  month: MonthKey;
  /** Capital restant dû total à cette date (aujourd'hui pour le point 0, sinon fin de mois). */
  outstanding: Cents;
  /** Mensualités (assurance comprise) dues dans ce mois calendaire, tous prêts confondus. Hors remboursements anticipés. */
  payments: Cents;
}

export interface LoanHorizon {
  months: BudgetHorizon;
  outstanding: Cents;
  payments: Cents;
}

/** Fin d'un prêt à venir et charge mensuelle qu'elle libère. */
export interface LoanEnd {
  loanId: string;
  endDate: string;
  freedMonthly: Cents;
}

export interface LoansProjection {
  points: LoanProjectionPoint[];
  horizons: LoanHorizon[];
  /** Fins de prêts à venir, de la plus proche à la plus lointaine. */
  ends: LoanEnd[];
}

/**
 * Capital restant dû et mensualités des prêts, mois par mois sur 5 ans (remboursements anticipés compris) ;
 * aucune mensualité n'est saisie comme mouvement.
 */
export function projectLoans(
  loans: readonly Loan[],
  referenceDate: Date,
  months: number = MAX_PROJECTION_MONTHS,
): LoansProjection {
  const today = toIsoDate(referenceDate);
  const startMonth = monthKeyOfDate(referenceDate);
  const schedules = loans.map((loan) => ({ loan, rows: buildAmortization(loan).rows }));

  const paymentsByMonth = new Map<MonthKey, Cents>();
  for (const { loan, rows } of schedules) {
    for (const row of rows) {
      const month = monthKeyOfIso(row.date);
      paymentsByMonth.set(month, (paymentsByMonth.get(month) ?? 0) + row.payment + (loan.monthlyInsurance ?? 0));
    }
  }

  const points: LoanProjectionPoint[] = Array.from({ length: months + 1 }, (_, index) => {
    const month = addMonths(startMonth, index);
    const asOf = index === 0 ? today : lastDayOfMonth(month);
    return {
      month,
      outstanding: sumCents(schedules.map(({ loan, rows }) => outstandingAt(rows, loan.principal, asOf))),
      payments: paymentsByMonth.get(month) ?? 0,
    };
  });

  const ends = schedules
    .flatMap(({ loan, rows }): LoanEnd[] => {
      const last = rows[rows.length - 1];
      if (!last || last.date <= today) return [];
      // Charge libérée : la dernière mensualité « pleine ».
      return [{ loanId: loan.id, endDate: last.date, freedMonthly: finalRegularPayment(rows) + (loan.monthlyInsurance ?? 0) }];
    })
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  return {
    points,
    horizons: BUDGET_HORIZONS.map((horizon) => ({
      months: horizon,
      outstanding: points[horizon].outstanding,
      payments: points[horizon].payments,
    })),
    ends,
  };
}

/** Somme des mensualités (assurance comprise) dues dans l'année civile `year`, d'après les échéanciers. */
export function loanPaymentsInYear(loans: readonly Loan[], year: number): Cents {
  const prefix = `${String(year).padStart(4, '0')}-`;
  return sumCents(
    loans.flatMap((loan) =>
      buildAmortization(loan)
        .rows.filter((row) => row.date.startsWith(prefix))
        .map((row) => row.payment + (loan.monthlyInsurance ?? 0)),
    ),
  );
}
