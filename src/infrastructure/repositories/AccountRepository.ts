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
        },
        result: undefined,
      };
    });
  }
}
