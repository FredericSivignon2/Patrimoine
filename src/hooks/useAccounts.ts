import { useCallback, useMemo } from 'react';
import { useFinancial } from '../context/FinancialContext';
import type { AccountPatch, NewAccount } from '../domain/models/Account';
import { sumCents } from '../domain/services/FinancialMath';
import { computeBalance, computeLocked, computeReserved } from '../domain/services/ProjectionEngine';

export function useAccounts() {
  const { accounts, movements, loans, accountRepository } = useFinancial();

  const balances = useMemo(
    () => new Map(accounts.map((account) => [account.id, computeBalance(account, movements)])),
    [accounts, movements],
  );

  /** Part bloquée (fonds bloqués réglementaires) de chaque compte, 0 s'il n'y en a pas. */
  const locked = useMemo(() => {
    const now = new Date();
    return new Map(accounts.map((account) => [account.id, computeLocked(account, movements, now)]));
  }, [accounts, movements]);

  /** Part réservée pour un ou plusieurs prêts (versée mais pas encore payée à sa destination), 0 s'il n'y en a pas. */
  const reserved = useMemo(() => {
    const now = new Date();
    return new Map(accounts.map((account) => [account.id, computeReserved(account, movements, now, loans)]));
  }, [accounts, movements, loans]);

  const totals = useMemo(() => {
    const balanceOf = (id: string): number => balances.get(id) ?? 0;
    const ofType = (type: 'CHECKING' | 'SAVINGS'): number =>
      sumCents(accounts.filter((account) => account.type === type).map((account) => balanceOf(account.id)));
    const total = sumCents(accounts.map((account) => balanceOf(account.id)));
    const lockedTotal = sumCents(accounts.map((account) => locked.get(account.id) ?? 0));
    const reservedTotal = sumCents(accounts.map((account) => reserved.get(account.id) ?? 0));
    return {
      total,
      checking: ofType('CHECKING'),
      savings: ofType('SAVINGS'),
      locked: lockedTotal,
      reserved: reservedTotal,
      /** Patrimoine déblocable : ce qui est immédiatement utilisable. */
      available: total - lockedTotal - reservedTotal,
    };
  }, [accounts, balances, locked, reserved]);

  const createAccount = useCallback((input: NewAccount) => accountRepository.create(input), [accountRepository]);
  const updateAccount = useCallback(
    (id: string, patch: AccountPatch) => accountRepository.update(id, patch),
    [accountRepository],
  );
  const removeAccount = useCallback((id: string) => accountRepository.remove(id), [accountRepository]);

  return { accounts, balances, locked, reserved, totals, createAccount, updateAccount, removeAccount };
}
