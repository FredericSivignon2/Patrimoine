import type { Budget, BudgetPatch, NewBudget } from '../../domain/models/Budget';
import { NotFoundError } from '../../domain/models/errors';
import type { IBudgetRepository } from '../../domain/repositories/IBudgetRepository';
import { newId } from '../../domain/services/ids';
import { validateBudget } from '../../domain/services/Validation';
import type { PatrimoineStore } from '../storage/PatrimoineStore';

export class BudgetRepository implements IBudgetRepository {
  constructor(private readonly store: PatrimoineStore) {}

  async list(): Promise<Budget[]> {
    return this.store.snapshot().budgets;
  }

  create(input: NewBudget): Promise<Budget> {
    return this.store.mutate((data) => {
      const budget: Budget = { id: newId(), ...validateBudget(input, data.budgets) };
      return { next: { ...data, budgets: [...data.budgets, budget] }, result: budget };
    });
  }

  update(id: string, patch: BudgetPatch): Promise<Budget> {
    return this.store.mutate((data) => {
      const existing = data.budgets.find((budget) => budget.id === id);
      if (!existing) throw new NotFoundError(`Poste introuvable : ${id}`);
      const { id: _id, ...current } = existing;
      const others = data.budgets.filter((budget) => budget.id !== id);
      const updated: Budget = { id, ...validateBudget({ ...current, ...patch }, others) };
      return {
        next: { ...data, budgets: data.budgets.map((budget) => (budget.id === id ? updated : budget)) },
        result: updated,
      };
    });
  }

  /** Supprime le poste ; les retraits qui lui étaient rattachés restent, sans poste. */
  remove(id: string): Promise<void> {
    return this.store.mutate((data) => {
      if (!data.budgets.some((budget) => budget.id === id)) throw new NotFoundError(`Poste introuvable : ${id}`);
      return {
        next: {
          ...data,
          budgets: data.budgets.filter((budget) => budget.id !== id),
          movements: data.movements.map((movement) => {
            if (movement.budgetId !== id) return movement;
            const { budgetId: _removed, ...withoutBudget } = movement;
            return withoutBudget;
          }),
        },
        result: undefined,
      };
    });
  }
}
