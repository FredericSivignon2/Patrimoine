import { MAX_DEPOSIT_LOCK_YEARS, type Account, type LockedTranche } from '../../domain/models/Account';
import type { Budget } from '../../domain/models/Budget';
import { InvalidDataError } from '../../domain/models/errors';
import {
  LOAN_KINDS,
  PREPAYMENT_EFFECTS,
  type Loan,
  type LoanKind,
  type LoanPrepayment,
  type PrepaymentEffect,
} from '../../domain/models/Loan';
import type { Movement } from '../../domain/models/Movement';
import { DATA_VERSION, type PatrimoineData } from '../../domain/models/PatrimoineData';
import type { SafetySettings } from '../../domain/models/Safety';
import { buildAmortization } from '../../domain/services/LoanEngine';
import { isValidIsoDate } from '../../domain/services/Months';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value);
const isPresent = (value: unknown): boolean => value !== undefined && value !== null;

function parseTranche(raw: unknown, where: string): LockedTranche {
  if (!isRecord(raw)) throw new InvalidDataError(`${where} : objet attendu.`);
  const { amount, unlockDate } = raw;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new InvalidDataError(`${where} : montant invalide (centimes entiers positifs attendus).`);
  }
  if (typeof unlockDate !== 'string' || !isValidIsoDate(unlockDate)) {
    throw new InvalidDataError(`${where} : date de déblocage invalide.`);
  }
  return { amount, unlockDate };
}

function parseAccount(raw: unknown, index: number): Account {
  const where = `comptes[${index}]`;
  if (!isRecord(raw)) throw new InvalidDataError(`${where} : objet attendu.`);
  const { id, name, type, initialBalance, interestRate, lockedTranches, depositLockYears } = raw;
  if (typeof id !== 'string' || id === '') throw new InvalidDataError(`${where} : identifiant manquant.`);
  if (typeof name !== 'string') throw new InvalidDataError(`${where} : nom invalide.`);
  if (type !== 'CHECKING' && type !== 'SAVINGS') throw new InvalidDataError(`${where} : type invalide.`);
  if (typeof initialBalance !== 'number' || !Number.isSafeInteger(initialBalance)) {
    throw new InvalidDataError(`${where} : solde initial invalide (centimes entiers attendus).`);
  }

  const account: Account = { id, name, type, initialBalance };
  if (isPresent(interestRate)) {
    if (typeof interestRate !== 'number' || !Number.isFinite(interestRate) || interestRate < 0) {
      throw new InvalidDataError(`${where} : taux invalide.`);
    }
    account.interestRate = interestRate;
  }
  if (isPresent(lockedTranches)) {
    if (!isUnknownArray(lockedTranches)) throw new InvalidDataError(`${where} : tranches bloquées invalides.`);
    account.lockedTranches = lockedTranches.map((tranche, trancheIndex) =>
      parseTranche(tranche, `${where}.tranches[${trancheIndex}]`),
    );
  }
  if (isPresent(depositLockYears)) {
    if (
      typeof depositLockYears !== 'number' ||
      !Number.isInteger(depositLockYears) ||
      depositLockYears < 1 ||
      depositLockYears > MAX_DEPOSIT_LOCK_YEARS
    ) {
      throw new InvalidDataError(`${where} : durée de blocage invalide.`);
    }
    account.depositLockYears = depositLockYears;
  }
  return account;
}

