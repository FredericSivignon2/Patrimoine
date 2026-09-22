import type { Account } from '../models/Account';
import type { Bank } from '../models/Bank';
import type { Budget } from '../models/Budget';
import type { Loan } from '../models/Loan';
import type { Movement, MovementType } from '../models/Movement';
import { DATA_VERSION, type PatrimoineData } from '../models/PatrimoineData';
import type { Property } from '../models/Property';
import { newId } from './ids';
import { addMonths, monthKeyOfDate, toIsoDate } from './Months';

/** Jeu de données fictif sur les 12 derniers mois, pour découvrir l'application. */
export function createDemoData(referenceDate: Date = new Date()): PatrimoineData {
  const today = toIsoDate(referenceDate);
  const currentMonth = monthKeyOfDate(referenceDate);

  // Banques : rattachées à un compte ou un prêt pour repérer où chacun est hébergé.
  const laBanquePostale: Bank = { id: newId(), name: 'La Banque Postale' };
  const caisseEpargne: Bank = { id: newId(), name: 'La Caisse d’Épargne' };
  const afer: Bank = { id: newId(), name: 'AFER' };
  const natixis: Bank = { id: newId(), name: 'Natixis' };
  const lcl: Bank = { id: newId(), name: 'LCL' };
  const banks: Bank[] = [laBanquePostale, caisseEpargne, afer, natixis, lcl];

  const checking: Account = {
    id: newId(),
    name: 'Compte courant',
    type: 'CHECKING',
    initialBalance: 185_000,
    bankId: laBanquePostale.id,
  };
  const livret: Account = {
    id: newId(),
    name: 'Livret A',
    type: 'SAVINGS',
    initialBalance: 800_000,
    interestRate: 2.4,
    bankId: caisseEpargne.id,
  };
  const assuranceVie: Account = {
    id: newId(),
    name: 'Assurance vie',
    type: 'SAVINGS',
    initialBalance: 1_200_000,
    interestRate: 2.8,
    bankId: afer.id,
  };
  // PEE : les fonds déjà présents se débloquent par tranches, et chaque nouveau versement est bloqué 5 ans.
  // Une tranche n'a pas de date connue : elle ne se débloquera qu'au départ en retraite.
  const pee: Account = {
    id: newId(),
    name: 'PEE',
    type: 'SAVINGS',
    initialBalance: 600_000,
    interestRate: 3,
    depositLockYears: 5,
    bankId: natixis.id,
    lockedTranches: [
      { amount: 150_000, unlockDate: `${addMonths(currentMonth, 8)}-15` },
      { amount: 200_000, unlockDate: `${addMonths(currentMonth, 20)}-15` },
      { amount: 250_000, unlockDate: `${addMonths(currentMonth, 32)}-15` },
      { amount: 300_000, unlockAtRetirement: true },
    ],
  };

  // 75 % du dépensable réparti ; le reste est « non affecté ». Deux postes ont un objectif : l'un se réalise
  // avec le pourcentage choisi, l'autre demande de relever ce pourcentage.
  const vacances: Budget = { id: newId(), name: 'Vacances', percent: 25 };
  const travaux: Budget = {
    id: newId(),
    name: 'Travaux',
    percent: 30,
    targetAmount: 1_000_000,
    targetDate: `${addMonths(currentMonth, 24)}-15`,
  };
  const voiture: Budget = {
    id: newId(),
    name: 'Future voiture',
    percent: 20,
    targetAmount: 600_000,
    targetDate: `${addMonths(currentMonth, 48)}-15`,
  };

  // Prêts en cours : capital restant dû avant l'échéance de ce mois-ci (celles déjà passées sont considérées payées).
  // Le prêt à 0 % (éco-PTZ) rembourse le capital seul. Deux remboursements anticipés sont prévus : le prêt conso
  // raccourcit sa durée, l'éco-PTZ réduit sa mensualité. Le prêt secondaire finance le bien loué (voir `properties`).
  const secondaryMortgage: Loan = {
    id: newId(),
    name: 'Prêt immobilier secondaire',
    kind: 'MORTGAGE',
    principal: 1_800_000,
    annualRate: 1.9,
    monthlyPayment: 15_500,
    monthlyInsurance: 600,
    firstPaymentDate: `${currentMonth}-15`,
  };
  const loans: Loan[] = [
    {
      id: newId(),
      name: 'Prêt immobilier principal',
      kind: 'MORTGAGE',
      principal: 9_500_000,
      annualRate: 1.3,
      monthlyPayment: 69_000,
      monthlyInsurance: 2_800,
      firstPaymentDate: `${currentMonth}-05`,
      bankId: lcl.id,
    },
    {
      id: newId(),
      name: 'Prêt immobilier complémentaire',
      kind: 'MORTGAGE',
      principal: 2_400_000,
      annualRate: 2.1,
      monthlyPayment: 21_000,
      monthlyInsurance: 900,
      firstPaymentDate: `${currentMonth}-10`,
    },
    secondaryMortgage,
    {
      id: newId(),
      name: 'Éco-PTZ rénovation énergétique',
      kind: 'RENOVATION',
      principal: 1_500_000,
      annualRate: 0,
      monthlyPayment: 12_500,
      firstPaymentDate: `${currentMonth}-20`,
      prepayments: [{ date: `${addMonths(currentMonth, 18)}-20`, amount: 200_000, effect: 'PAYMENT' }],
    },
    {
      id: newId(),
      name: 'Prêt conso travaux',
      kind: 'CONSUMER',
      principal: 800_000,
      annualRate: 4.9,
      monthlyPayment: 19_000,
      firstPaymentDate: `${currentMonth}-25`,
      prepayments: [{ date: `${addMonths(currentMonth, 6)}-25`, amount: 300_000, effect: 'DURATION' }],
    },
  ];

  const movements: Movement[] = [];
  const add = (
    accountId: string,
    type: MovementType,
    amountEuros: number,
    month: string,
    day: string,
    note: string,
    budgetId?: string,
  ): void => {
    const date = `${month}-${day}`;
    if (date > today) return;
    movements.push({
      id: newId(),
      accountId,
      type,
      amount: amountEuros * 100,
      date,
      note,
      ...(budgetId ? { budgetId } : {}),
    });
  };

  for (let offset = -11; offset <= 0; offset++) {
    const month = addMonths(currentMonth, offset);
    const variation = ((offset + 11) % 3) * 50;
    // Sur le compte courant, on ne saisit que le solde du mois (salaire moins dépenses courantes), pas chaque dépense.
    add(checking.id, 'DEPOSIT', 150 - variation / 2, month, '02', 'Solde du mois');
    add(livret.id, 'DEPOSIT', 200 + variation, month, '05', 'Versement mensuel');
    add(assuranceVie.id, 'DEPOSIT', 150, month, '10', 'Versement programmé');
    add(pee.id, 'DEPOSIT', 100, month, '12', 'Versement PEE');
  }
  // Retraits rattachés à un poste : ils consomment l'enveloppe de ce poste.
  add(livret.id, 'WITHDRAWAL', 600, addMonths(currentMonth, -5), '15', 'Travaux', travaux.id);
  add(livret.id, 'WITHDRAWAL', 350, addMonths(currentMonth, -2), '18', 'Week-end', vacances.id);

  // Bien loué, financé par le prêt secondaire : sa valeur nette de revente (valeur − capital restant dû − frais de
  // vente) est un coussin de sécurité à part, non déblocable rapidement (voir `PropertyEngine`).
  const properties: Property[] = [
    {
      id: newId(),
      name: 'Appartement loué',
      estimatedValue: 22_000_000,
      loanId: secondaryMortgage.id,
      sellingFeePercent: 8,
    },
  ];

  return {
    version: DATA_VERSION,
    accounts: [checking, livret, assuranceVie, pee],
    movements,
    budgets: [vacances, travaux, voiture],
    loans,
    banks,
    properties,
    safety: { threshold: 2_000_000, comfortMargin: 500_000 },
  };
}
