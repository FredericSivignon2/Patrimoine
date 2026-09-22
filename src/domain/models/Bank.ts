/** Établissement bancaire, pour repérer où est hébergé un compte ou un prêt. */
export interface Bank {
  id: string;
  name: string;
}

export type NewBank = Omit<Bank, 'id'>;

/** Suggestions proposées à la création (l'utilisateur peut en ajouter d'autres, ou ne pas les utiliser). */
export const BANK_SUGGESTIONS: readonly string[] = [
  'La Banque Postale',
  'La Caisse d’Épargne',
  'LCL',
  'AFER',
  'Trade Republic',
  'AXA',
  'Natixis',
];
