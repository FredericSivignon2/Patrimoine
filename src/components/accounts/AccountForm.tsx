import { useState, type FormEvent } from 'react';
import { MAX_DEPOSIT_LOCK_YEARS, type Account, type AccountType, type LockedTranche, type NewAccount } from '../../domain/models/Account';
import { centsToInputString, parseAmountToCents, parsePercent } from '../../domain/services/FinancialMath';
import { Button } from '../common/Button';
import { errorMessage } from '../common/errorMessage';
import { DeleteButton, Field, FormError, Segmented, SuffixInput, inputClass } from '../common/fields';
import { PlusIcon, XIcon } from '../common/icons';

const TYPE_OPTIONS = [
  { value: 'CHECKING', label: 'Compte courant' },
  { value: 'SAVINGS', label: 'Épargne' },
] as const;

const YEARS_PATTERN = /^\d+$/;

interface TrancheRow {
  key: number;
  amount: string;
  date: string;
}

let rowKeySeed = 0;
const newRow = (amount = '', date = ''): TrancheRow => ({ key: ++rowKeySeed, amount, date });

interface AccountFormProps {
  account?: Account;
  movementCount?: number;
  onSubmit: (input: NewAccount) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onCancel: () => void;
}

export function AccountForm({ account, movementCount = 0, onSubmit, onDelete, onCancel }: AccountFormProps) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'CHECKING');
  const [balance, setBalance] = useState(account ? centsToInputString(account.initialBalance) : '');
  const [rate, setRate] = useState(account?.interestRate === undefined ? '' : String(account.interestRate).replace('.', ','));
  const [lockYears, setLockYears] = useState(account?.depositLockYears === undefined ? '' : String(account.depositLockYears));
  const [tranches, setTranches] = useState<TrancheRow[]>(() =>
    (account?.lockedTranches ?? []).map((tranche) => newRow(centsToInputString(tranche.amount), tranche.unlockDate)),
  );
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

  const updateRow = (key: number, patch: Partial<Omit<TrancheRow, 'key'>>): void =>
    setTranches((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const initialBalance = parseAmountToCents(balance.trim() === '' ? '0' : balance);
    if (initialBalance === null) {
      setError('Solde initial invalide (ex. 1 250,50).');
      return;
    }

    let interestRate: number | undefined;
    let depositLockYears: number | undefined;
    const lockedTranches: LockedTranche[] = [];
    if (type === 'SAVINGS') {
      if (rate.trim() !== '') {
        const parsedRate = parsePercent(rate);
        if (parsedRate === null) {
          setError('Taux invalide (ex. 2,4).');
          return;
        }
        interestRate = parsedRate;
      }
      if (lockYears.trim() !== '') {
        const years = Number(lockYears.trim());
        if (!YEARS_PATTERN.test(lockYears.trim()) || years > MAX_DEPOSIT_LOCK_YEARS) {
          setError(`Durée de blocage invalide : un nombre entier d’années, au plus ${MAX_DEPOSIT_LOCK_YEARS}.`);
          return;
        }
        depositLockYears = years;
      }
      for (const [index, row] of tranches.entries()) {
        if (row.amount.trim() === '' && row.date === '') continue; // ligne vide ignorée
        const amount = parseAmountToCents(row.amount);
        if (amount === null || amount <= 0 || row.date === '') {
          setError(`Tranche ${index + 1} : saisissez un montant positif et une date de déblocage.`);
          return;
        }
        lockedTranches.push({ amount, unlockDate: row.date });
      }
    }

    void run(() => onSubmit({ name, type, initialBalance, interestRate, lockedTranches, depositLockYears }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <Field label="Nom du compte">
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Livret A"
          maxLength={60}
          required
          autoFocus
        />
      </Field>
      <Segmented legend="Type de compte" name="account-type" value={type} options={TYPE_OPTIONS} onChange={setType} />
      <Field label="Solde initial" hint="Solde avant le premier mouvement enregistré.">
        <SuffixInput suffix="€" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0,00" />
      </Field>
      {type === 'SAVINGS' && (
        <>
          <Field label="Taux annuel (optionnel)" hint="Utilisé pour les projections : intérêts composés chaque mois.">
            <SuffixInput suffix="%" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="2,4" />
          </Field>

          <section className="space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200" aria-label="Fonds bloqués">
            <h3 className="text-sm font-semibold text-slate-800">Fonds bloqués</h3>
            <Field
              label="Versements bloqués pendant"
              hint="Ex. 5 pour un PEE : chaque versement enregistré est bloqué 5 ans. Vide si les versements restent disponibles."
            >
              <SuffixInput
                suffix="ans"
                inputMode="numeric"
                value={lockYears}
                onChange={(event) => setLockYears(event.target.value)}
                placeholder="5"
              />
            </Field>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Fonds déjà bloqués</p>
              <p className="text-xs text-slate-500">
                Une tranche par échéance de déblocage, pour le stock présent aujourd’hui (ex. les annuités d’un PEE).
              </p>
              {tranches.map((row, index) => (
                <fieldset key={row.key} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <legend className="sr-only">Tranche {index + 1}</legend>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Tranche {index + 1}</span>
                    <button
                      type="button"
                      aria-label={`Retirer la tranche ${index + 1}`}
                      onClick={() => setTranches((rows) => rows.filter((other) => other.key !== row.key))}
                      className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Montant bloqué">
                      <SuffixInput
                        suffix="€"
                        value={row.amount}
                        onChange={(event) => updateRow(row.key, { amount: event.target.value })}
                        placeholder="0,00"
                      />
                    </Field>
                    <Field label="Débloqué le">
                      <input
                        type="date"
                        className={inputClass}
                        value={row.date}
                        onChange={(event) => updateRow(row.key, { date: event.target.value })}
                      />
                    </Field>
                  </div>
                </fieldset>
              ))}
              <Button variant="secondary" className="w-full" onClick={() => setTranches((rows) => [...rows, newRow()])}>
                <PlusIcon className="size-4" />
                Ajouter une tranche
              </Button>
            </div>
          </section>
        </>
      )}
      <FormError message={error} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" disabled={busy}>
          Enregistrer
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
      {account && onDelete && (
        <div className="space-y-2 border-t border-slate-200 pt-4">
          <DeleteButton label="Supprimer le compte" disabled={busy} onConfirm={() => void run(onDelete)} />
          {movementCount > 0 && (
            <p className="text-xs text-slate-500">
              Cette action supprime aussi {movementCount === 1 ? 'son mouvement' : `ses ${movementCount} mouvements`}.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
