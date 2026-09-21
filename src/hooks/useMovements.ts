import { useCallback } from 'react';
import { useFinancial } from '../context/FinancialContext';
import type { MovementPatch, NewMovement } from '../domain/models/Movement';

export function useMovements() {
  const { movements, movementRepository } = useFinancial();

  const createMovement = useCallback((input: NewMovement) => movementRepository.create(input), [movementRepository]);
  const updateMovement = useCallback(
    (id: string, patch: MovementPatch) => movementRepository.update(id, patch),
    [movementRepository],
  );
  const removeMovement = useCallback((id: string) => movementRepository.remove(id), [movementRepository]);

  return { movements, createMovement, updateMovement, removeMovement };
}
