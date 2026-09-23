export type LoanKind = 'MORTGAGE' | 'RENOVATION' | 'CONSUMER' | 'OTHER';

export const LOAN_KINDS: readonly LoanKind[] = ['MORTGAGE', 'RENOVATION', 'CONSUMER', 'OTHER'];

export const LOAN_KIND_LABELS: Record<LoanKind, string> = {
  MORTGAGE: 'Immobilier',
  RENOVATION: 'Rénovation',
  CONSUMER: 'Consommation',
  OTHER: 'Autre',
};

/** Ce que change un remboursement anticipé : la durée du prêt (mensualité conservée) ou la mensualité (fin conservée). */
export type PrepaymentEffect = 'DURATION' | 'PAYMENT';

export const PREPAYMENT_EFFECTS: readonly PrepaymentEffect[] = ['DURATION', 'PAYMENT'];

export const PREPAYMENT_EFFECT_LABELS: Record<PrepaymentEffect, string> = {
  DURATION: 'Réduire la durée',
  PAYMENT: 'Réduire la mensualité',
};

/** Remboursement anticipé partiel (prévu ou déjà effectué), imputé à la première échéance qui suit sa date. */
export interface LoanPrepayment {
  /** Date du remboursement (`YYYY-MM-DD`). */
  date: string;
  /** Montant remboursé en centimes (> 0) ; plafonné au capital restant dû. */
  amount: number;
  effect: PrepaymentEffect;
}

/** Prêt bancaire en cours, à mensualités constantes (la dernière échéance peut être plus petite). */
export interface Loan {
  id: string;
  name: string;
  kind: LoanKind;
  /**
   * Capital restant dû juste avant la première échéance modélisée (`firstPaymentDate`), en centimes (> 0).
   * Pour un prêt entamé : le capital restant dû du dernier relevé ; pour un prêt en différé : le capital emprunté.
   */
  principal: number;
  /** Taux annuel nominal en pourcentage (0 pour un prêt à taux zéro), 2 décimales au plus. */
  annualRate: number;
  /** Mensualité hors assurance, en centimes (> 0). */
  monthlyPayment: number;
  /** Assurance emprunteur payée avec chaque mensualité, en centimes. */
  monthlyInsurance?: number;
  /** Première échéance modélisée (`YYYY-MM-DD`). Les échéances déjà passées sont considérées comme payées. */
  firstPaymentDate: string;
  /**
   * Remboursements anticipés, triés par date. À n'y saisir que s'ils ne sont pas déjà déduits du capital restant dû
   * (`principal`), sous peine de les compter deux fois.
   */
  prepayments?: LoanPrepayment[];
  /** Banque prêteuse (facultatif). */
  bankId?: string;
  /**
   * Part du capital déjà versée sur des comptes mais pas encore payée à sa destination finale (ex. un artisan) :
   * à ne surtout pas compter comme déblocable ni dépensable tant qu'elle n'est pas réglée. Sans date de fin : à
   * retirer manuellement du prêt une fois le paiement fait (voir `reservedLotsOf`).
   */
  reservedFunds?: LoanReservedFunds;
}

/** Montant d'un prêt encore présent sur un compte, en attente d'être versé à sa destination. */
export interface LoanReservedAllocation {
  accountId: string;
  /** Centimes (> 0), plafonné au solde du compte au moment du calcul. */
  amount: number;
}

export interface LoanReservedFunds {
  /** Destination du versement à venir (ex. « À verser à l'artisan »). */
  note?: string;
  /** Date de départ de la réservation (`YYYY-MM-DD`), pour afficher « réservé depuis... » ; modifiable. */
  since?: string;
  /** Un compte n'apparaît qu'une fois. */
  allocations: LoanReservedAllocation[];
}

export type NewLoan = Omit<Loan, 'id'>;
export type LoanPatch = Partial<NewLoan>;

/** Durée maximale d'un échéancier modélisé (50 ans). */
export const MAX_LOAN_MONTHS = 600;
