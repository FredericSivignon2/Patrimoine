import { useState, type FormEvent } from 'react';
import {
  LOAN_KINDS,
  LOAN_KIND_LABELS,
  MAX_LOAN_MONTHS,
  PREPAYMENT_EFFECTS,
  PREPAYMENT_EFFECT_LABELS,
  type Loan,
  type LoanKind,
  type LoanPrepayment,
  type NewLoan,
  type PrepaymentEffect,
} from '../../domain/models/Loan';
import type { Bank } from '../../domain/models/Bank';
import { centsToInputString, parseAmountToCents, parsePercent, sumCents } from '../../domain/services/FinancialMath';
import { buildAmortization, measurePrepayments, paymentForTerm, type Amortization } from '../../domain/services/LoanEngine';
import { addMonthsToDate, isValidIsoDate, monthKeyOfIso, toIsoDate } from '../../domain/services/Months';
import { BankSelect } from '../banks/BankSelect';
import { Button } from '../common/Button';
import { errorMessage } from '../common/errorMessage';
import { DeleteButton, Field, FormError, SuffixInput, inputClass } from '../common/fields';
import { formatCount, formatEuros, formatMonth } from '../common/format';
import { PlusIcon, XIcon } from '../common/icons';

interface PrepaymentRow {
  key: number;
  amount: string;
  date: string;
  effect: PrepaymentEffect;
}

let rowKeySeed = 0;
const newRow = (amount = '', date = '', effect: PrepaymentEffect = 'DURATION'): PrepaymentRow => ({
  key: ++rowKeySeed,
  amount,
  date,
  effect,
});

/** Lignes saisies → remboursements anticipés ; une ligne entièrement vide est ignorée, une ligne incomplète est une erreur. */
function readPrepayments(rows: readonly PrepaymentRow[]): { prepayments: LoanPrepayment[]; error: string | null } {
  const prepayments: LoanPrepayment[] = [];
  for (const [index, row] of rows.entries()) {
    if (row.amount.trim() === '' && row.date === '') continue;
    const amount = parseAmountToCents(row.amount);
    if (amount === null || amount <= 0 || !isValidIsoDate(row.date)) {
      return { prepayments, error: `Remboursement anticipé ${index + 1} : saisissez un montant positif et une date.` };
    }
    prepayments.push({ date: row.date, amount, effect: row.effect });
  }
  return { prepayments, error: null };
}

const isKind = (value: string): value is LoanKind => LOAN_KINDS.some((kind) => kind === value);
const isEffect = (value: string): value is PrepaymentEffect => PREPAYMENT_EFFECTS.some((effect) => effect === value);

const endMonth = (schedule: Amortization): string => formatMonth(monthKeyOfIso(schedule.rows[schedule.rows.length - 1].date));
const totalInterest = (schedule: Amortization): number => sumCents(schedule.rows.map((row) => row.interest));

interface LoanFormProps {
  loan?: Loan;
  banks: readonly Bank[];
  onSubmit: (input: NewLoan) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onCancel: () => void;
}

