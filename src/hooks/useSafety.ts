import { useCallback, useMemo } from 'react';
import { useFinancial } from '../context/FinancialContext';
import type { SafetySettings } from '../domain/models/Safety';
import { evaluateSafety } from '../domain/services/SafetyEngine';

/** Réglages de l'épargne de sécurité (seuil et marge de confort). */
export function useSafetySettings() {
  const { safety, settingsRepository } = useFinancial();

  const save = useCallback((settings: SafetySettings) => settingsRepository.saveSafety(settings), [settingsRepository]);
  const clear = useCallback(() => settingsRepository.clearSafety(), [settingsRepository]);

  return { settings: safety, save, clear };
}

/** Épargne de sécurité : réglages et niveau d'alerte pour un patrimoine déblocable donné (centimes). */
export function useSafety(available: number) {
  const { settings, save, clear } = useSafetySettings();
  const status = useMemo(() => (settings ? evaluateSafety(available, settings) : undefined), [settings, available]);
  return { settings, status, save, clear };
}
