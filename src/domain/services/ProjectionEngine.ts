import type { Account } from '../models/Account';
import type { Loan } from '../models/Loan';
import type { Movement } from '../models/Movement';
import {
  MAX_PROJECTION_MONTHS,
  PROJECTION_HORIZONS,
  type AccountProjection,
  type MonthKey,
  type MonthlyNet,
  type PortfolioProjection,
  type ProjectionPoint,
} from '../models/Projection';
import { monthlyInterest, sumCents, type Cents } from './FinancialMath';
import { lockedAmountAt, lockLotsOf, type LockLot } from './LockEngine';
import { reservedLotsOf } from './LoanEngine';
import { addMonths, addYears, lastDayOfMonth, monthKeyOfDate, monthKeyOfIso, monthRange, toIsoDate } from './Months';

const NO_LOANS: readonly Loan[] = [];

/** Nombre de mois complets pris en compte pour la moyenne mensuelle constatée. */
export const DEFAULT_LOOKBACK_MONTHS = 12;

/** Solde courant : solde initial + versements - retraits. */
export function computeBalance(account: Account, movements: readonly Movement[]): Cents {
  let balance = account.initialBalance;
  for (const movement of movements) {
    if (movement.accountId !== account.id) continue;
    balance += movement.type === 'DEPOSIT' ? movement.amount : -movement.amount;
  }
  return balance;
}

/** Montant bloqué aujourd'hui sur un compte (jamais plus que son solde). */
export function computeLocked(account: Account, movements: readonly Movement[], referenceDate: Date): Cents {
  const own = movements.filter((movement) => movement.accountId === account.id);
  return lockedAmountAt(lockLotsOf(account, own), toIsoDate(referenceDate), computeBalance(account, own));
}

/**
 * Montant réservé aujourd'hui pour un ou plusieurs prêts (versé mais pas encore payé à sa destination), plafonné à
 * ce qu'il reste sur le compte une fois le bloqué réglementaire déjà compté (jamais les deux sur la même part).
 */
export function computeReserved(
  account: Account,
  movements: readonly Movement[],
  referenceDate: Date,
  loans: readonly Loan[],
): Cents {
  const own = movements.filter((movement) => movement.accountId === account.id);
  const locked = computeLocked(account, movements, referenceDate);
  const ceiling = Math.max(0, computeBalance(account, own) - locked);
  return lockedAmountAt(reservedLotsOf(account.id, loans), toIsoDate(referenceDate), ceiling);
}

/** Versements, retraits et net pour chaque mois de `fromMonth` à `toMonth` inclus (mois sans mouvement à zéro). */
export function monthlyNetSeries(
  movements: readonly Movement[],
  fromMonth: MonthKey,
  toMonth: MonthKey,
): MonthlyNet[] {
  const buckets = new Map<MonthKey, MonthlyNet>(
    monthRange(fromMonth, toMonth).map((month) => [month, { month, deposits: 0, withdrawals: 0, net: 0 }]),
  );
  for (const movement of movements) {
    const bucket = buckets.get(monthKeyOfIso(movement.date));
    if (!bucket) continue;
    if (movement.type === 'DEPOSIT') bucket.deposits += movement.amount;
    else bucket.withdrawals += movement.amount;
    bucket.net = bucket.deposits - bucket.withdrawals;
  }
  return [...buckets.values()];
}

/**
 * Épargne mensuelle constatée : moyenne des versements nets par mois.
 * La moyenne porte sur les `lookbackMonths` derniers mois COMPLETS (le mois en cours, partiel, est exclu),
 * sans remonter avant le premier mouvement. S'il n'existe pas encore de mois complet, le mois en cours est utilisé.
 * Les mois sans mouvement comptent pour zéro. Résultat arrondi au centime.
 */
export function averageMonthlyNet(
  movements: readonly Movement[],
  referenceDate: Date,
  lookbackMonths: number = DEFAULT_LOOKBACK_MONTHS,
): Cents {
  if (movements.length === 0) return 0;

  const currentMonth = monthKeyOfDate(referenceDate);
  const lastCompletedMonth = addMonths(currentMonth, -1);
  const firstMonth = movements.map((movement) => monthKeyOfIso(movement.date)).reduce((a, b) => (a < b ? a : b));
  const earliestAllowed = addMonths(lastCompletedMonth, -(lookbackMonths - 1));
  const windowStart = firstMonth > earliestAllowed ? firstMonth : earliestAllowed;

  const [from, to] =
    windowStart <= lastCompletedMonth ? [windowStart, lastCompletedMonth] : [currentMonth, currentMonth];
  const series = monthlyNetSeries(movements, from, to);
  return Math.round(sumCents(series.map((month) => month.net)) / series.length);
}

