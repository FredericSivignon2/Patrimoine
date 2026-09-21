import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, buttonClasses } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { formatDay, formatMonth, formatSignedEuros } from '../components/common/format';
import { PlusIcon } from '../components/common/icons';
import { inputClass } from '../components/common/fields';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { MovementForm } from '../components/movements/MovementForm';
import { useFinancial } from '../context/FinancialContext';
import { MOVEMENT_TYPE_LABELS, type Movement } from '../domain/models/Movement';
import { monthKeyOfIso } from '../domain/services/Months';
import { useAccounts } from '../hooks/useAccounts';
import { useMovements } from '../hooks/useMovements';

const signedAmount = (movement: Movement): number =>
  movement.type === 'DEPOSIT' ? movement.amount : -movement.amount;

/** Valeur du filtre « retraits qui ne sont rattachés à aucun poste ». */
const NO_BUDGET = '__none__';

export function MovementsPage() {
  const { accounts } = useAccounts();
  const { budgets } = useFinancial();
  const { movements, createMovement, updateMovement, removeMovement } = useMovements();
  const [accountFilter, setAccountFilter] = useState('');
  const [budgetFilter, setBudgetFilter] = useState('');
  const [editing, setEditing] = useState<Movement | 'new' | null>(null);

  const accountNames = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const budgetNames = useMemo(() => new Map(budgets.map((budget) => [budget.id, budget.name])), [budgets]);

  const months = useMemo(() => {
    const matchesBudget = (movement: Movement): boolean => {
      if (budgetFilter === '') return true;
      if (budgetFilter === NO_BUDGET) {
        return movement.type === 'WITHDRAWAL' && !(movement.budgetId && budgetNames.has(movement.budgetId));
      }
      return movement.budgetId === budgetFilter;
    };
    // Plus récent d'abord ; à date égale, le dernier saisi en premier.
    const visible = movements
      .filter((movement) => accountFilter === '' || movement.accountId === accountFilter)
      .filter(matchesBudget)
      .reverse()
      .sort((a, b) => b.date.localeCompare(a.date));
    const groups = new Map<string, Movement[]>();
    for (const movement of visible) {
      const key = monthKeyOfIso(movement.date);
      groups.set(key, [...(groups.get(key) ?? []), movement]);
    }
    return [...groups.entries()];
  }, [movements, accountFilter, budgetFilter, budgetNames]);

  const close = (): void => setEditing(null);

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title="Mouvements" />
        <EmptyState title="Créez d’abord un compte" description="Les versements et retraits sont rattachés à un compte.">
          <Link to="/comptes" className={buttonClasses('primary')}>
            Aller aux comptes
          </Link>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Mouvements">
        <Button onClick={() => setEditing('new')}>
          <PlusIcon className="size-4" />
          Nouveau mouvement
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Filtrer par compte"
          className={`${inputClass} mt-0 sm:max-w-xs`}
          value={accountFilter}
          onChange={(event) => setAccountFilter(event.target.value)}
        >
          <option value="">Tous les comptes</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        {budgets.length > 0 && (
          <select
            aria-label="Filtrer par poste"
            className={`${inputClass} mt-0 sm:max-w-xs`}
            value={budgetFilter}
            onChange={(event) => setBudgetFilter(event.target.value)}
          >
            <option value="">Tous les postes</option>
            <option value={NO_BUDGET}>Retraits sans poste</option>
            {budgets.map((budget) => (
              <option key={budget.id} value={budget.id}>
                {budget.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {months.length === 0 ? (
        <EmptyState
          title="Aucun mouvement"
          description="Enregistrez vos versements et retraits pour suivre votre épargne mensuelle."
        >
          <Button onClick={() => setEditing('new')}>Ajouter un mouvement</Button>
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {months.map(([month, items]) => {
            const net = items.reduce((sum, movement) => sum + signedAmount(movement), 0);
            return (
              <section key={month} aria-label={formatMonth(month)}>
                <h2 className="mb-2 flex items-baseline justify-between px-1 text-sm font-semibold capitalize text-slate-500">
                  {formatMonth(month)}
                  <span className={`tabular-nums normal-case ${net < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {formatSignedEuros(net)}
                  </span>
                </h2>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                  {items.map((movement) => {
                    const budgetName = movement.budgetId ? budgetNames.get(movement.budgetId) : undefined;
                    return (
                      <li key={movement.id}>
                        <button
                          type="button"
                          onClick={() => setEditing(movement)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                        >
                          <span className="w-14 shrink-0 text-xs text-slate-500">{formatDay(movement.date)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {movement.note ?? MOVEMENT_TYPE_LABELS[movement.type]}
                            </span>
                            <span className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="truncate">{accountNames.get(movement.accountId) ?? 'Compte supprimé'}</span>
                              {budgetName && (
                                <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-800">
                                  {budgetName}
                                </span>
                              )}
                            </span>
                          </span>
                          <span
                            className={`font-semibold tabular-nums ${movement.type === 'DEPOSIT' ? 'text-emerald-700' : 'text-rose-700'}`}
                          >
                            {formatSignedEuros(signedAmount(movement))}
                          </span>
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
        <Modal title={editing === 'new' ? 'Nouveau mouvement' : 'Modifier le mouvement'} onClose={close}>
          <MovementForm
            movement={editing === 'new' ? undefined : editing}
            accounts={accounts}
            budgets={budgets}
            defaultAccountId={accountFilter || undefined}
            onCancel={close}
            onSubmit={async (input) => {
              if (editing === 'new') await createMovement(input);
              else await updateMovement(editing.id, input);
              close();
            }}
            onDelete={
              editing === 'new'
                ? undefined
                : async () => {
                    await removeMovement(editing.id);
                    close();
                  }
            }
          />
        </Modal>
      )}
    </>
  );
}
