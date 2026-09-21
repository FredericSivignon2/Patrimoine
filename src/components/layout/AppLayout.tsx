import type { ComponentType } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ArrowsIcon, BankIcon, HomeIcon, PieIcon, WalletIcon } from '../common/icons';
import { SyncStatusChip } from './SyncStatusChip';

interface NavItem {
  to: string;
  label: string;
  /** Libellé court de la barre mobile, quand le libellé complet est trop long pour cinq onglets. */
  mobileLabel?: string;
  end?: boolean;
  icon: ComponentType<{ className?: string }>;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Tableau de bord', mobileLabel: 'Accueil', end: true, icon: HomeIcon },
  { to: '/postes', label: 'Postes', icon: PieIcon },
  { to: '/prets', label: 'Prêts', icon: BankIcon },
  { to: '/comptes', label: 'Comptes', icon: WalletIcon },
  { to: '/mouvements', label: 'Mouvements', icon: ArrowsIcon },
];

export function AppLayout() {
  return (
    <div className="min-h-dvh pb-24 md:pb-10">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <NavLink to="/" className="flex items-center gap-2 text-base font-bold text-teal-800">
            <span className="grid size-8 place-items-center rounded-lg bg-teal-700 text-white">
              <HomeIcon className="size-5" />
            </span>
            Patrimoine
          </NavLink>
          <nav aria-label="Navigation principale" className="ml-4 hidden gap-1 md:flex">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <SyncStatusChip />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        <Outlet />
      </main>

      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV_ITEMS.map(({ to, label, mobileLabel, end, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${isActive ? 'text-teal-700' : 'text-slate-500'}`
                }
              >
                <Icon className="size-6" />
                {mobileLabel ?? label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
