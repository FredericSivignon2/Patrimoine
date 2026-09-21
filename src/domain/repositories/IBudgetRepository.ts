import type { Budget, BudgetPatch, NewBudget } from '../models/Budget';

export interface IBudgetRepository {
  list(): Promise<Budget[]>;
  /** La somme des pourcentages de tous les postes ne peut pas dépasser 100 %. */
  create(input: NewBudget): Promise<Budget>;
  update(id: string, patch: BudgetPatch): Promise<Budget>;
  remove(id: string): Promise<void>;
}