export interface ProjectionParams {
  startingBalance: Cents;
  /** Versement net ajouté à la fin de chaque mois. */
  monthlyContribution: Cents;
  /** Taux annuel en pourcentage ; intérêts composés mensuellement (taux / 12) sur le solde d'ouverture du mois. */
  annualRatePercent: number;
  months: number;
}

/** Soldes projetés : index 0 = solde de départ, index n = solde après n mois. */
export function projectBalances({
  startingBalance,
  monthlyContribution,
  annualRatePercent,
  months,
}: ProjectionParams): Cents[] {
  const balances: Cents[] = [startingBalance];
  let balance = startingBalance;
  for (let month = 0; month < months; month++) {
    balance += monthlyInterest(balance, annualRatePercent) + monthlyContribution;
    balances.push(balance);
  }
  return balances;
}

interface FutureLot extends LockLot {
  /** Index du point de projection auquel le versement est effectué. */
  createdAt: number;
}

/**
 * Projection d'un compte. La part bloquée de chaque point tient compte des lots existants (stock saisi et versements
 * passés), et, si le compte bloque ses versements, des versements mensuels projetés, eux aussi bloqués N ans.
 * La part réservée (`loans`) n'a pas de date de fin : elle reste identique à chaque point tant qu'elle n'est pas
 * retirée du prêt, plafonnée à ce qu'il reste une fois le bloqué compté. Les intérêts sont considérés comme
 * disponibles. Le point 0 est évalué aujourd'hui, les suivants en fin de mois.
 */
export function projectAccount(
  account: Account,
  movements: readonly Movement[],
  referenceDate: Date,
  months: number = MAX_PROJECTION_MONTHS,
  loans: readonly Loan[] = NO_LOANS,
): AccountProjection {
  const ownMovements = movements.filter((movement) => movement.accountId === account.id);
  const currentBalance = computeBalance(account, ownMovements);
  const monthlyContribution = averageMonthlyNet(ownMovements, referenceDate);
  const annualRate = account.interestRate ?? 0;

  const startMonth = monthKeyOfDate(referenceDate);
  const balances = projectBalances({
    startingBalance: currentBalance,
    monthlyContribution,
    annualRatePercent: annualRate,
    months,
  });

  const existingLots = lockLotsOf(account, ownMovements);
  const lockYears = account.type === 'SAVINGS' ? (account.depositLockYears ?? 0) : 0;
  const futureLots: FutureLot[] =
    lockYears > 0 && monthlyContribution > 0
      ? Array.from({ length: months }, (_, index) => ({
          createdAt: index + 1,
          amount: monthlyContribution,
          unlockDate: addYears(lastDayOfMonth(addMonths(startMonth, index + 1)), lockYears),
        }))
      : [];
  const reservedLots = reservedLotsOf(account.id, loans);

  const today = toIsoDate(referenceDate);
  const points: ProjectionPoint[] = balances.map((balance, index) => {
    const month = addMonths(startMonth, index);
    const asOf = index === 0 ? today : lastDayOfMonth(month);
    const lots = [...existingLots, ...futureLots.filter((lot) => lot.createdAt <= index)];
    const locked = lockedAmountAt(lots, asOf, balance);
    const reserved = lockedAmountAt(reservedLots, asOf, Math.max(0, balance - locked));
    return { month, balance, locked, reserved, available: balance - locked - reserved };
  });

  return {
    accountId: account.id,
    currentBalance,
    currentLocked: points[0].locked,
    currentReserved: points[0].reserved,
    monthlyContribution,
    annualRate,
    points,
  };
}

/** Projection du patrimoine : somme des projections de chaque compte (chacun avec sa moyenne et son taux). */
export function projectPortfolio(
  accounts: readonly Account[],
  movements: readonly Movement[],
  referenceDate: Date,
  loans: readonly Loan[] = NO_LOANS,
): PortfolioProjection {
  const projections = accounts.map((account) => projectAccount(account, movements, referenceDate, MAX_PROJECTION_MONTHS, loans));
  const startMonth = monthKeyOfDate(referenceDate);

  const points: ProjectionPoint[] = Array.from({ length: MAX_PROJECTION_MONTHS + 1 }, (_, index) => {
    const balance = sumCents(projections.map((projection) => projection.points[index].balance));
    const locked = sumCents(projections.map((projection) => projection.points[index].locked));
    const reserved = sumCents(projections.map((projection) => projection.points[index].reserved));
    return { month: addMonths(startMonth, index), balance, locked, reserved, available: balance - locked - reserved };
  });

  return {
    currentBalance: points[0].balance,
    currentLocked: points[0].locked,
    currentReserved: points[0].reserved,
    currentAvailable: points[0].available,
    monthlyContribution: sumCents(projections.map((projection) => projection.monthlyContribution)),
    points,
    horizons: PROJECTION_HORIZONS.map((months) => ({
      months,
      balance: points[months].balance,
      locked: points[months].locked,
      reserved: points[months].reserved,
      available: points[months].available,
    })),
    accounts: projections,
  };
}
