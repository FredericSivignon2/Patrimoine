export const PROJECTION_HORIZONS = [12, 24, 36, 60] as const;
export type ProjectionHorizon = (typeof PROJECTION_HORIZONS)[number];
export const MAX_PROJECTION_MONTHS: number = PROJECTION_HORIZONS[PROJECTION_HORIZONS.length - 1];

/** Mois au format `YYYY-MM`. */
export type MonthKey = string;

export interface MonthlyNet {
  month: MonthKey;
  /** Centimes. */
  deposits: number;
  /** Centimes (valeur positive). */
  withdrawals: number;
  /** `deposits - withdrawals`, en centimes. */
  net: number;
}

export interface ProjectionPoint {
  month: MonthKey;
  /** Solde projeté en centimes. */
  balance: number;
  /** Part bloquée du solde (fonds bloqués réglementaires), en centimes. */
  locked: number;
  /** Part réservée à un prêt (versée mais pas encore payée à sa destination), en centimes ; plafonnée à `balance - locked`. */
  reserved: number;
  /** Part déblocable : `balance - locked - reserved`. */
  available: number;
}

export interface HorizonProjection {
  months: ProjectionHorizon;
  balance: number;
  locked: number;
  reserved: number;
  available: number;
}

export interface AccountProjection {
  accountId: string;
  currentBalance: number;
  currentLocked: number;
  currentReserved: number;
  /** Versement net mensuel moyen constaté, en centimes. */
  monthlyContribution: number;
  /** Taux annuel appliqué, en pourcentage. */
  annualRate: number;
  /** Index 0 = solde actuel (mois de référence), index n = solde après n mois. */
  points: ProjectionPoint[];
}

export interface PortfolioProjection {
  currentBalance: number;
  currentLocked: number;
  currentReserved: number;
  currentAvailable: number;
  monthlyContribution: number;
  points: ProjectionPoint[];
  horizons: HorizonProjection[];
  accounts: AccountProjection[];
}

/** Déblocage à venir : somme des tranches d'un compte qui se libèrent le même mois. */
export interface UnlockEvent {
  accountId: string;
  month: MonthKey;
  /** Centimes. */
  amount: number;
}
