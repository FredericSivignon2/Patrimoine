import { useState, type FormEvent } from 'react';
import type { Account } from '../../domain/models/Account';
import type { Budget } from '../../domain/models/Budget';
import type { Movement, MovementType, NewMovement } from '../../domain/models/Movement';
import { centsToInputString, parseAmountToCents } from '../../domain/services/FinancialMath';
import { toIsoDate } from '../../domain/services/Months';
import { Button } from '../common/Button';
import { errorMessage } from '../common/errorMessage';
import { DeleteButton, Field, FormError, Segmented, SuffixInput, inputClass } from '../common/fields';

const TYPE_OPTIONS = [
  { value: 'DEPOSIT', label: 'Versement', activeClass: 'has-checked:text-emerald-700' },
  { value: 'WITHDRAWAL', label: 'Retrait', activeClass: 'has-checked:text-rose-700' },
] as const;

interface MovementFormProps {
  movement?: Movement;
  accounts: Account[];
  /** Postes de dépense auxquels un retrait peut être rattaché. */
  budgets: Budget[];
  defaultAccountId?: string;
  onSubmit: (input: NewMovement) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onCancel: () => void;
}

export function MovementForm({
  movement,
  accounts,
  budgets,
  defaultAccountId,
  onSubmit,
  onDelete,
  onCancel,
}: MovementFormProps) {
  const [type, setType] = useState<MovementType>(movement?.type ?? 'DEPOSIT');
  const [accountId, setAccountId] = useState(movement?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState(movement ? centsToInputString(movement.amount) : '');
  const [date, setDate] = useState(movement?.date ?? toIsoDate(new Date()));
  const [note, setNote] = useState(movement?.note ?? '');
  const [budgetId, setBudgetId] = useState(movement?.budgetId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const cents = parseAmountToCents(amount);
    if (cents === null || cents <= 0) {
      setError('Montant invalide : saisissez un montant positif (ex. 250 ou 12,50). Le sens est choisi ci-dessus.');
      return;
    }
    if (date === '') {
      setError('La date est obligatoire.');
      return;
    }
    void run(() =>
      onSubmit({
        accountId,
        type,
        amount: cents,
        date,
        note: note.trim() || undefined,
        budgetId: type === 'WITHDRAWAL' && budgetId ? budgetId : undefined,
      }),
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <Segmented
        legend="Type de mouvement"
        name="movement-type"
        value={type}
        options={TYPE_OPTIONS}
        onChange={(next) => {
          setType(next);
          if (next === 'DEPOSIT') setBudgetId(''); // seul un retrait se rattache à un poste
        }}
      />
      <Field label="Compte">
        <select className={inputClass} value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Montant">
          <SuffixInput suffix="€" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" autoFocus />
        </Field>
        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </Field>
      </div>
      {type === 'WITHDRAWAL' && budgets.length > 0 && (
        <Field label="Poste (facultatif)" hint="Rattachez ce retrait à un poste pour voir où passe l’argent.">
          <select className={inputClass} value={budgetId} onChange={(event) => setBudgetId(event.target.value)}>
            <option value="">Aucun poste</option>
            {budgets.map((budget) => (
              <option key={budget.id} value={budget.id}>
                {budget.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Note (optionnel)">
        <input
          className={inputClass}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={120}
          placeholder="Salaire, courses…"
        />
      </Field>
      <FormError message={error} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" disabled={busy}>
          Enregistrer
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
      {movement && onDelete && (
        <div className="border-t border-slate-200 pt-4">
          <DeleteButton label="Supprimer le mouvement" disabled={busy} onConfirm={() => void run(onDelete)} />
        </div>
      )}
    </form>
  );
}
