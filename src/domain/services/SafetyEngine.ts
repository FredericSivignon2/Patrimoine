import { ALERT_BAND, type SafetySettings, type SafetyStatus } from '../models/Safety';
import type { Cents } from './FinancialMath';

/**
 * Niveau d'alerte selon la marge entre le patrimoine déblocable et le seuil de sécurité :
 * chaque niveau commence dès que la marge descend à sa borne (inclusive), le rouge dès qu'elle est négative.
 *  - vert    : marge > marge de confort (5 000 € par défaut)
 *  - jaune   : 1 000 € < marge ≤ marge de confort
 *  - orange  : 0 ≤ marge ≤ 1 000 € (la bande orange est plafonnée à la marge de confort)
 *  - rouge   : marge < 0
 */
export function evaluateSafety(available: Cents, settings: SafetySettings): SafetyStatus {
  const margin = available - settings.threshold;
  const alertBand = Math.min(ALERT_BAND, settings.comfortMargin);

  let level: SafetyStatus['level'];
  if (margin < 0) level = 'critical';
  else if (margin <= alertBand) level = 'alert';
  else if (margin <= settings.comfortMargin) level = 'warning';
  else level = 'ok';

  return { level, available, threshold: settings.threshold, margin };
}
