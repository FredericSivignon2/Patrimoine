import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AllocationChart } from '../components/charts/AllocationChart';
import { MonthlySavingsChart } from '../components/charts/MonthlySavingsChart';
import { ProjectionChart } from '../components/charts/ProjectionChart';
import { Button, buttonClasses } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { BudgetsSummaryCard } from '../components/budgets/BudgetsSummaryCard';
import { formatEuros, formatPercent, formatSignedEuros, lockedSegments } from '../components/common/format';
import { PatrimoineHero } from '../components/dashboard/PatrimoineHero';
import { LoansSummaryCard } from '../components/dashboard/LoansSummaryCard';
import { SafetyDialog } from '../components/dashboard/SafetyDialog';
import { SavingsEffortBanner } from '../components/dashboard/SavingsEffortBanner';
import { SpendSimulator } from '../components/dashboard/SpendSimulator';
import { UnlockScheduleCard } from '../components/dashboard/UnlockScheduleCard';
import { useFinancial } from '../context/FinancialContext';
import type { AccountType } from '../domain/models/Account';
import { sumCents } from '../domain/services/FinancialMath';
import { useAccounts } from '../hooks/useAccounts';
import { useBudgets } from '../hooks/useBudgets';
import { useLoans } from '../hooks/useLoans';
import { useProjections } from '../hooks/useProjections';
import { useProperties } from '../hooks/useProperties';
import { useSafety } from '../hooks/useSafety';
import { useSavingsEffort } from '../hooks/useSavingsEffort';

const deltaTone = (cents: number): string => (cents < 0 ? 'text-rose-700' : 'text-emerald-700');

const GROUPS: readonly { type: AccountType; title: string }[] = [
  { type: 'CHECKING', title: 'Comptes courants' },
  { type: 'SAVINGS', title: 'Épargne' },
];

