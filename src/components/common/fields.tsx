import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Button } from './Button';

export const inputClass =
  'mt-1 block min-h-11 w-full rounded-xl border-0 bg-white px-3 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-600';

/** Libellé enveloppant : associe implicitement le texte au champ qu'il contient. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

interface SuffixInputProps extends InputHTMLAttributes<HTMLInputElement> {
  suffix: string;
}

/** Champ de saisie décimale avec unité (« € », « % »). */
export function SuffixInput({ suffix, className = '', ...props }: SuffixInputProps) {
  return (
    <span className="relative block">
      <input type="text" inputMode="decimal" autoComplete="off" className={`${inputClass} pr-9 ${className}`} {...props} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 mt-1 flex items-center text-slate-500">
        {suffix}
      </span>
    </span>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Nom accessible quand le libellé affiché est abrégé (« Auj. » pour « Aujourd'hui »). */
  ariaLabel?: string;
  /** Classes appliquées à l'option sélectionnée (couleur du texte). */
  activeClass?: string;
}

interface SegmentedProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}

/** Choix exclusif présenté comme un interrupteur à segments. */
export function Segmented<T extends string>({ legend, name, value, options, onChange }: SegmentedProps<T>) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">{legend}</legend>
      <div className="mt-1 grid grid-flow-col auto-cols-fr gap-1 rounded-xl bg-slate-100 p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-semibold text-slate-600 has-checked:bg-white has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-teal-600 ${option.activeClass ?? 'has-checked:text-slate-900'}`}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={option.value}
              aria-label={option.ariaLabel}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface DeleteButtonProps {
  label?: string;
  onConfirm: () => void;
  disabled?: boolean;
}

/** Suppression en deux temps : un premier appui arme le bouton, le second confirme. */
export function DeleteButton({ label = 'Supprimer', onConfirm, disabled }: DeleteButtonProps) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      variant={armed ? 'danger' : 'dangerOutline'}
      disabled={disabled}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      {armed ? 'Confirmer la suppression' : label}
    </Button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
      {message}
    </p>
  );
}
