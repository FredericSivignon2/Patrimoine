import { NotFoundError } from '../../domain/models/errors';
import type { Loan, LoanPatch, NewLoan } from '../../domain/models/Loan';
import type { ILoanRepository } from '../../domain/repositories/ILoanRepository';
import { newId } from '../../domain/services/ids';
import { validateLoan } from '../../domain/services/Validation';
import type { PatrimoineStore } from '../storage/PatrimoineStore';

export class LoanRepository implements ILoanRepository {
  constructor(private readonly store: PatrimoineStore) {}

  async list(): Promise<Loan[]> {
    return this.store.snapshot().loans;
  }

  create(input: NewLoan): Promise<Loan> {
    return this.store.mutate((data) => {
      const loan: Loan = { id: newId(), ...validateLoan(input, data.banks) };
      return { next: { ...data, loans: [...data.loans, loan] }, result: loan };
    });
  }

  update(id: string, patch: LoanPatch): Promise<Loan> {
    return this.store.mutate((data) => {
      const existing = data.loans.find((loan) => loan.id === id);
      if (!existing) throw new NotFoundError(`Prêt introuvable : ${id}`);
      const { id: _id, ...current } = existing;
      // `monthlyInsurance: undefined` dans le patch retire l'assurance.
      const updated: Loan = { id, ...validateLoan({ ...current, ...patch }, data.banks) };
      return {
        next: { ...data, loans: data.loans.map((loan) => (loan.id === id ? updated : loan)) },
        result: updated,
      };
    });
  }

  /** Supprime le prêt ; le bien immobilier qui lui était rattaché reste, sans prêt rattaché. */
  remove(id: string): Promise<void> {
    return this.store.mutate((data) => {
      if (!data.loans.some((loan) => loan.id === id)) throw new NotFoundError(`Prêt introuvable : ${id}`);
      return {
        next: {
          ...data,
          loans: data.loans.filter((loan) => loan.id !== id),
          properties: data.properties.map((property) => {
            if (property.loanId !== id) return property;
            const { loanId: _removed, ...withoutLoan } = property;
            return withoutLoan;
          }),
        },
        result: undefined,
      };
    });
  }
}