export function DashboardPage() {
  const { accounts, balances, locked, reserved, totals } = useAccounts();
  const { projection, hasLockedFunds, hasReservedFunds, unlocks, history } = useProjections();
  const { settings, status } = useSafety(projection.currentAvailable);
  const { budgets, plan, spent, hasSafety, objectivesSummary } = useBudgets();
  const { loans, items: loanItems, totals: loanTotals } = useLoans();
  const { items: propertyItems, totalCushion } = useProperties();
  const { report: effortReport } = useSavingsEffort();
  const { loadDemoData } = useFinancial();
  const [editingSafety, setEditingSafety] = useState(false);

  const propertyBreakdown = useMemo(
    () => propertyItems.map((item) => `${item.name} : ${formatEuros(item.cushion)}`).join(' · '),
    [propertyItems],
  );
  const reservedBreakdown = useMemo(
    () =>
      loans
        .filter((loan) => loan.reservedFunds && loan.reservedFunds.allocations.length > 0)
        .map((loan) => {
          const amount = sumCents(loan.reservedFunds?.allocations.map((allocation) => allocation.amount) ?? []);
          return `${loan.name} : ${formatEuros(amount)}`;
        })
        .join(' · '),
    [loans],
  );

  const allocation = useMemo(
    () =>
      accounts
        .map((account) => ({ name: account.name, balance: balances.get(account.id) ?? 0 }))
        .filter((item) => item.balance > 0),
    [accounts, balances],
  );
  const accountNames = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);

  if (accounts.length === 0) {
    return (
      <EmptyState
        title="Bienvenue dans Patrimoine"
        description="Créez votre premier compte pour suivre vos soldes, votre épargne mensuelle et ses projections à 1, 2, 3 et 5 ans."
      >
        <Link to="/comptes" className={buttonClasses('primary')}>
          Créer un compte
        </Link>
        <Button variant="secondary" onClick={() => void loadDemoData()}>
          Charger des données de démonstration
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <PatrimoineHero
        total={totals.total}
        locked={projection.currentLocked}
        available={projection.currentAvailable}
        monthlyContribution={projection.monthlyContribution}
        status={status}
        onEditSafety={() => setEditingSafety(true)}
        reserved={projection.currentReserved}
        reservedBreakdown={reservedBreakdown}
        propertyCushion={totalCushion}
        propertyBreakdown={propertyBreakdown}
      />

      {effortReport && <SavingsEffortBanner window={effortReport.current} />}

      <BudgetsSummaryCard plan={plan} hasSafety={hasSafety} objectivesNotReached={objectivesSummary.notReached} />

      <SpendSimulator points={projection.points} safety={settings} budgets={budgets} spent={spent} />

      {loanItems.length > 0 && (
        <LoansSummaryCard
          items={loanItems}
          outstanding={loanTotals.outstanding}
          monthlyPayments={loanTotals.monthlyPayments}
        />
      )}

      <section aria-label="Projections" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {projection.horizons.map((horizon) => {
          const gain = horizon.balance - projection.currentBalance;
          return (
            <div key={horizon.months} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <p className="text-xs font-medium text-slate-500">
                {horizon.months === 12 ? 'Dans 1 an' : `Dans ${horizon.months / 12} ans`}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatEuros(horizon.balance)}</p>
              <p className={`text-xs font-semibold tabular-nums ${deltaTone(gain)}`}>{formatSignedEuros(gain)}</p>
              {(hasLockedFunds || hasReservedFunds) && (
                <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  Déblocable :{' '}
                  <span className="font-semibold tabular-nums text-slate-700">{formatEuros(horizon.available)}</span>
                </p>
              )}
            </div>
          );
        })}
      </section>

      <Card title="Projection du patrimoine">
        <ProjectionChart points={projection.points} showAvailable={hasLockedFunds} threshold={settings?.threshold} />
        <p className="mt-3 text-xs text-slate-500">
          Basée sur l’épargne mensuelle moyenne constatée de chaque compte et, pour les comptes rémunérés, sur des
          intérêts composés chaque mois.
          {hasLockedFunds &&
            ' La part déblocable tient compte des dates de déblocage ; les versements futurs des comptes à versements bloqués sont eux aussi bloqués.'}
        </p>
      </Card>

      {unlocks.length > 0 && <UnlockScheduleCard events={unlocks} accountNames={accountNames} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Répartition par compte">
          {allocation.length > 0 ? (
            <AllocationChart items={allocation} />
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Aucun solde positif à afficher.</p>
          )}
        </Card>
        <Card title="Versements nets des 12 derniers mois">
          <MonthlySavingsChart history={history} />
        </Card>
      </div>

      <Card
        title="Soldes actuels"
        action={
          <Link to="/comptes" className="text-sm font-semibold text-teal-700 hover:underline">
            Gérer les comptes
          </Link>
        }
      >
        <div className="space-y-4">
          {GROUPS.map(({ type, title }) => {
            const group = accounts.filter((account) => account.type === type);
            if (group.length === 0) return null;
            return (
              <section key={type} aria-label={title}>
                <h3 className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {title}
                  <span className="tabular-nums normal-case">
                    {formatEuros(type === 'CHECKING' ? totals.checking : totals.savings)}
                  </span>
                </h3>
                <ul className="divide-y divide-slate-100">
                  {group.map((account) => {
                    const balance = balances.get(account.id) ?? 0;
                    const lockedAmount = locked.get(account.id) ?? 0;
                    const reservedAmount = reserved.get(account.id) ?? 0;
                    const segments = lockedSegments(lockedAmount, reservedAmount);
                    return (
                      <li key={account.id} className="flex items-center justify-between gap-3 py-3">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{account.name}</span>
                          {(account.interestRate !== undefined || segments.length > 0) && (
                            <span className="block text-xs text-slate-500">
                              {account.interestRate !== undefined && `${formatPercent(account.interestRate)} / an`}
                              {account.interestRate !== undefined && segments.length > 0 && ' · '}
                              {segments.length > 0 && (
                                <span className="font-medium text-amber-700">{segments.join(' · ')}</span>
                              )}
                            </span>
                          )}
                        </span>
                        <span className={`font-semibold tabular-nums ${balance < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                          {formatEuros(balance)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </Card>

      {editingSafety && <SafetyDialog onClose={() => setEditingSafety(false)} />}
    </div>
  );
}