export function LoanForm({ loan, banks, onSubmit, onDelete, onCancel }: LoanFormProps) {
  const [name, setName] = useState(loan?.name ?? '');
  const [kind, setKind] = useState<LoanKind>(loan?.kind ?? 'MORTGAGE');
  const [bankId, setBankId] = useState(loan?.bankId ?? '');
  const [principalText, setPrincipalText] = useState(loan ? centsToInputString(loan.principal) : '');
  const [firstPaymentDate, setFirstPaymentDate] = useState(
    loan?.firstPaymentDate ?? addMonthsToDate(toIsoDate(new Date()), 1),
  );
  const [rateText, setRateText] = useState(loan ? String(loan.annualRate).replace('.', ',') : '');
  const [paymentText, setPaymentText] = useState(loan ? centsToInputString(loan.monthlyPayment) : '');
  const [insuranceText, setInsuranceText] = useState(
    loan?.monthlyInsurance ? centsToInputString(loan.monthlyInsurance) : '',
  );
  const [termText, setTermText] = useState('');
  const [prepaymentRows, setPrepaymentRows] = useState<PrepaymentRow[]>(() =>
    (loan?.prepayments ?? []).map((prepayment) => newRow(centsToInputString(prepayment.amount), prepayment.date, prepayment.effect)),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const principal = parseAmountToCents(principalText);
  const rate = parsePercent(rateText);
  const payment = parseAmountToCents(paymentText);
  const insurance = insuranceText.trim() === '' ? 0 : parseAmountToCents(insuranceText);
  const { prepayments, error: prepaymentsError } = readPrepayments(prepaymentRows);

  const terms =
    principal !== null && principal > 0 && rate !== null && payment !== null && payment > 0 && isValidIsoDate(firstPaymentDate)
      ? { principal, annualRate: rate, monthlyPayment: payment, firstPaymentDate }
      : undefined;
  const schedule = terms && buildAmortization({ ...terms, prepayments: prepaymentsError === null ? prepayments : undefined });
  // Le même prêt sans remboursement anticipé, pour mesurer ce qu'ils changent.
  const baseline = terms && prepayments.length > 0 && prepaymentsError === null ? buildAmortization(terms) : undefined;
  const impact = schedule && baseline && measurePrepayments(schedule, baseline, '');

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

  const updateRow = (key: number, patch: Partial<Omit<PrepaymentRow, 'key'>>): void =>
    setPrepaymentRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const computePayment = (): void => {
    const months = Number(termText.trim());
    const computed =
      principal !== null && principal > 0 && rate !== null && /^\d+$/.test(termText.trim())
        ? paymentForTerm(principal, rate, months)
        : null;
    if (computed === null) {
      setError(`Pour calculer la mensualité, renseignez le capital, le taux et une durée entre 1 et ${MAX_LOAN_MONTHS} mois.`);
      return;
    }
    setError(null);
    setPaymentText(centsToInputString(computed));
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (principal === null || principal <= 0) {
      setError('Capital restant dû invalide (ex. 95 000).');
      return;
    }
    if (rate === null) {
      setError('Taux invalide (ex. 1,45 ; saisissez 0 pour un prêt à taux zéro).');
      return;
    }
    if (payment === null || payment <= 0) {
      setError('Mensualité invalide (ex. 690).');
      return;
    }
    if (insurance === null || insurance < 0) {
      setError('Assurance mensuelle invalide (ex. 28).');
      return;
    }
    if (prepaymentsError !== null) {
      setError(prepaymentsError);
      return;
    }
    void run(() =>
      onSubmit({
        name,
        kind,
        principal,
        annualRate: rate,
        monthlyPayment: payment,
        monthlyInsurance: insurance > 0 ? insurance : undefined,
        firstPaymentDate,
        prepayments,
        bankId: bankId || undefined,
      }),
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <Field label="Nom du prêt">
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Prêt immobilier, éco-PTZ, prêt conso travaux…"
          maxLength={80}
          required
          autoFocus
        />
      </Field>
      <Field label="Type de prêt">
        <select
          className={inputClass}
          value={kind}
          onChange={(event) => {
            if (isKind(event.target.value)) setKind(event.target.value);
          }}
        >
          {LOAN_KINDS.map((option) => (
            <option key={option} value={option}>
              {LOAN_KIND_LABELS[option]}
            </option>
          ))}
        </select>
      </Field>
      <BankSelect banks={banks} value={bankId} onChange={setBankId} label="Banque prêteuse (optionnel)" />

      <Field
        label="Capital restant dû"
        hint="Avant la prochaine échéance, d’après votre dernier relevé. Pour un prêt qui n’a pas encore commencé (différé), le montant emprunté."
      >
        <SuffixInput suffix="€" value={principalText} onChange={(event) => setPrincipalText(event.target.value)} placeholder="95 000" />
      </Field>
      <Field
        label="Prochaine échéance"
        hint="Date de la prochaine mensualité. Si elle est passée, les échéances écoulées sont considérées comme payées."
      >
        <input
          type="date"
          className={inputClass}
          value={firstPaymentDate}
          onChange={(event) => setFirstPaymentDate(event.target.value)}
          required
        />
      </Field>
      <Field label="Taux annuel" hint="0 pour un prêt à taux zéro (PTZ, éco-PTZ).">
        <SuffixInput suffix="%" value={rateText} onChange={(event) => setRateText(event.target.value)} placeholder="1,45" />
      </Field>

      <div className="space-y-2">
        <Field label="Mensualité (hors assurance)">
          <SuffixInput suffix="€" value={paymentText} onChange={(event) => setPaymentText(event.target.value)} placeholder="690" />
        </Field>
        <div className="flex items-end gap-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
          <div className="min-w-0 flex-1">
            <Field label="Durée restante (mois)">
              <SuffixInput
                suffix="mois"
                inputMode="numeric"
                value={termText}
                onChange={(event) => setTermText(event.target.value)}
                placeholder="180"
              />
            </Field>
          </div>
          <Button variant="secondary" onClick={computePayment} className="shrink-0">
            Calculer la mensualité
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Vous ne connaissez pas la mensualité ? Indiquez la durée restante pour la calculer.
        </p>
      </div>

      <Field
        label="Assurance mensuelle (optionnel)"
        hint="Assurance emprunteur payée avec chaque mensualité, en plus de celle saisie ci-dessus. Laissez vide si elle est déjà incluse dans la mensualité."
      >
        <SuffixInput suffix="€" value={insuranceText} onChange={(event) => setInsuranceText(event.target.value)} placeholder="28" />
      </Field>

      <section className="space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200" aria-label="Remboursements anticipés">
        <h3 className="text-sm font-semibold text-slate-800">Remboursements anticipés</h3>
        <p className="text-xs text-slate-500">
          Prévus, ou faits depuis votre dernier relevé (ceux déjà déduits du capital restant dû ne sont pas à saisir).
          Le remboursement est imputé à l’échéance qui suit sa date.
        </p>
        {prepaymentRows.map((row, index) => (
          <fieldset key={row.key} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <legend className="sr-only">Remboursement anticipé {index + 1}</legend>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Remboursement anticipé {index + 1}</span>
              <button
                type="button"
                aria-label={`Retirer le remboursement anticipé ${index + 1}`}
                onClick={() => setPrepaymentRows((rows) => rows.filter((other) => other.key !== row.key))}
                className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <XIcon className="size-4" />
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Montant remboursé">
                  <SuffixInput
                    suffix="€"
                    value={row.amount}
                    onChange={(event) => updateRow(row.key, { amount: event.target.value })}
                    placeholder="3 000"
                  />
                </Field>
                <Field label="Remboursé le">
                  <input
                    type="date"
                    className={inputClass}
                    value={row.date}
                    onChange={(event) => updateRow(row.key, { date: event.target.value })}
                  />
                </Field>
              </div>
              <Field label="Effet du remboursement">
                <select
                  className={inputClass}
                  value={row.effect}
                  onChange={(event) => {
                    if (isEffect(event.target.value)) updateRow(row.key, { effect: event.target.value });
                  }}
                >
                  {PREPAYMENT_EFFECTS.map((option) => (
                    <option key={option} value={option}>
                      {PREPAYMENT_EFFECT_LABELS[option]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>
        ))}
        <Button variant="secondary" className="w-full" onClick={() => setPrepaymentRows((rows) => [...rows, newRow()])}>
          <PlusIcon className="size-4" />
          Ajouter un remboursement anticipé
        </Button>
        <p className="text-xs text-slate-500">
          Réduire la durée : la mensualité reste, le prêt se termine plus tôt. Réduire la mensualité : la date de fin
          est conservée. Ce montant n’est pas déduit de vos comptes : enregistrez le retrait correspondant, sur le
          compte qui le finance.
        </p>
      </section>

      {schedule && (
        <div role="status" className="space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
          {schedule.complete ? (
            <>
              <p className="font-medium text-slate-900">
                {formatCount(schedule.rows.length, 'échéance')}, fin en {endMonth(schedule)}.
              </p>
              <p>
                Intérêts : {formatEuros(totalInterest(schedule))} · coût total restant (assurance et remboursements
                anticipés compris) :{' '}
                {formatEuros(sumCents(schedule.rows.map((row) => row.payment + row.prepayment + (insurance ?? 0))))}.
              </p>
              {baseline && impact && (
                <>
                  <p>
                    Sans remboursement anticipé : {formatCount(baseline.rows.length, 'échéance')}, fin en{' '}
                    {endMonth(baseline)}, intérêts {formatEuros(totalInterest(baseline))}.
                  </p>
                  <p className="font-medium text-emerald-700">
                    Vous économisez {formatEuros(impact.interestSaved)} d’intérêts
                    {impact.installmentsSaved > 0 && ` et ${formatCount(impact.installmentsSaved, 'échéance')}`}
                    {impact.reducedPayment !== undefined && ` ; mensualité ramenée à ${formatEuros(impact.reducedPayment)}`}.
                  </p>
                </>
              )}
              {schedule.ignoredPrepayments > 0 && (
                <p className="text-amber-700">
                  {schedule.ignoredPrepayments > 1
                    ? `${schedule.ignoredPrepayments} remboursements anticipés datés d’après la fin du prêt ne sont pas pris en compte.`
                    : 'Un remboursement anticipé daté d’après la fin du prêt n’est pas pris en compte.'}
                </p>
              )}
            </>
          ) : (
            <p className="text-rose-700">
              {schedule.rows.length >= MAX_LOAN_MONTHS
                ? `Ce prêt durerait plus de ${MAX_LOAN_MONTHS / 12} ans : vérifiez la mensualité.`
                : 'La mensualité ne couvre pas les intérêts : le prêt ne serait jamais remboursé.'}
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Les mensualités sont calculées d’après l’échéancier : inutile de les saisir comme mouvements.
      </p>
      <FormError message={error} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" disabled={busy}>
          Enregistrer
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
      {loan && onDelete && (
        <div className="border-t border-slate-200 pt-4">
          <DeleteButton label="Supprimer le prêt" disabled={busy} onConfirm={() => void run(onDelete)} />
        </div>
      )}
    </form>
  );
}
