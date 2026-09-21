import type { Account } from './Account';
import type { Budget } from './Budget';
import type { Loan } from './Loan';
import type { Movement } from './Movement';
import type { SafetySettings } from './Safety';

/**
 * Version 2 : tranches bloquées des comptes d'épargne et épargne de sécurité.
 * Version 3 : postes de dépense (`budgets`).
 * Version 4 : objectif (montant et échéance) d'un poste.
 * Version 5 : prêts (`loans`) et rattachement d'un retrait à un poste (`Movement.budgetId`).
 * Version 6 : remboursements anticipés d'un prêt (`Loan.prepayments`).
 * Les fichiers des versions précédentes restent lisibles ; un client plus ancien refuse un fichier plus récent
 * plutôt que d'en effacer silencieusement les nouveaux champs.
 */
export const DATA_VERSION = 6;

/** Contenu du fichier `patrimoine_data.json` (Drive) et du cache local. À traiter comme immuable. */
export interface PatrimoineData {
  version: typeof DATA_VERSION;
  accounts: Account[];
  movements: Movement[];
  /** Postes de dépense, avec leur part du dépensable. */
  budgets: Budget[];
  /** Prêts bancaires en cours. */
  loans: Loan[];
  /** Absent tant qu'aucun seuil de sécurité n'a été défini. */
  safety?: SafetySettings;
}

export function createEmptyData(): PatrimoineData {
  return { version: DATA_VERSION, accounts: [], movements: [], budgets: [], loans: [] };
}
