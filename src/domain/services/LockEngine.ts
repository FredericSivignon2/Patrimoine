import type { Account } from '../models/Account';
import type { Movement } from '../models/Movement';
import type { UnlockEvent } from '../models/Projection';
import { sumCents, type Cents } from './FinancialMath';
import { addYears, monthKeyOfIso, toIsoDate } from './Months';

/** Somme bloquée jusqu'à `unlockDate`. */
export interface LockLot {
  amount: Cents;
  unlockDate: string;
}

/**
 * Lots bloqués d'un compte d'épargne : le stock saisi (`lockedTranches`) et, si le compte bloque ses versements
 * (`depositLockYears`), un lot par versement enregistré, débloqué N ans après sa date. Aucun lot sur un compte courant.
 */
export function lockLotsOf(account: Account, movements: readonly Movement[]): LockLot[] {
  if (account.type !== 'SAVINGS') return [];

  const lots: LockLot[] = (account.lockedTranches ?? []).map(({ amount, unlockDate }) => ({ amount, unlockDate }));
  const years = account.depositLockYears ?? 0;
  if (years > 0) {
    for (const movement of movements) {
      if (movement.accountId === account.id && movement.type === 'DEPOSIT') {
        lots.push({ amount: movement.amount, unlockDate: addYears(movement.date, years) });
      }
    }
  }
  return lots;
}

/** Montant encore bloqué à la date `asOf` (ISO) : lots non débloqués, plafonnés au solde positif du compte. */
export function lockedAmountAt(lots: readonly LockLot[], asOf: string, balance: Cents): Cents {
  const locked = sumCents(lots.filter((lot) => lot.unlockDate > asOf).map((lot) => lot.amount));
  return Math.min(locked, Math.max(balance, 0));
}

/** Déblocages à venir, regroupés par compte et par mois, du plus proche au plus lointain. */
export function unlockSchedule(
  accounts: readonly Account[],
  movements: readonly Movement[],
  referenceDate: Date,
): UnlockEvent[] {
  const today = toIsoDate(referenceDate);
  const events = new Map<string, UnlockEvent>();
  for (const account of accounts) {
    for (const lot of lockLotsOf(account, movements)) {
      if (lot.unlockDate <= today) continue;
      const month = monthKeyOfIso(lot.unlockDate);
      const key = `${account.id}|${month}`;
      const existing = events.get(key);
      if (existing) existing.amount += lot.amount;
      else events.set(key, { accountId: account.id, month, amount: lot.amount });
    }
  }
  return [...events.values()].sort((a, b) => a.month.localeCompare(b.month) || a.accountId.localeCompare(b.accountId));
}
