import { useCallback } from 'react';
import { useFinancial } from '../context/FinancialContext';
import type { NewBank } from '../domain/models/Bank';

/** Banques hébergeant des comptes ou des prêts. */
export function useBanks() {
  const { banks, bankRepository } = useFinancial();

  const createBank = useCallback((input: NewBank) => bankRepository.create(input), [bankRepository]);
  const renameBank = useCallback((id: string, name: string) => bankRepository.rename(id, name), [bankRepository]);
  const removeBank = useCallback((id: string) => bankRepository.remove(id), [bankRepository]);

  return { banks, createBank, renameBank, removeBank };
}
