import { useState, type FormEvent } from 'react';
import type { Loan } from '../../domain/models/Loan';
import type { Movement } from '../../domain/models/Movement';
import type { IncomeSource, SavingsEffortSettings } from '../../domain/models/SavingsEffort';
import { centsToInputString, parseAmountToCents, parsePercent } from '../../domain/services/FinancialMath';
import { computeSavingsCapacity } from '../../domain/services/SavingsEffortEngine';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { errorMessage } from '../common/errorMessage';
import { DeleteButton, Field, FormError, SuffixInput, inputClass } from '../common/fields';
import { formatEuros, formatPercent } from '../common/format';
import { PlusIcon, XIcon } from '../common/icons';

interface IncomeRow {
  key: number;
  name: string;
  amount: string;
}

let rowKeySeed = 0;
const newRow = (name = '', amount = ''): IncomeRow => ({ key: ++rowKeySeed, name, amount });

interface IncomeSourcesCardProps {
  settings: SavingsEffortSettings | undefined;
  loans: readonly Loan[];
  movements: readonly Movement[];
  onSave: (settings: SavingsEffortSettings) => Promise<unknown>;
  onClear: () => Promise<unknown>;
}

/** Réglages de l'effort d'épargne : revenus récurrents et taux cible, avec un aperçu en direct du calcul. */
export function IncomeSourcesCard({ settings, loans, movements, onSave, onClear }: IncomeSourcesCardProps) {
  const [rows, setRows] = useState<IncomeRow[]>(() =>
    (settings?.incomeSources ?? []).map((source) => newRow(source.name, centsToInputString(source.monthlyAmount))),
  );
  const [rateText, setRateText] = useState(
    settings ? String(settings.targetRatePercent).replace('.', ',') : '15',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateRow = (key: number, patch: Partial<Omit<IncomeRow, 'key'>>): void =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // Aperçu en direct à partir des valeurs saisies, même avant d'enregistrer.
  const incomeSources: IncomeSource[] = rows.flatMap((row) => {
    const amount = parseAmountToCents(row.amount);
    if (row.name.trim() === '' || amount === null || amount <= 0) return [];
    return [{ name: row.name.trim(), monthlyAmount: amount }];
  });
  const rate = parsePercent(rateText);
  const preview =
    rate !== null && rate >= 0 && rate <= 100
      ? computeSavingsCapacity({ incomeSources, targetRatePercent: rate }, loans, movements, new Date())
      : undefined;

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
    if (rate === null || rate < 0 || rate > 100) {
      setError('Taux cible invalide (entre 0 et 100, ex. 15).');
      return;
    }
    for (const [index, row] of rows.entries()) {
      if (row.name.trim() === '' && row.amount.trim() === '') continue; // ligne vide ignorée
      const amount = parseAmountToCents(row.amount);
      if (row.name.trim() === '' || amount === null || amount <= 0) {
        setError(`Revenu ${index + 1} : saisissez un nom et un montant mensuel positif.`);
        return;
      }
    }
    void run(() => onSave({ incomeSources, targetRatePercent: rate }));
  };

  return (
    <Card title="Vos revenus et votre objectif">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Revenus nets mensuels récurrents</p>
          <p className="text-xs text-slate-500">
            Salaires, revenu locatif… Ne servent qu'à ce calcul, jamais ajoutés à vos comptes ni à votre patrimoine.
          </p>
          {rows.map((row, index) => (
            <fieldset key={row.key} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <legend className="sr-only">Revenu {index + 1}</legend>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Revenu {index + 1}</span>
                <button
                  type="button"
                  aria-label={`Retirer le revenu ${index + 1}`}
                  onClick={() => setRows((current) => current.filter((other) => other.key !== row.key))}
                  className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nom">
                  <input
                    className={inputClass}
                    value={row.name}
                    onChange={(event) => updateRow(row.key, { name: event.target.value })}
                    placeholder="Salaire"
                    maxLength={60}
                  />
                </Field>
                <Field label="Montant net / mois">
                  <SuffixInput
                    suffix="€"
                    value={row.amount}
                    onChange={(event) => updateRow(row.key, { amount: event.target.value })}
                    placeholder="2 000"
                  />
                </Field>
              </div>
            </fieldset>
          ))}
          <Button variant="secondary" className="w-full" onClick={() => setRows((current) => [...current, newRow()])}>
            <PlusIcon className="size-4" />
            Ajouter un revenu
          </Button>
        </div>

        <Field
          label="Taux d'épargne cible"
          hint="Part de ce qu'il reste chaque mois, une fois les prêts et vos grosses dépenses de postes déduits de vos revenus, à mettre de côté sur un compte d'épargne libre."
        >
          <SuffixInput suffix="%" value={rateText} onChange={(event) => setRateText(event.target.value)} placeholder="15" />
        </Field>

        {preview && (
          <div role="status" className="space-y-1 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900 ring-1 ring-teal-100">
            <p className="text-xs">
              Revenus {formatEuros(preview.income)} − prêts {formatEuros(preview.loanPayments)} − postes (moyenne)
              {' '}
              {formatEuros(preview.budgetProvisions)} = reste {formatEuros(preview.residual)}/mois.
            </p>
            <p className="font-semibold">
              Objectif d'épargne libre : {formatEuros(preview.target)}/mois ({formatPercent(rate ?? 0)} de ce qui reste).
            </p>
          </div>
        )}

        <FormError message={error} />
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" disabled={busy}>
            Enregistrer
          </Button>
        </div>
        {settings && (
          <div className="border-t border-slate-200 pt-4">
            <DeleteButton label="Ne plus suivre l'effort d'épargne" disabled={busy} onConfirm={() => void run(onClear)} />
          </div>
        )}
      </form>
    </Card>
  );
}
