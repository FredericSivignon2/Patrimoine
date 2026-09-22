import type { Loan } from '../models/Loan';
import type { Property } from '../models/Property';
import { percentToBasisPoints, shareOf, sumCents, type Cents } from './FinancialMath';
import { buildAmortization, outstandingAt } from './LoanEngine';
import { toIsoDate } from './Months';

/** Capital restant dû à `asOf` du prêt rattaché à `property` (0 si aucun prêt rattaché, introuvable ou invalide). */
function outstandingLoanOf(property: Property, loans: readonly Loan[], asOf: string): Cents {
  const loan = loans.find((candidate) => candidate.id === property.loanId);
  if (!loan) return 0;
  const { rows, complete } = buildAmortization(loan);
  if (!complete) return 0;
  return outstandingAt(rows, loan.principal, asOf);
}

/**
 * Valeur nette de revente d'un bien : valeur estimée − capital restant dû du prêt rattaché − frais de vente estimés
 * (% de la valeur estimée). Plancher à 0 (un bien qui vaudrait moins que son prêt n'est pas un coussin négatif).
 * C'est un coussin de sécurité distinct : non déblocable rapidement, il n'entre ni dans le déblocable/dépensable,
 * ni dans le niveau de l'épargne de sécurité — seulement affiché à part (voir `PatrimoineHero`).
 */
export function propertyCushion(property: Property, loans: readonly Loan[], referenceDate: Date): Cents {
  const asOf = toIsoDate(referenceDate);
  const outstanding = outstandingLoanOf(property, loans, asOf);
  const fees = shareOf(property.estimatedValue, percentToBasisPoints(property.sellingFeePercent));
  return Math.max(0, property.estimatedValue - outstanding - fees);
}

/** Somme des coussins de tous les biens. */
export function totalPropertyCushion(properties: readonly Property[], loans: readonly Loan[], referenceDate: Date): Cents {
  return sumCents(properties.map((property) => propertyCushion(property, loans, referenceDate)));
}
