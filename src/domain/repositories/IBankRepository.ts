import type { Bank, NewBank } from '../models/Bank';

export interface IBankRepository {
  list(): Promise<Bank[]>;
  create(input: NewBank): Promise<Bank>;
  rename(id: string, name: string): Promise<Bank>;
  /** Supprime la banque ; les comptes et prêts qui lui étaient rattachés restent, sans banque. */
  remove(id: string): Promise<void>;
}
