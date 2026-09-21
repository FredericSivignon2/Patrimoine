export type MovementType = 'DEPOSIT' | 'WITHDRAWAL';

export interface Movement {
  id: string;
  accountId: string;
  type: MovementType;
  /** Montant en centimes, entier strictement positif. Le sens est porté par `type`. */
  amount: number;
  /** Date au format ISO `YYYY-MM-DD`. */
  date: string;
  note?: string;
  /** Poste de dépense auquel le retrait est rattaché (facultatif, retraits uniquement). */
  budgetId?: string;
}

export type NewMovement = Omit<Movement, 'id'>;
export type MovementPatch = Partial<NewMovement>;

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  DEPOSIT: 'Versement',
  WITHDRAWAL: 'Retrait',
};
