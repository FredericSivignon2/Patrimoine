import { useLoans } from '../../hooks/useLoans';
import { useSafetySettings } from '../../hooks/useSafety';
import { Modal } from '../common/Modal';
import { SafetyForm } from './SafetyForm';

/** Fenêtre de réglage de l'épargne de sécurité, utilisable depuis n'importe quelle page. */
export function SafetyDialog({ onClose }: { onClose: () => void }) {
  const { settings, save, clear } = useSafetySettings();
  const { totals } = useLoans();

  return (
    <Modal title="Épargne de sécurité" onClose={onClose}>
      <SafetyForm
        settings={settings}
        monthlyCredits={totals.monthlyPayments}
        onCancel={onClose}
        onSubmit={async (next) => {
          await save(next);
          onClose();
        }}
        onClear={
          settings
            ? async () => {
                await clear();
                onClose();
              }
            : undefined
        }
      />
    </Modal>
  );
}
