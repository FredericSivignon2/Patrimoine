/**
 * Bien immobilier loué et non entièrement remboursé (ex. un appartement mis en location). Sa valeur nette de revente
 * est un coussin de sécurité supplémentaire : elle n'est ni déblocable rapidement, ni comptée dans le patrimoine
 * déblocable ou dépensable, ni dans le niveau de l'épargne de sécurité (voir `PropertyEngine`).
 */
export interface Property {
  id: string;
  name: string;
  /** Valeur estimée de revente, en centimes (> 0). */
  estimatedValue: number;
  /** Prêt de l'application dont le capital restant dû finance ce bien (facultatif : bien déjà libre de tout prêt). */
  loanId?: string;
  /** Frais de vente estimés (notaire, agence, mainlevée…), en % du prix de vente, 2 décimales au plus. */
  sellingFeePercent: number;
}

export type NewProperty = Omit<Property, 'id'>;
export type PropertyPatch = Partial<NewProperty>;
