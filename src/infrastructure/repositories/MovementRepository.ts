import { NotFoundError } from '../../domain/models/errors';
import type { Movement, MovementPatch, NewMovement } from '../../domain/models/Movement';
import type { IMovementRepository } from '../../domain/repositories/IMovementRepository';
import { newId } from '../../domain/services/ids';
import { validateMovement } from '../../domain/services/Validation';
import type { PatrimoineStore } from '../storage/PatrimoineStore';

export class MovementRepository implements IMovementRepository {
  constructor(private readonly store: PatrimoineStore) {}

  async list(): Promise<Movement[]> {
    return this.store.snapshot().movements;
  }

  async listByAccount(accountId: string): Promise<Movement[]> {
    return this.store.snapshot().movements.filter((movement) => movement.accountId === accountId);
  }

  create(input: NewMovement): Promise<Movement> {
    return this.store.mutate((data) => {
      const movement: Movement = { id: newId(), ...validateMovement(input, data.accounts, data.budgets) };
      return { next: { ...data, movements: [...data.movements, movement] }, result: movement };
    });
  }

  update(id: string, patch: MovementPatch): Promise<Movement> {
    return this.store.mutate((data) => {
      const existing = data.movements.find((movement) => movement.id === id);
      if (!existing) throw new NotFoundError(`Mouvement introuvable : ${id}`);
      const { id: _id, ...current } = existing;
      const merged: NewMovement = { ...current, ...patch };
      // `note: undefined` ou `budgetId: undefined` dans le patch efface la note ou le rattachement au poste.
      const updated: Movement = { id, ...validateMovement(merged, data.accounts, data.budgets) };
      return {
        next: {
          ...data,
          movements: data.movements.map((movement) => (movement.id === id ? updated : movement)),
        },
        result: updated,
      };
    });
  }

  remove(id: string): Promise<void> {
    return this.store.mutate((data) => {
      if (!data.movements.some((movement) => movement.id === id)) {
        throw new NotFoundError(`Mouvement introuvable : ${id}`);
      }
      return {
        next: { ...data, movements: data.movements.filter((movement) => movement.id !== id) },
        result: undefined,
      };
    });
  }
}
