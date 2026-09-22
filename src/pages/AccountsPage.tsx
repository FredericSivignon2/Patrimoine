import { useMemo, useState } from 'react';
import { AccountForm } from '../components/accounts/AccountForm';
import { BanksCard } from '../components/banks/BanksCard';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { formatEuros, formatPercent } from '../components/common/format';
import { ChevronRightIcon, PlusIcon } from '../components/common/icons';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { BankBadge } from '../components/common/bankBadge';
import { PropertiesCard } from '../components/properties/PropertiesCard';
import { ACCOUNT_TYPE_LABELS, type Account, type AccountType } from '../domain/models/Account';
import { useAccounts } from '../hooks/useAccounts';
import { useBanks } from '../hooks/useBanks';
import { useMovements } from '../hooks/useMovements';
import { useProperties } from '../hooks/useProperties';
import { useLoans } from '../hooks/useLoans';

const GROUPS: readonly { type: AccountType; title: string }[] = [
  { type: 'CHECKING', title: 'Comptes courants' },
  { type: 'SAVINGS', title: 'Épargne' },
];

export function AccountsPage() {
  const { accounts, balances, locked, createAccount, updateAccount, removeAccount } = useAccounts();
  const { movements } = useMovements();
  const { banks, createBank, removeBank } = useBanks();
  const { loans } = useLoans();
  const { items: properties, createProperty, updateProperty, removeProperty } = useProperties();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);

  const bankNames = useMemo(() => new Map(banks.map((bank) => [bank.id, bank.name])), [banks]);
  const close = (): void => setEditing(null);
  const movementCount = (accountId: string): number =>
    movements.filter((movement) => movement.accountId === accountId).length;

  return (
    <>
      <PageHeader title="Comptes">
        <Button onClick={() => setEditing('new')}>
          <PlusIcon className="size-4" />
          Nouveau compte
        </Button>
      </PageHeader>

      {accounts.length === 0 ? (
        <EmptyState
          title="Aucun compte pour l’instant"
          description="Ajoutez vos comptes courants et vos livrets pour suivre leurs soldes."
        >
          <Button onClick={() => setEditing('new')}>Créer un compte</Button>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {GROUPS.map(({ type, title }) => {
            const group = accounts.filter((account) => account.type === type);
            if (group.length === 0) return null;
            return (
              <section key={type} aria-label={title}>
                <h2 className="mb-2 text-sm font-semibold text-slate-500">{title}</h2>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {group.map((account) => {
                    const balance = balances.get(account.id) ?? 0;
                    const lockedAmount = locked.get(account.id) ?? 0;
                    const count = movementCount(account.id);
                    const bankName = account.bankId ? bankNames.get(account.bankId) : undefined;
                    return (
                      <li key={account.id}>
                        <button
                          type="button"
                          onClick={() => setEditing(account)}
                          className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-teal-400"
                        >
                          {bankName && <BankBadge name={bankName} />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-slate-900">{account.name}</span>
                            <span className="block text-xs text-slate-500">
                              {ACCOUNT_TYPE_LABELS[account.type]}
                              {account.interestRate !== undefined && ` · ${formatPercent(account.interestRate)} / an`}
                              {` · ${count} mouvement${count > 1 ? 's' : ''}`}
                            </span>
                            {lockedAmount > 0 && (
                              <span className="mt-0.5 block text-xs font-medium text-amber-700">
                                {formatEuros(lockedAmount)} bloqués · {formatEuros(balance - lockedAmount)} déblocables
                              </span>
                            )}
                          </span>
                          <span
                            className={`text-lg font-bold tabular-nums ${balance < 0 ? 'text-rose-700' : 'text-slate-900'}`}
                          >
                            {formatEuros(balance)}
                          </span>
                          <ChevronRightIcon className="size-4 text-slate-400" />
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

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <BanksCard banks={banks} onCreate={(name) => createBank({ name })} onRemove={removeBank} />
        <PropertiesCard
          items={properties}
          loans={loans}
          onCreate={createProperty}
          onUpdate={updateProperty}
          onRemove={removeProperty}
        />
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Nouveau compte' : 'Modifier le compte'} onClose={close}>
          <AccountForm
            account={editing === 'new' ? undefined : editing}
            banks={banks}
            movementCount={editing === 'new' ? 0 : movementCount(editing.id)}
            onCancel={close}
            onSubmit={async (input) => {
              if (editing === 'new') await createAccount(input);
              else await updateAccount(editing.id, input);
              close();
            }}
            onDelete={
              editing === 'new'
                ? undefined
                : async () => {
                    await removeAccount(editing.id);
                    close();
                  }
            }
          />
        </Modal>
      )}
    </>
  );
}
