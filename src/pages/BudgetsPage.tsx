import { useState } from 'react';
import { AllocationBar } from '../components/budgets/AllocationBar';
import { BudgetForm } from '../components/budgets/BudgetForm';
import { HORIZON_OPTIONS } from '../components/budgets/horizons';
import { ObjectivesCard } from '../components/budgets/ObjectivesCard';
import { SpendableSummary } from '../components/budgets/SpendableSummary';
import { SpendingOverviewCard } from '../components/budgets/SpendingOverviewCard';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { Segmented } from '../components/common/fields';
import { formatEuros, formatPercent, formatSignedEuros } from '../components/common/format';
import { ChevronRightIcon, PlusIcon } from '../components/common/icons';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { paletteColor } from '../components/common/palette';
import { SafetyDialog } from '../components/dashboard/SafetyDialog';
import { useFinancial } from '../context/FinancialContext';
import type { Budget, BudgetHorizon } from '../domain/models/Budget';
import { useBudgets } from '../hooks/useBudgets';

const HORIZON_CHOICES = HORIZON_OPTIONS.map((option) => ({
  value: String(option.months),
  label: option.short,
  ariaLabel: option.full,
}));

export function BudgetsPage() {
  const {
    budgets,
    plans,
    plan: today,
    timeline,
    startMonth,
    spent,
    spentTotal,
    objectives,
    objectivesSummary,
    hasSafety,
    createBudget,
    updateBudget,
    removeBudget,
    freePercent,
  } = useBudgets();
  const { movements, loans } = useFinancial();
  const [months, setMonths] = useState<BudgetHorizon>(0);
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const [editingSafety, setEditingSafety] = useState(false);

  const shown = plans.find((candidate) => candidate.months === months) ?? today;
  const close = (): void => setEditing(null);

  return (
    <>
      <PageHeader title="Postes de dépense">
        <Button onClick={() => setEditing('new')}>
          <PlusIcon className="size-4" />
          Nouveau poste
        </Button>
      </PageHeader>

      <div className="space-y-4">
        <Segmented
          legend="Voir les montants"
          name="horizon"
          value={String(months)}
          options={HORIZON_CHOICES}
          onChange={(value) => setMonths(HORIZON_OPTIONS.find((option) => String(option.months) === value)?.months ?? 0)}
        />

        <SpendableSummary plan={shown} months={months} hasSafety={hasSafety} onEditSafety={() => setEditingSafety(true)} />

        {shown.overAllocated && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
            La somme des pourcentages atteint {formatPercent(shown.allocatedPercent)} : elle dépasse 100 %. Le fichier a
            peut-être été modifié ailleurs ; ajustez les postes.
          </p>
        )}

        {budgets.length === 0 ? (
          <EmptyState
            title="Aucun poste pour l’instant"
            description="Un poste est une part de votre dépensable réservée à un projet : vacances, travaux, future voiture… Choisissez le pourcentage que vous pouvez y consacrer."
          >
            <Button onClick={() => setEditing('new')}>Créer un poste</Button>
          </EmptyState>
        ) : (
          <Card title="Répartition du dépensable">
            <AllocationBar shares={shown.shares} unallocatedPercent={shown.unallocatedPercent} />
            <ul className="mt-3 divide-y divide-slate-100">
              {shown.shares.map((share, index) => {
                const change = share.remaining - (today.shares[index]?.remaining ?? 0);
                const consumed = share.amount > 0 ? Math.min(1, share.spent / share.amount) : share.spent > 0 ? 1 : 0;
                return (
                  <li key={share.budget.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(share.budget)}
                      className="flex w-full items-center gap-3 py-3 text-left"
                    >
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: paletteColor(index) }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{share.budget.name}</span>
                        <span className="block text-xs text-slate-500">
                          {formatPercent(share.budget.percent)} du dépensable
                          {share.spent > 0 && ` · dépensé ${formatEuros(share.spent)} cette année`}
                        </span>
                        {share.spent > 0 && (
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                            <span
                              className={`block h-full rounded-full ${share.remaining < 0 ? 'bg-rose-500' : 'bg-teal-600'}`}
                              style={{ width: `${consumed * 100}%` }}
                            />
                          </span>
                        )}
                      </span>
                      <span className="text-right">
                        <span
                          className={`block text-lg font-bold tabular-nums ${share.remaining < 0 ? 'text-rose-700' : 'text-slate-900'}`}
                        >
                          {formatEuros(share.remaining)}
                        </span>
                        {share.remaining < 0 && <span className="block text-xs font-medium text-rose-700">dépassé</span>}
                        {months > 0 && (
                          <span
                            className={`block text-xs font-medium tabular-nums ${change < 0 ? 'text-rose-700' : 'text-emerald-700'}`}
                          >
                            {formatSignedEuros(change)} vs aujourd’hui
                          </span>
                        )}
                      </span>
                      <ChevronRightIcon className="size-4 text-slate-400" />
                    </button>
                  </li>
                );
              })}
              <li className="flex items-center gap-3 py-3 text-slate-500">
                <span className="size-3 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Non affecté</span>
                  <span className="block text-xs">{formatPercent(shown.unallocatedPercent)} du dépensable</span>
                </span>
                <span className="font-semibold tabular-nums">{formatEuros(shown.unallocatedAmount)}</span>
                <span className="size-4" aria-hidden="true" />
              </li>
            </ul>
            {spentTotal > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Ce qu’il reste sur chaque poste tient compte des retraits de l’année qui lui sont rattachés : une dépense
                sur un poste ne consomme que l’enveloppe de ce poste.
              </p>
            )}
          </Card>
        )}

        {objectives.length > 0 && <ObjectivesCard entries={objectives} summary={objectivesSummary} />}

        <SpendingOverviewCard movements={movements} budgets={budgets} loans={loans} />
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Nouveau poste' : 'Modifier le poste'} onClose={close}>
          <BudgetForm
            budget={editing === 'new' ? undefined : editing}
            maxPercent={freePercent(editing === 'new' ? undefined : editing.id)}
            timeline={timeline}
            startMonth={startMonth}
            spentTotal={spentTotal}
            spent={editing === 'new' ? 0 : (spent.get(editing.id) ?? 0)}
            onCancel={close}
            onSubmit={async (input) => {
              if (editing === 'new') await createBudget(input);
              else await updateBudget(editing.id, input);
              close();
            }}
            onDelete={
              editing === 'new'
                ? undefined
                : async () => {
                    await removeBudget(editing.id);
                    close();
                  }
            }
          />
        </Modal>
      )}

      {editingSafety && <SafetyDialog onClose={() => setEditingSafety(false)} />}
    </>
  );
}
