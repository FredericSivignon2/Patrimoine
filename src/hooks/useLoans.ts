import { useCallback, useMemo } from 'react';
import { useFinancial } from '../context/FinancialContext';
import type { Loan, LoanPatch, NewLoan } from '../domain/models/Loan';
import { sumCents } from '../domain/services/FinancialMath';
import { loanSnapshot, projectLoans, type LoanSnapshot } from '../domain/services/LoanEngine';
import { toIsoDate } from '../domain/services/Months';

export interface LoanItem {
  loan: Loan;
  /** `null` si l'échéancier est invalide (fichier modifié à la main). */
  snapshot: LoanSnapshot | null;
}

/** Prêts en cours : situation de chacun, capital restant dû et mensualités dans le temps. */
export function useLoans() {
  const { loans, loanRepository } = useFinancial();

  const view = useMemo(() => {
    const now = new Date();
    const today = toIsoDate(now);
    const items: LoanItem[] = loans.map((loan) => ({ loan, snapshot: loanSnapshot(loan, today) }));
    const projection = projectLoans(loans, now);
    return {
      items,
      projection,
      totals: {
        outstanding: projection.points[0].outstanding,
        /** Mensualités (assurance comprise) dues ce mois-ci, tous prêts confondus. */
        monthlyPayments: projection.points[0].payments,
        remainingInterest: sumCents(items.map((item) => item.snapshot?.remainingInterest ?? 0)),
        activeCount: items.filter((item) => item.snapshot?.active).length,
      },
    };
  }, [loans]);

  const createLoan = useCallback((input: NewLoan) => loanRepository.create(input), [loanRepository]);
  const updateLoan = useCallback((id: string, patch: LoanPatch) => loanRepository.update(id, patch), [loanRepository]);
  const removeLoan = useCallback((id: string) => loanRepository.remove(id), [loanRepository]);

  return { loans, ...view, createLoan, updateLoan, removeLoan };
}