function parseMovement(raw: unknown, index: number): Movement {
  const where = `mouvements[${index}]`;
  if (!isRecord(raw)) throw new InvalidDataError(`${where} : objet attendu.`);
  const { id, accountId, type, amount, date, note, budgetId } = raw;
  if (typeof id !== 'string' || id === '') throw new InvalidDataError(`${where} : identifiant manquant.`);
  if (typeof accountId !== 'string') throw new InvalidDataError(`${where} : compte invalide.`);
  if (type !== 'DEPOSIT' && type !== 'WITHDRAWAL') throw new InvalidDataError(`${where} : type invalide.`);
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new InvalidDataError(`${where} : montant invalide (centimes entiers positifs attendus).`);
  }
  if (typeof date !== 'string' || !isValidIsoDate(date)) throw new InvalidDataError(`${where} : date invalide.`);

  const movement: Movement = { id, accountId, type, amount, date };
  if (isPresent(note)) {
    if (typeof note !== 'string') throw new InvalidDataError(`${where} : note invalide.`);
    movement.note = note;
  }
  if (isPresent(budgetId)) {
    if (typeof budgetId !== 'string' || budgetId === '') throw new InvalidDataError(`${where} : poste invalide.`);
    movement.budgetId = budgetId;
  }
  return movement;
}

const isLoanKind = (value: unknown): value is LoanKind => LOAN_KINDS.some((kind) => kind === value);
const isPrepaymentEffect = (value: unknown): value is PrepaymentEffect =>
  PREPAYMENT_EFFECTS.some((effect) => effect === value);

function parsePrepayment(raw: unknown, where: string): LoanPrepayment {
  if (!isRecord(raw)) throw new InvalidDataError(`${where} : objet attendu.`);
  const { date, amount, effect } = raw;
  if (typeof date !== 'string' || !isValidIsoDate(date)) throw new InvalidDataError(`${where} : date invalide.`);
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new InvalidDataError(`${where} : montant invalide (centimes entiers positifs attendus).`);
  }
  if (!isPrepaymentEffect(effect)) throw new InvalidDataError(`${where} : effet invalide.`);
  return { date, amount, effect };
}

function parseLoan(raw: unknown, index: number): Loan {
  const where = `prêts[${index}]`;
  if (!isRecord(raw)) throw new InvalidDataError(`${where} : objet attendu.`);
  const { id, name, kind, principal, annualRate, monthlyPayment, monthlyInsurance, firstPaymentDate, prepayments } = raw;
  if (typeof id !== 'string' || id === '') throw new InvalidDataError(`${where} : identifiant manquant.`);
  if (typeof name !== 'string') throw new InvalidDataError(`${where} : nom invalide.`);
  if (!isLoanKind(kind)) throw new InvalidDataError(`${where} : type invalide.`);
  if (typeof principal !== 'number' || !Number.isSafeInteger(principal) || principal <= 0) {
    throw new InvalidDataError(`${where} : capital invalide (centimes entiers positifs attendus).`);
  }
  if (typeof annualRate !== 'number' || !Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100) {
    throw new InvalidDataError(`${where} : taux invalide.`);
  }
  if (typeof monthlyPayment !== 'number' || !Number.isSafeInteger(monthlyPayment) || monthlyPayment <= 0) {
    throw new InvalidDataError(`${where} : mensualité invalide (centimes entiers positifs attendus).`);
  }
  if (typeof firstPaymentDate !== 'string' || !isValidIsoDate(firstPaymentDate)) {
    throw new InvalidDataError(`${where} : date d'échéance invalide.`);
  }

  const loan: Loan = { id, name, kind, principal, annualRate, monthlyPayment, firstPaymentDate };
  if (isPresent(monthlyInsurance)) {
    if (typeof monthlyInsurance !== 'number' || !Number.isSafeInteger(monthlyInsurance) || monthlyInsurance < 0) {
      throw new InvalidDataError(`${where} : assurance invalide.`);
    }
    loan.monthlyInsurance = monthlyInsurance;
  }
  if (isPresent(prepayments)) {
    if (!isUnknownArray(prepayments)) throw new InvalidDataError(`${where} : remboursements anticipés invalides.`);
    loan.prepayments = prepayments
      .map((prepayment, prepaymentIndex) => parsePrepayment(prepayment, `${where}.remboursementsAnticipés[${prepaymentIndex}]`))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  if (!buildAmortization(loan).complete) {
    throw new InvalidDataError(`${where} : l'échéancier ne se termine pas (mensualité trop faible ou durée excessive).`);
  }
  return loan;
}

function parseBudget(raw: unknown, index: number): Budget {
  const where = `postes[${index}]`;
  if (!isRecord(raw)) throw new InvalidDataError(`${where} : objet attendu.`);
  const { id, name, percent, targetAmount, targetDate } = raw;
  if (typeof id !== 'string' || id === '') throw new InvalidDataError(`${where} : identifiant manquant.`);
  if (typeof name !== 'string') throw new InvalidDataError(`${where} : nom invalide.`);
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new InvalidDataError(`${where} : pourcentage invalide (entre 0 et 100 attendu).`);
  }

  const budget: Budget = { id, name, percent };
  if (isPresent(targetAmount) || isPresent(targetDate)) {
    if (typeof targetAmount !== 'number' || !Number.isSafeInteger(targetAmount) || targetAmount <= 0) {
      throw new InvalidDataError(`${where} : montant visé invalide (centimes entiers positifs attendus).`);
    }
    if (typeof targetDate !== 'string' || !isValidIsoDate(targetDate)) {
      throw new InvalidDataError(`${where} : échéance de l'objectif invalide.`);
    }
    budget.targetAmount = targetAmount;
    budget.targetDate = targetDate;
  }
  return budget;
}

