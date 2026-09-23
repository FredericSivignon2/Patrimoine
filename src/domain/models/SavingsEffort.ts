/** Revenu net mensuel récurrent (salaire, revenu locatif…) : sert uniquement à calculer l'effort d'épargne raisonnable, jamais ventilé ailleurs dans les données. */
export interface IncomeSource {
  name: string;
  /** Montant net mensuel, en centimes (> 0). */
  monthlyAmount: number;
}

/** Paramètres de l'effort d'épargne. Absent tant que la page n'a pas été configurée. */
export interface SavingsEffortSettings {
  incomeSources: IncomeSource[];
  /** Part de la capacité résiduelle (revenu − mensualités de prêts − provisions pour postes) à mettre de côté, 0 à 100, 2 décimales au plus. */
  targetRatePercent: number;
}
