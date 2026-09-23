import { Navigate, Route, Routes } from 'react-router-dom';
import { Button } from './components/common/Button';
import { AppLayout } from './components/layout/AppLayout';
import { useFinancial } from './context/FinancialContext';
import { AccountsPage } from './pages/AccountsPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoansPage } from './pages/LoansPage';
import { MovementsPage } from './pages/MovementsPage';
import { SavingsEffortPage } from './pages/SavingsEffortPage';

export function App() {
  const { status, error } = useFinancial();

  if (status === 'loading') {
    return <p className="grid min-h-dvh place-items-center text-sm text-slate-500">Chargement de vos données…</p>;
  }

  if (status === 'error') {
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
        <div className="space-y-3 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <h1 className="text-lg font-semibold text-slate-900">Impossible de lire vos données</h1>
          <p className="text-sm text-slate-600">{error}</p>
          <Button onClick={() => window.location.reload()}>Réessayer</Button>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="postes" element={<BudgetsPage />} />
        <Route path="prets" element={<LoansPage />} />
        <Route path="comptes" element={<AccountsPage />} />
        <Route path="mouvements" element={<MovementsPage />} />
        <Route path="effort" element={<SavingsEffortPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
