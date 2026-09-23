import type { Account, AccountPatch, NewAccount } from '../../domain/models/Account';
import { NotFoundError } from '../../domain/models/errors';
import type { IAccountRepository } from '../../domain/repositories/IAccountRepository';
import { newId } from '../../domain/services/ids';
import { validateAccount } from '../../domain/services/Validation';
import type { PatrimoineStore } from '../storage/PatrimoineStore';

export class AccountRepository implements IAccountRepository {
  constructor(private readonly store: PatrimoineStore) {}

  async list(): Promise<Account[]> {
    return this.store.snapshot().accounts;
  }

  async getById(id: string): Promise<Account | undefined> {
    return this.store.snapshot().accounts.find((account) => account.id === id);
  }

  create(input: NewAccount): Promise<Account> {
    return this.store.mutate((data) => {
      const account: Account = { id: newId(), ...validateAccount(input, data.banks) };
      return { next: { ...data, accounts: [...data.accounts, account] }, result: account };
    });
  }

  update(id: string, patch: AccountPatch): Promise<Account> {
    return this.store.mutate((data) => {
      const existing = data.accounts.find((account) => account.id === id);
      if (!existing) throw new NotFoundError(`Compte introuvable : ${id}`);
      const { id: _id, ...current } = existing;
      const updated: Account = { id, ...validateAccount({ ...current, ...patch }, data.banks) };
      return {
        next: { ...data, accounts: data.accounts.map((account) => (account.id === id ? updated : account)) },
        result: updated,
      };
    });
  }

  /** Supprime le compte, ses mouvements, et retire ses éventuelles allocations dans les fonds réservés d'un prêt. */
  remove(id: string): Promise<void> {
    return this.store.mutate((data) => {
      if (!data.accounts.some((account) => account.id === id)) {
        throw new NotFoundError(`Compte introuvable : ${id}`);
      }
      return {
        next: {
          ...data,
          accounts: data.accounts.filter((account) => account.id !== id),
          movements: data.movements.filter((movement) => movement.accountId !== id),
          loans: data.loans.map((loan) => {
            if (!loan.reservedFunds) return loan;
            const allocations = loan.reservedFunds.allocations.filter((allocation) => allocation.accountId !== id);
            if (allocations.length === loan.reservedFunds.allocations.length) return loan;
            if (allocations.length === 0) {
              const { reservedFunds: _removed, ...withoutReserved } = loan;
              return withoutReserved;
            }
            return { ...loan, reservedFunds: { ...loan.reservedFunds, allocations } };
          }),
        },
        result: undefined,
      };
    });
  }
}
