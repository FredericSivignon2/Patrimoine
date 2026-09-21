import { useState, type FormEvent } from 'react';
import { BUDGET_SUGGESTIONS, type Budget, type NewBudget } from '../../domain/models/Budget';
import type { MonthKey } from '../../domain/models/Projection';
import { budgetAmount, evaluateObjective } from '../../domain/services/BudgetEngine';
import { centsToInputString, parseAmountToCents, parsePercent, type Cents } from '../../domain/services/FinancialMath';
import { Button } from '../common/Button';
import { errorMessage } from '../common/errorMessage';
import { DeleteButton, Field, FormError, SuffixInput, inputClass } from '../common/fields';
import { formatEuros, formatPercent, formatWholeEuros } from '../common/format';
import { HORIZON_OPTIONS } from './horizons';
import { ObjectiveStatus } from './ObjectiveStatus';

interface BudgetFormProps {
  budget?: Budget;
  /** Pourcentage encore libre pour ce poste : 100 moins la somme des autres postes. */
  maxPercent: number;
  /** Dépensable projeté mois par mois (index 0 = aujourd'hui), pour les aperçus et l'objectif. */
  timeline: readonly Cents[];
  startMonth: MonthKey;
  /** Total dépensé cette année sur tous les postes (il fait partie de la base de répartition). */
  spentTotal: Cents;
  /** Dépensé cette année sur ce poste. */
  spent: Cents;
  onSubmit: (input: NewBudget) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onCancel: () => void;
}

export function BudgetForm({
  budget,
  maxPercent,
  timeline,
  startMonth,
  spentTotal,
  spent,
  onSubmit,
  onDelete,
  onCancel,
}: BudgetFormProps) {
  const [name, setName] = useState(budget?.name ?? '');
  const [percentText, setPercentText] = useState(budget ? String(budget.percent).replace('.', ',') : '');
  const [targetText, setTargetText] = useState(budget?.targetAmount === undefined ? '' : centsToInputString(budget.targetAmount));
  const [targetDate, setTargetDate] = useState(budget?.targetDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const percent = parsePercent(percentText);
  const validPercent = percent !== null && percent <= maxPercent ? percent : null;
  const sliderMax = Math.floor(maxPercent);

  const targetAmount = parseAmountToCents(targetText);
  const outcome =
    targetAmount !== null && targetAmount > 0 && targetDate !== ''
      ? evaluateObjective({ percent: validPercent ?? 0, targetAmount, targetDate, spent }, timeline, startMonth, spentTotal)
      : undefined;
  /** Ce qu'il reste à dépenser sur le poste à une échéance, avec le pourcentage saisi. */
  const remainingAt = (months: number, percentValue: number): Cents =>
    budgetAmount(timeline[months] + spentTotal, percentValue) - spent;

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
    if (percent === null) {
      setError('Pourcentage invalide (ex. 25 ou 12,5).');
      return;
    }
    if (percent > maxPercent) {
      setError(`Il ne reste que ${formatPercent(maxPercent)} à répartir.`);
      return;
    }

    let objective: { targetAmount: number; targetDate: string } | undefined;
    if (targetText.trim() !== '' || targetDate !== '') {
      if (targetAmount === null || targetAmount <= 0 || targetDate === '') {
        setError('Objectif incomplet : renseignez un montant visé positif et une échéance, ou laissez les deux vides.');
        return;
      }
      objective = { targetAmount, targetDate };
    }
    void run(() => onSubmit({ name, percent, targetAmount: objective?.targetAmount, targetDate: objective?.targetDate }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      {!budget && (
        <div className="flex flex-wrap gap-2" aria-label="Suggestions de noms" role="group">
          {BUDGET_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setName(suggestion)}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <Field label="Nom du poste">
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Vacances, travaux, voiture…"
          maxLength={60}
          required
          autoFocus
        />
      </Field>

      <div>
        <Field label="Part du dépensable">
          <SuffixInput suffix="%" value={percentText} onChange={(event) => setPercentText(event.target.value)} placeholder="25" />
        </Field>
        <input
          type="range"
          aria-label="Ajuster le pourcentage"
          min={0}
          max={sliderMax}
          step={1}
          disabled={sliderMax === 0}
          value={Math.min(Math.round(percent ?? 0), sliderMax)}
          onChange={(event) => setPercentText(event.target.value)}
          className="mt-3 w-full accent-teal-700"
        />
        <p className="mt-1 text-sm text-slate-600" aria-live="polite">
          {validPercent !== null
            ? `Soit ${formatEuros(remainingAt(0, validPercent))} aujourd’hui.`
            : 'Saisissez un pourcentage pour voir le montant.'}
        </p>
        {spent > 0 && (
          <p className="text-xs text-slate-500">
            Ce poste a déjà consommé {formatEuros(spent)} cette année : ce montant est déduit.
          </p>
        )}
        <p className="text-xs text-slate-500">Reste à répartir pour ce poste : {formatPercent(maxPercent)}.</p>

        <dl aria-label="Montant du poste dans le temps" className="mt-3 grid grid-cols-5 gap-1 text-center">
          {HORIZON_OPTIONS.map((option) => (
            <div key={option.months} className="rounded-lg bg-slate-50 px-1 py-2">
              <dt className="text-[11px] text-slate-500">{option.short}</dt>
              <dd className="text-xs font-semibold tabular-nums text-slate-800">
                {validPercent !== null ? formatWholeEuros(remainingAt(option.months, validPercent)) : '—'}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-1 text-[11px] text-slate-500">Projection sans nouvelle dépense d’ici là.</p>
      </div>

      <section aria-label="Objectif" className="space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Objectif (optionnel)</h3>
          <p className="text-xs text-slate-500">
            Un montant à réunir pour ce poste à une date donnée : l’application vérifie si c’est atteignable.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Montant visé">
            <SuffixInput suffix="€" value={targetText} onChange={(event) => setTargetText(event.target.value)} placeholder="15 000" />
          </Field>
          <Field label="Échéance">
            <input type="date" className={inputClass} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </Field>
        </div>
        {outcome && (
          <ObjectiveStatus
            outcome={outcome}
            percent={validPercent ?? 0}
            maxPercent={maxPercent}
            onUsePercent={(required) => setPercentText(String(required).replace('.', ','))}
          />
        )}
      </section>

      <FormError message={error} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" disabled={busy}>
          Enregistrer
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
      {budget && onDelete && (
        <div className="border-t border-slate-200 pt-4">
          <DeleteButton label="Supprimer le poste" disabled={busy} onConfirm={() => void run(onDelete)} />
        </div>
      )}
    </form>
  );
}
