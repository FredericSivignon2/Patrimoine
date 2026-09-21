import type { Movement, MovementPatch, NewMovement } from '../models/Movement';

export interface IMovementRepository {
  list(): Promise<Movement[]>;
  listByAccount(accountId: string): Promise<Movement[]>;
  create(input: NewMovement): Promise<Movement>;
  update(id: string, patch: MovementPatch): Promise<Movement>;
  remove(id: string): Promise<void>;
}
