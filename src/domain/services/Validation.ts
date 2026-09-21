import {
  MAX_DEPOSIT_LOCK_YEARS,
  type Account,
  type AccountType,
  type LockedTranche,
  type NewAccount,
} from '../models/Account';
import type { Budget, NewBudget } from '../models/Budget';
import { ValidationError } from '../models/errors';
import {
  LOAN_KINDS,
  MAX_LOAN_MONTHS,
  PREPAYMENT_EFFECTS,
  type LoanPrepayment,
  type NewLoan,
} from '../models/Loan';
import type { MovementType, NewMovement } from '../models/Movement';
import type { SafetySettings } from '../models/Safety';
import { remainingBasisPoints } from './BudgetEngine';
import { percentToBasisPoints } from './FinancialMath';
import { buildAmortization } from './LoanEngine';
import { isValidIsoDate } from './Months';

const ACCOUNT_TYPES: readonly AccountType[] = ['CHECKING', 'SAVINGS'];
const MOVEMENT_TYPES: readonly MovementType[] = ['DEPOSIT', 'WITHDRAWAL'];

function validateTranches(tranches: readonly LockedTranche[] | undefined): LockedTranche[] {
  return (tranches ?? [])
    .map((tranche) => {
      if (!Number.isSafeInteger(tranche.amount) || tranche.amount <= 0) {
        throw new ValidationError('Le montant d’une tranche bloquée doit être strictement positif.');
      }
      if (!isValidIsoDate(tranche.unlockDate)) {
        throw new ValidationError('La date de déblocage d’une tranche est invalide.');
      }
      return { amount: tranche.amount, unlockDate: tranche.unlockDate };
    })
    .sort((a, b) => a.unlockDate.localeCompare(b.unlockDate) || a.amount - b.amount);
}

function validateLockYears(years: number | undefined): number | undefined {
  if (years === undefined || years === 0) return undefined;
  if (!Number.isInteger(years) || years < 1 || years > MAX_DEPOSIT_LOCK_YEARS) {
    throw new ValidationError(`La durée de blocage doit être un nombre entier d’années entre 1 et ${MAX_DEPOSIT_LOCK_YEARS}.`);
  }
  return years;
}

export function validateAccount(input: NewAccount): NewAccount {
  const name = input.name.trim();
  if (name === '') throw new ValidationError('Le nom du compte est obligatoire.');
  if (!ACCOUNT_TYPES.includes(input.type)) throw new ValidationError('Type de compte invalide.');
  if (!Number.isSafeInteger(input.initialBalance)) throw new ValidationError('Le solde initial est invalide.');

  const account: NewAccount = { name, type: input.type, initialBalance: input.initialBalance };
  // Taux et fonds bloqués n'ont de sens que pour l'épargne.
  if (input.type === 'SAVINGS') {
    if (input.interestRate !== undefined) {
      if (!Number.isFinite(input.interestRate) || input.interestRate < 0 || input.interestRate > 100) {
        throw new ValidationError('Le taux doit être compris entre 0 et 100 %.');
      }
      account.interestRate = input.interestRate;
    }
    const tranches = validateTranches(input.lockedTranches);
    if (tranches.length > 0) account.lockedTranches = tranches;
    const lockYears = validateLockYears(input.depositLockYears);
    if (lockYears !== undefined) account.depositLockYears = lockYears;
  }
  return account;
}

export function validateMovement(
  input: NewMovement,
  accounts: readonly Account[],
  budgets: readonly Budget[],
): NewMovement {
  if (!accounts.some((account) => account.id === input.accountId)) {
    throw new ValidationError('Le compte du mouvement est introuvable.');
  }
  if (!MOVEMENT_TYPES.includes(input.type)) throw new ValidationError('Type de mouvement invalide.');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new ValidationError('Le montant doit être strictement positif.');
  }
  if (!isValidIsoDate(input.date)) throw new ValidationError('La date est invalide.');

  const movement: NewMovement = {
    accountId: input.accountId,
    type: input.type,
    amount: input.amount,
    date: input.date,
  };
  const note = input.note?.trim();
  if (note) movement.note = note;

  if (input.budgetId !== undefined) {
    if (input.type !== 'WITHDRAWAL') throw new ValidationError('Seul un retrait peut être rattaché à un poste.');
    if (!budgets.some((budget) => budget.id === input.budgetId)) {
      throw new ValidationError('Le poste du mouvement est introuvable.');
    }
    movement.budgetId = input.budgetId;
  }
  return movement;
}

