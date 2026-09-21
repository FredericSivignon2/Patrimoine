import { useCallback, useMemo } from 'react';
import { useFinancial } from '../context/FinancialContext';
import type { AccountPatch, NewAccount } from '../domain/models/Account';
import { sumCents } from '../domain/services/FinancialMath';
import { computeBalance, computeLocked } from '../domain/services/ProjectionEngine';

export function useAccounts() {
  const { accounts, movements, accountRepository } = useFinancial();

  const balances = useMemo(
    () => new Map(accounts.map((account) => [account.id, computeBalance(account, movements)])),
    [accounts, movements],
  );

  /** Part bloquée de chaque compte (0 pour un compte sans fonds bloqués). */
  const locked = useMemo(() => {
    const now = new Date();
    return new Map(accounts.map((account) => [account.id, computeLocked(account, movements, now)]));
  }, [accounts, movements]);

  const totals = useMemo(() => {
    const balanceOf = (id: string): number => balances.get(id) ?? 0;
    const ofType = (type: 'CHECKING' | 'SAVINGS'): number =>
      sumCents(accounts.filter((account) => account.type === type).map((account) => balanceOf(account.id)));
    const total = sumCents(accounts.map((account) => balanceOf(account.id)));
    const lockedTotal = sumCents(accounts.map((account) => locked.get(account.id) ?? 0));
    return {
      total,
      checking: ofType('CHECKING'),
      savings: ofType('SAVINGS'),
      locked: lockedTotal,
      /** Patrimoine déblocable : ce qui est immédiatement utilisable. */
      available: total - lockedTotal,
    };
  }, [accounts, balances, locked]);

  const createAccount = useCallback((input: NewAccount) => accountRepository.create(input), [accountRepository]);
  const updateAccount = useCallback(
    (id: string, patch: AccountPatch) => accountRepository.update(id, patch),
    [accountRepository],
  );
  const removeAccount = useCallback((id: string) => accountRepository.remove(id), [accountRepository]);

  return { accounts, balances, locked, totals, createAccount, updateAccount, removeAccount };
}
