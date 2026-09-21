import { useMemo, useState } from 'react';
import type { Budget } from '../../domain/models/Budget';
import type { ProjectionPoint } from '../../domain/models/Projection';
import type { SafetyLevel, SafetySettings } from '../../domain/models/Safety';
import type { SpentByBudget } from '../../domain/services/BudgetEngine';
import { parseAmountToCents } from '../../domain/services/FinancialMath';
import {
  SIMULATION_DELAYS,
  simulateSpending,
  type SpendSimulation,
  type SpendVerdict,
} from '../../domain/services/SpendingSimulator';
import { Card } from '../common/Card';
import { Field, SuffixInput, inputClass } from '../common/fields';
import { formatEuros, formatMonth } from '../common/format';

const VERDICT_TONES: Record<SpendVerdict, string> = {
  reasonable: 'bg-emerald-50 text-emerald-950 ring-emerald-200',
  tight: 'bg-yellow-50 text-yellow-950 ring-yellow-300',
  'over-budget': 'bg-orange-50 text-orange-950 ring-orange-200',
  unsafe: 'bg-rose-50 text-rose-950 ring-rose-200',
};

/** Couleur de la bannière du tableau de bord après la dépense. */
const BANNER_LEVELS: Record<SafetyLevel, { label: string; dot: string }> = {
  ok: { label: 'verte', dot: 'bg-emerald-600' },
  warning: { label: 'jaune', dot: 'bg-yellow-400' },
  alert: { label: 'orange', dot: 'bg-orange-500' },
  critical: { label: 'rouge', dot: 'bg-red-600' },
};

function delayLabel(months: number): string {
  if (months === 0) return 'Aujourd’hui';
  if (months % 12 === 0) return `Dans ${months / 12} an${months > 12 ? 's' : ''}`;
  return `Dans ${months} mois`;
}

function describeVerdict(simulation: SpendSimulation): { title: string; detail: string } {
  const { verdict, budget, safety } = simulation;
  switch (verdict) {
    case 'reasonable':
      return {
        title: 'Raisonnable',
        detail: `Cette dépense ${budget ? `tient dans le budget du poste ${budget.name}` : 'reste dans votre dépensable'}${
          safety ? ' et laisse une marge de sécurité confortable' : ''
        }.`,
      };
    case 'tight':
      return {
        title: 'Possible, mais la marge devient faible',
        detail: `Après cette dépense, il ne resterait que ${formatEuros(safety?.margin ?? 0)} au-dessus du seuil de sécurité.`,
      };
    case 'over-budget':
      return {
        title: 'Dépasse le budget du poste',
        detail: `Le poste ${budget?.name ?? ''} disposerait de ${formatEuros(budget?.before ?? 0)} à cette date : il manquerait ${formatEuros(-(budget?.after ?? 0))}.`,
      };
    case 'unsafe':
      return safety
        ? {
            title: 'Déconseillé : sous le seuil de sécurité',
            detail: `Il manquerait ${formatEuros(simulation.threshold - simulation.availableAfter)} pour rester au seuil de sécurité de ${formatEuros(simulation.threshold)}.`,
          }
        : {
            title: 'Déconseillé : plus que le déblocable',
            detail: `Il manquerait ${formatEuros(-simulation.availableAfter)} : cette dépense dépasse le patrimoine déblocable.`,
          };
  }
}

function Row({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div>
      <dt className="text-xs opacity-75">{label}</dt>
      <dd className="font-semibold tabular-nums">
        {before} <span aria-hidden="true">→</span>
        <span className="sr-only"> devient </span> {after}
      </dd>
    </div>
  );
}

interface SpendSimulatorProps {
  points: ProjectionPoint[];
  safety: SafetySettings | undefined;
  budgets: Budget[];
  /** Dépenses de l'année déjà rattachées à chaque poste. */
  spent: SpentByBudget;
}

/** « Et si je dépense X ? » : effet d'une dépense sur le déblocable, la marge de sécurité et un poste. */
export function SpendSimulator({ points, safety, budgets, spent }: SpendSimulatorProps) {
  const [amountText, setAmountText] = useState('');
  const [delay, setDelay] = useState('0');
  const [budgetId, setBudgetId] = useState('');

  const amount = parseAmountToCents(amountText);
  const simulation = useMemo(
    () =>
      amount !== null && amount > 0
        ? simulateSpending(
            { amount, monthIndex: Number(delay), budgetId: budgetId || undefined },
            points,
            safety,
            budgets,
            spent,
          )
        : undefined,
    [amount, delay, budgetId, points, safety, budgets, spent],
  );

  const verdict = simulation ? describeVerdict(simulation) : undefined;
  const level = simulation?.safety ? BANNER_LEVELS[simulation.safety.level] : undefined;

  return (
    <Card title="Et si je dépense… ?">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Montant">
          <SuffixInput suffix="€" value={amountText} onChange={(event) => setAmountText(event.target.value)} placeholder="3 000" />
        </Field>
        <Field label="Quand ?">
          <select className={inputClass} value={delay} onChange={(event) => setDelay(event.target.value)}>
            {SIMULATION_DELAYS.map((months) => (
              <option key={months} value={months}>
                {delayLabel(months)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Poste">
          <select className={inputClass} value={budgetId} onChange={(event) => setBudgetId(event.target.value)}>
            <option value="">Aucun poste en particulier</option>
            {budgets.map((budget) => (
              <option key={budget.id} value={budget.id}>
                {budget.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {simulation && verdict ? (
        <div
          role="status"
          data-verdict={simulation.verdict}
          className={`mt-4 space-y-3 rounded-2xl p-4 ring-1 ${VERDICT_TONES[simulation.verdict]}`}
        >
          <div>
            <p className="text-base font-semibold">{verdict.title}</p>
            <p className="text-sm">{verdict.detail}</p>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <Row
              label={`Déblocable ${simulation.monthIndex === 0 ? 'aujourd’hui' : `en ${formatMonth(simulation.month)}`}`}
              before={formatEuros(simulation.availableBefore)}
              after={formatEuros(simulation.availableAfter)}
            />
            <Row
              label="Dépensable"
              before={formatEuros(simulation.spendableBefore)}
              after={formatEuros(simulation.spendableAfter)}
            />
            {simulation.budget && (
              <Row
                label={`Poste ${simulation.budget.name}`}
                before={formatEuros(simulation.budget.before)}
                after={formatEuros(simulation.budget.after)}
              />
            )}
            {simulation.safety && level && (
              <Row
                label="Marge de sécurité"
                before={formatEuros(simulation.availableBefore - simulation.threshold)}
                after={formatEuros(simulation.safety.margin)}
              />
            )}
          </dl>
          {level && (
            <p className="flex items-center gap-2 text-sm">
              <span className={`size-3 shrink-0 rounded-full ${level.dot}`} aria-hidden="true" />
              La bannière du tableau de bord serait {level.label} après cette dépense.
            </p>
          )}
          {simulation.monthIndex > 0 && (
            <p className="text-xs opacity-75">
              Projection en {formatMonth(simulation.month)} sans autre dépense d’ici là.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          Saisissez un montant pour voir l’effet sur votre déblocable, votre épargne de sécurité et vos postes.
        </p>
      )}
    </Card>
  );
}
