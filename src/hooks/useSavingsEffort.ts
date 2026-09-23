import { useCallback, useMemo } from 'react';
import { useFinancial } from '../context/FinancialContext';
import type { SavingsEffortSettings } from '../domain/models/SavingsEffort';
import { evaluateSavingsEffort } from '../domain/services/SavingsEffortEngine';

/** Réglages de l'effort d'épargne (revenus récurrents et taux cible). */
export function useSavingsEffortSettings() {
  const { savingsEffort, settingsRepository } = useFinancial();

  const save = useCallback(
    (settings: SavingsEffortSettings) => settingsRepository.saveSavingsEffort(settings),
    [settingsRepository],
  );
  const clear = useCallback(() => settingsRepository.clearSavingsEffort(), [settingsRepository]);

  return { settings: savingsEffort, save, clear };
}

/** Rapport d'effort d'épargne (capacité, fenêtres de suivi, suggestion de réajustement) ; absent tant que non configuré. */
export function useSavingsEffort() {
  const { settings, save, clear } = useSavingsEffortSettings();
  const { loans, accounts, movements } = useFinancial();

  const report = useMemo(() => {
    if (!settings) return undefined;
    return evaluateSavingsEffort(settings, { loans, accounts, movements }, new Date());
  }, [settings, loans, accounts, movements]);

  return { settings, report, save, clear };
}
