import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, action, className = '', children }: CardProps) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
