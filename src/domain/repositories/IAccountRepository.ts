import type { Account, AccountPatch, NewAccount } from '../models/Account';

export interface IAccountRepository {
  list(): Promise<Account[]>;
  getById(id: string): Promise<Account | undefined>;
  create(input: NewAccount): Promise<Account>;
  update(id: string, patch: AccountPatch): Promise<Account>;
  /** Supprime le compte et tous ses mouvements. */
  remove(id: string): Promise<void>;
}