function parseSafety(raw: unknown): SafetySettings {
  if (!isRecord(raw)) throw new InvalidDataError('épargne de sécurité : objet attendu.');
  const { threshold, comfortMargin } = raw;
  if (typeof threshold !== 'number' || !Number.isSafeInteger(threshold) || threshold < 0) {
    throw new InvalidDataError('épargne de sécurité : seuil invalide (centimes entiers positifs ou nuls attendus).');
  }
  if (typeof comfortMargin !== 'number' || !Number.isSafeInteger(comfortMargin) || comfortMargin < 0) {
    throw new InvalidDataError('épargne de sécurité : marge de confort invalide.');
  }
  return { threshold, comfortMargin };
}

const isSupportedVersion = (version: unknown): boolean =>
  typeof version === 'number' && Number.isInteger(version) && version >= 1 && version <= DATA_VERSION;

/**
 * Valide un contenu JSON inconnu (Drive, cache local) et le convertit en `PatrimoineData` courant.
 * Les fichiers des versions précédentes sont acceptés tels quels : les champs apparus depuis
 * (tranches bloquées, épargne de sécurité, postes) sont simplement absents ou vides.
 */
export function parsePatrimoineData(raw: unknown): PatrimoineData {
  if (!isRecord(raw)) throw new InvalidDataError("Le contenu n'est pas un objet JSON.");
  if (isPresent(raw.version) && !isSupportedVersion(raw.version)) {
    throw new InvalidDataError(
      `Version de fichier non prise en charge : ${String(raw.version)}. Mettez l’application à jour.`,
    );
  }
  const { accounts, movements, budgets, loans, safety } = raw;
  if (!isUnknownArray(accounts)) throw new InvalidDataError('La liste des comptes est manquante.');
  if (!isUnknownArray(movements)) throw new InvalidDataError('La liste des mouvements est manquante.');
  if (isPresent(budgets) && !isUnknownArray(budgets)) throw new InvalidDataError('La liste des postes est invalide.');
  if (isPresent(loans) && !isUnknownArray(loans)) throw new InvalidDataError('La liste des prêts est invalide.');

  const data: PatrimoineData = {
    version: DATA_VERSION,
    accounts: accounts.map(parseAccount),
    movements: movements.map(parseMovement),
    budgets: isUnknownArray(budgets) ? budgets.map(parseBudget) : [],
    loans: isUnknownArray(loans) ? loans.map(parseLoan) : [],
  };
  if (isPresent(safety)) data.safety = parseSafety(safety);
  return data;
}

export function parsePatrimoineJson(text: string): PatrimoineData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InvalidDataError("Le contenu n'est pas un JSON valide.");
  }
  return parsePatrimoineData(raw);
}

export function serializePatrimoineData(data: PatrimoineData): string {
  return JSON.stringify(data, null, 2);
}
