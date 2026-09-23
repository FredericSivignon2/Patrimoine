import { useMemo, useState } from 'react';
import { LoansChart } from '../components/charts/LoansChart';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { formatCount, formatEuros, formatFullDate, formatMonth, formatPercent } from '../components/common/format';
import { ChevronRightIcon, PlusIcon } from '../components/common/icons';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { LoanForm } from '../components/loans/LoanForm';
import { LoansSummary } from '../components/loans/LoansSummary';
import { BankBadge } from '../components/common/bankBadge';
import { LOAN_KIND_LABELS, LOAN_KINDS, type Loan } from '../domain/models/Loan';
import { sumCents } from '../domain/services/FinancialMath';
import { monthKeyOfIso } from '../domain/services/Months';
import { useAccounts } from '../hooks/useAccounts';
import { useBanks } from '../hooks/useBanks';
import { useLoans, type LoanItem } from '../hooks/useLoans';

function LoanStatus({ item }: { item: LoanItem }) {
  const { snapshot } = item;
  if (!snapshot) return <span className="text-rose-700">Échéancier invalide : vérifiez la mensualité.</span>;
  if (!snapshot.active) return <span>Soldé</span>;
  return (
    <span>
      Fin en {formatMonth(monthKeyOfIso(snapshot.endDate))} · {snapshot.remainingPayments} échéance
      {snapshot.remainingPayments > 1 ? 's' : ''} restante{snapshot.remainingPayments > 1 ? 's' : ''}
      {snapshot.next && ` · prochaine échéance le ${formatFullDate(snapshot.next.date)}`}
    </span>
  );
}

/** Ce que les remboursements anticipés changent (ou ne changent pas, s'ils tombent après la fin du prêt). */
function PrepaymentNote({ item }: { item: LoanItem }) {
  const { loan, snapshot } = item;
  const count = loan.prepayments?.length ?? 0;
  if (!snapshot || count === 0) return null;

  const { prepaymentImpact: impact, ignoredPrepayments } = snapshot;
  const effects = [
    impact && impact.installmentsSaved > 0 ? `${formatCount(impact.installmentsSaved, 'échéance')} en moins` : null,
    impact && impact.interestSaved > 0 ? `${formatEuros(impact.interestSaved)} d’intérêts économisés` : null,
    impact?.reducedPayment !== undefined ? `mensualité ramenée à ${formatEuros(impact.reducedPayment)}` : null,
  ].filter((effect): effect is string => effect !== null);

  return (
    <>
      <span className="block text-xs text-emerald-700">
        {[formatCount(count, 'remboursement anticipé', 'remboursements anticipés'), ...effects].join(' · ')}
      </span>
      {ignoredPrepayments > 0 && (
        <span className="block text-xs text-amber-700">
          {formatCount(ignoredPrepayments, 'remboursement daté', 'remboursements datés')} après la fin du prêt : sans effet.
        </span>
      )}
    </>
  );
}

/** Part du prêt encore sur des comptes, pas encore versée à sa destination. */
function ReservedFundsNote({ loan, accountNames }: { loan: Loan; accountNames: ReadonlyMap<string, string> }) {
  const reserved = loan.reservedFunds;
  if (!reserved || reserved.allocations.length === 0) return null;

  const total = sumCents(reserved.allocations.map((allocation) => allocation.amount));
  const accountLabels = reserved.allocations.map(
    (allocation) => accountNames.get(allocation.accountId) ?? 'Compte supprimé',
  );
  return (
    <span className="block text-xs text-amber-700">
      {formatEuros(total)} réservés ({accountLabels.join(', ')})
      {reserved.since && ` · depuis le ${formatFullDate(reserved.since)}`}
      {reserved.note && ` · ${reserved.note}`}
    </span>
  );
}

