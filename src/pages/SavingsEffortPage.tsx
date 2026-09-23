import { PageHeader } from '../components/common/PageHeader';
import { EffortSynthesisCard } from '../components/savingsEffort/EffortSynthesisCard';
import { IncomeSourcesCard } from '../components/savingsEffort/IncomeSourcesCard';
import { RecalibrationCard } from '../components/savingsEffort/RecalibrationCard';
import { useFinancial } from '../context/FinancialContext';
import { useSavingsEffort } from '../hooks/useSavingsEffort';

export function SavingsEffortPage() {
  const { loans, movements } = useFinancial();
  const { settings, report, save, clear } = useSavingsEffort();

  return (
    <>
      <PageHeader title="Effort d’épargne" />
      <div className="space-y-4">
        <IncomeSourcesCard settings={settings} loans={loans} movements={movements} onSave={save} onClear={clear} />

        {report && (
          <>
            <EffortSynthesisCard capacity={report.capacity} windows={report.windows} />
            {report.recalibration && (
              <RecalibrationCard
                suggestion={report.recalibration}
                onApply={(ratePercent) =>
                  save({ incomeSources: settings?.incomeSources ?? [], targetRatePercent: ratePercent })
                }
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
