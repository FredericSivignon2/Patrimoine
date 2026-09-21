export type AccountType = 'CHECKING' | 'SAVINGS';

/** Fonds bloqués jusqu'à une date (ex. une annuité de PEE). */
export interface LockedTranche {
  /** Montant en centimes, entier strictement positif. */
  amount: number;
  /** Date de déblocage au format ISO `YYYY-MM-DD`. */
  unlockDate: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Solde initial en centimes (entier). */
  initialBalance: number;
  /** Taux annuel en pourcentage (3 = 3 %), pour les comptes d'épargne rémunérés. */
  interestRate?: number;
  /** Épargne uniquement : fonds déjà bloqués au démarrage du suivi, une tranche par échéance de déblocage. */
  lockedTranches?: LockedTranche[];
  /** Épargne uniquement : chaque versement enregistré est bloqué pendant ce nombre d'années (5 pour un PEE). */
  depositLockYears?: number;
}

export const MAX_DEPOSIT_LOCK_YEARS = 50;

export type NewAccount = Omit<Account, 'id'>;
export type AccountPatch = Partial<NewAccount>;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: 'Compte courant',
  SAVINGS: 'Épargne',
};
