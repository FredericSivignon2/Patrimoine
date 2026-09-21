import { useMemo } from 'react';
import { useFinancial } from '../context/FinancialContext';
import { unlockSchedule } from '../domain/services/LockEngine';
import { addMonths, monthKeyOfDate } from '../domain/services/Months';
import { monthlyNetSeries, projectPortfolio } from '../domain/services/ProjectionEngine';

const HISTORY_MONTHS = 12;

/**
 * Projection du patrimoine (1, 2, 3, 5 ans, avec la part bloquée), calendrier des prochains déblocages et
 * épargne nette des 12 derniers mois, tous comptes confondus.
 */
export function useProjections() {
  const { accounts, movements } = useFinancial();

  return useMemo(() => {
    const now = new Date();
    const currentMonth = monthKeyOfDate(now);
    const projection = projectPortfolio(accounts, movements, now);
    return {
      projection,
      hasLockedFunds: projection.points.some((point) => point.locked > 0),
      unlocks: unlockSchedule(accounts, movements, now),
      history: monthlyNetSeries(movements, addMonths(currentMonth, -(HISTORY_MONTHS - 1)), currentMonth),
    };
  }, [accounts, movements]);
}
