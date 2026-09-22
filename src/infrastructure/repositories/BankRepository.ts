import type { Bank, NewBank } from '../../domain/models/Bank';
import { NotFoundError } from '../../domain/models/errors';
import type { IBankRepository } from '../../domain/repositories/IBankRepository';
import { newId } from '../../domain/services/ids';
import { validateBank } from '../../domain/services/Validation';
import type { PatrimoineStore } from '../storage/PatrimoineStore';

export class BankRepository implements IBankRepository {
  constructor(private readonly store: PatrimoineStore) {}

  async list(): Promise<Bank[]> {
    return this.store.snapshot().banks;
  }

  create(input: NewBank): Promise<Bank> {
    return this.store.mutate((data) => {
      const bank: Bank = { id: newId(), ...validateBank(input, data.banks) };
      return { next: { ...data, banks: [...data.banks, bank] }, result: bank };
    });
  }

  rename(id: string, name: string): Promise<Bank> {
    return this.store.mutate((data) => {
      if (!data.banks.some((bank) => bank.id === id)) throw new NotFoundError(`Banque introuvable : ${id}`);
      const others = data.banks.filter((bank) => bank.id !== id);
      const updated: Bank = { id, ...validateBank({ name }, others) };
      return { next: { ...data, banks: data.banks.map((bank) => (bank.id === id ? updated : bank)) }, result: updated };
    });
  }

  /** Supprime la banque ; les comptes et prêts qui lui étaient rattachés restent, sans banque. */
  remove(id: string): Promise<void> {
    return this.store.mutate((data) => {
      if (!data.banks.some((bank) => bank.id === id)) throw new NotFoundError(`Banque introuvable : ${id}`);
      const detach = <T extends { bankId?: string }>(item: T): T => {
        if (item.bankId !== id) return item;
        const { bankId: _removed, ...withoutBank } = item;
        return withoutBank as T;
      };
      return {
        next: {
          ...data,
          banks: data.banks.filter((bank) => bank.id !== id),
          accounts: data.accounts.map(detach),
          loans: data.loans.map(detach),
        },
        result: undefined,
      };
    });
  }
}
