import type { Loan, LoanPatch, NewLoan } from '../models/Loan';

export interface ILoanRepository {
  list(): Promise<Loan[]>;
  create(input: NewLoan): Promise<Loan>;
  update(id: string, patch: LoanPatch): Promise<Loan>;
  remove(id: string): Promise<void>;
}