export function LoansPage() {
  const { items, projection, totals, createLoan, updateLoan, removeLoan } = useLoans();
  const { banks } = useBanks();
  const { accounts } = useAccounts();
  const [editing, setEditing] = useState<Loan | 'new' | null>(null);
  const close = (): void => setEditing(null);
  const loanNames = useMemo(() => new Map(items.map((item) => [item.loan.id, item.loan.name])), [items]);
  const bankNames = useMemo(() => new Map(banks.map((bank) => [bank.id, bank.name])), [banks]);
  const accountNames = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);

  return (
    <>
      <PageHeader title="Prêts en cours">
        <Button onClick={() => setEditing('new')}>
          <PlusIcon className="size-4" />
          Nouveau prêt
        </Button>
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState
          title="Aucun prêt pour l’instant"
          description="Ajoutez vos prêts immobiliers, travaux ou consommation (même à taux zéro) pour suivre le capital restant dû, les mensualités et les dates de fin."
        >
          <Button onClick={() => setEditing('new')}>Ajouter un prêt</Button>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <LoansSummary
            outstanding={totals.outstanding}
            monthlyPayments={totals.monthlyPayments}
            remainingInterest={totals.remainingInterest}
            projection={projection}
          />

          <Card title="Capital restant dû dans le temps">
            <LoansChart points={projection.points} />
          </Card>

          {projection.ends.length > 0 && (
            <Card title="Prochaines fins de prêt">
              <ul className="divide-y divide-slate-100">
                {projection.ends.slice(0, 5).map((end) => (
                  <li key={end.loanId} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {loanNames.get(end.loanId) ?? 'Prêt supprimé'}
                      </span>
                      <span className="block text-xs capitalize text-slate-500">
                        {formatMonth(monthKeyOfIso(end.endDate))}
                      </span>
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums text-emerald-700">
                      +{formatEuros(end.freedMonthly)} <span className="text-xs font-normal text-slate-500">/ mois libérés</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {LOAN_KINDS.map((kind) => {
            const group = items.filter((item) => item.loan.kind === kind);
            if (group.length === 0) return null;
            return (
              <section key={kind} aria-label={LOAN_KIND_LABELS[kind]}>
                <h2 className="mb-2 text-sm font-semibold text-slate-500">{LOAN_KIND_LABELS[kind]}</h2>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {group.map((item) => {
                    const { loan, snapshot } = item;
                    return (
                      <li key={loan.id}>
                        <button
                          type="button"
                          onClick={() => setEditing(loan)}
                          className="flex w-full flex-col gap-2 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-teal-400"
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="flex min-w-0 items-start gap-2">
                              {loan.bankId && bankNames.get(loan.bankId) && (
                                <BankBadge name={bankNames.get(loan.bankId) ?? ''} className="mt-0.5" />
                              )}
                              <span className="min-w-0">
                                <span className="block break-words font-semibold text-slate-900">{loan.name}</span>
                                <span className="block text-xs text-slate-500">
                                  {loan.annualRate === 0 ? 'Taux zéro' : `${formatPercent(loan.annualRate)} / an`} ·{' '}
                                  {formatEuros(snapshot?.monthlyPayment ?? loan.monthlyPayment)} / mois
                                  {loan.monthlyInsurance ? ` + ${formatEuros(loan.monthlyInsurance)} d’assurance` : ''}
                                </span>
                              </span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-right">
                                <span className="block text-lg font-bold tabular-nums text-slate-900">
                                  {formatEuros(snapshot?.outstanding ?? loan.principal)}
                                </span>
                                <span className="block text-xs text-slate-500">restant dû</span>
                              </span>
                              <ChevronRightIcon className="size-4 text-slate-400" />
                            </span>
                          </span>
                          {snapshot && (
                            <span
                              role="progressbar"
                              aria-label={`Part remboursée de ${loan.name}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(snapshot.repaidRatio * 100)}
                              className="block h-1.5 overflow-hidden rounded-full bg-slate-200"
                            >
                              <span
                                className="block h-full rounded-full bg-slate-600"
                                style={{ width: `${snapshot.repaidRatio * 100}%` }}
                              />
                            </span>
                          )}
                          <span className="block text-xs text-slate-500">
                            <LoanStatus item={item} />
                          </span>
                          <PrepaymentNote item={item} />
                          <ReservedFundsNote loan={loan} accountNames={accountNames} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Nouveau prêt' : 'Modifier le prêt'} onClose={close}>
          <LoanForm
            loan={editing === 'new' ? undefined : editing}
            banks={banks}
            accounts={accounts}
            onCancel={close}
            onSubmit={async (input) => {
              if (editing === 'new') await createLoan(input);
              else await updateLoan(editing.id, input);
              close();
            }}
            onDelete={
              editing === 'new'
                ? undefined
                : async () => {
                    await removeLoan(editing.id);
                    close();
                  }
            }
          />
        </Modal>
      )}
    </>
  );
}