function validatePrepayments(prepayments: readonly LoanPrepayment[] | undefined): LoanPrepayment[] {
  return (prepayments ?? [])
    .map((prepayment) => {
      if (!Number.isSafeInteger(prepayment.amount) || prepayment.amount <= 0) {
        throw new ValidationError('Le montant d’un remboursement anticipé doit être strictement positif.');
      }
      if (!isValidIsoDate(prepayment.date)) {
        throw new ValidationError('La date d’un remboursement anticipé est invalide.');
      }
      if (!PREPAYMENT_EFFECTS.includes(prepayment.effect)) {
        throw new ValidationError('L’effet d’un remboursement anticipé est invalide.');
      }
      return { date: prepayment.date, amount: prepayment.amount, effect: prepayment.effect };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function validateLoan(input: NewLoan): NewLoan {
  const name = input.name.trim();
  if (name === '') throw new ValidationError('Le nom du prêt est obligatoire.');
  if (!LOAN_KINDS.includes(input.kind)) throw new ValidationError('Type de prêt invalide.');
  if (!Number.isSafeInteger(input.principal) || input.principal <= 0) {
    throw new ValidationError('Le capital restant dû doit être strictement positif.');
  }
  if (!Number.isFinite(input.annualRate) || input.annualRate < 0 || input.annualRate > 100) {
    throw new ValidationError('Le taux doit être compris entre 0 et 100 % (0 pour un prêt à taux zéro).');
  }
  if (!Number.isSafeInteger(input.monthlyPayment) || input.monthlyPayment <= 0) {
    throw new ValidationError('La mensualité doit être strictement positive.');
  }
  if (input.monthlyInsurance !== undefined && (!Number.isSafeInteger(input.monthlyInsurance) || input.monthlyInsurance < 0)) {
    throw new ValidationError('L’assurance mensuelle doit être un montant positif ou nul.');
  }
  if (!isValidIsoDate(input.firstPaymentDate)) throw new ValidationError('La date de prochaine échéance est invalide.');

  const loan: NewLoan = {
    name,
    kind: input.kind,
    principal: input.principal,
    annualRate: percentToBasisPoints(input.annualRate) / 100,
    monthlyPayment: input.monthlyPayment,
    firstPaymentDate: input.firstPaymentDate,
  };
  if (input.monthlyInsurance) loan.monthlyInsurance = input.monthlyInsurance;
  const prepayments = validatePrepayments(input.prepayments);
  if (prepayments.length > 0) loan.prepayments = prepayments;

  const { rows, complete } = buildAmortization(loan);
  if (!complete) {
    throw new ValidationError(
      rows.length >= MAX_LOAN_MONTHS
        ? `Le prêt durerait plus de ${MAX_LOAN_MONTHS / 12} ans : vérifiez la mensualité.`
        : 'La mensualité ne couvre pas les intérêts du premier mois : le prêt ne serait jamais remboursé.',
    );
  }
  return loan;
}

/** `others` : les autres postes, dont la somme des pourcentages plus celle de ce poste ne peut dépasser 100 %. */
export function validateBudget(input: NewBudget, others: readonly Budget[]): NewBudget {
  const name = input.name.trim();
  if (name === '') throw new ValidationError('Le nom du poste est obligatoire.');
  if (!Number.isFinite(input.percent) || input.percent < 0 || input.percent > 100) {
    throw new ValidationError('Le pourcentage doit être compris entre 0 et 100 %.');
  }

  const basisPoints = percentToBasisPoints(input.percent);
  const remaining = remainingBasisPoints(others);
  if (basisPoints > remaining) {
    throw new ValidationError(
      `La somme des pourcentages ne peut pas dépasser 100 % : il reste ${String(remaining / 100).replace('.', ',')} % à répartir.`,
    );
  }

  const budget: NewBudget = { name, percent: basisPoints / 100 };
  // L'objectif se compose d'un montant et d'une échéance, toujours ensemble.
  if (input.targetAmount !== undefined || input.targetDate !== undefined) {
    if (input.targetAmount === undefined || input.targetDate === undefined) {
      throw new ValidationError('Renseignez à la fois le montant visé et l’échéance de l’objectif.');
    }
    if (!Number.isSafeInteger(input.targetAmount) || input.targetAmount <= 0) {
      throw new ValidationError('Le montant visé doit être strictement positif.');
    }
    if (!isValidIsoDate(input.targetDate)) throw new ValidationError('L’échéance de l’objectif est invalide.');
    budget.targetAmount = input.targetAmount;
    budget.targetDate = input.targetDate;
  }
  return budget;
}

export function validateSafety(input: SafetySettings): SafetySettings {
  if (!Number.isSafeInteger(input.threshold) || input.threshold < 0) {
    throw new ValidationError('Le seuil de sécurité doit être un montant positif ou nul.');
  }
  if (!Number.isSafeInteger(input.comfortMargin) || input.comfortMargin < 0) {
    throw new ValidationError('La marge de confort doit être un montant positif ou nul.');
  }
  return { threshold: input.threshold, comfortMargin: input.comfortMargin };
}
