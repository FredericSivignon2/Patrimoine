/** Épargne de sécurité : montants en centimes. */
export interface SafetySettings {
  /** Montant de patrimoine déblocable sous lequel l'alerte est rouge. */
  threshold: number;
  /** Marge au-dessus du seuil en dessous de laquelle la bannière quitte le vert (jaune). */
  comfortMargin: number;
}

export const DEFAULT_COMFORT_MARGIN = 500_000;
/** Dernière tranche de marge avant le seuil : bannière orange. Plafonnée à la marge de confort. */
export const ALERT_BAND = 100_000;

/** ok = vert, warning = jaune, alert = orange, critical = rouge. */
export type SafetyLevel = 'ok' | 'warning' | 'alert' | 'critical';

export interface SafetyStatus {
  level: SafetyLevel;
  /** Patrimoine déblocable évalué, en centimes. */
  available: number;
  threshold: number;
  /** `available - threshold` : négatif sous le seuil. */
  margin: number;
}
