import type { UnlockEvent } from '../../domain/models/Projection';
import { Card } from '../common/Card';
import { formatMonth, formatSignedEuros } from '../common/format';

const VISIBLE_EVENTS = 6;

interface UnlockScheduleCardProps {
  events: UnlockEvent[];
  accountNames: ReadonlyMap<string, string>;
}

export function UnlockScheduleCard({ events, accountNames }: UnlockScheduleCardProps) {
  const visible = events.slice(0, VISIBLE_EVENTS);
  return (
    <Card title="Prochains déblocages">
      <ul className="divide-y divide-slate-100">
        {visible.map((event) => (
          <li key={`${event.accountId}-${event.month}`} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium capitalize text-slate-900">{formatMonth(event.month)}</span>
              <span className="block truncate text-xs text-slate-500">
                {accountNames.get(event.accountId) ?? 'Compte supprimé'}
              </span>
            </span>
            <span className="font-semibold tabular-nums text-emerald-700">{formatSignedEuros(event.amount)}</span>
          </li>
        ))}
      </ul>
      {events.length > visible.length && (
        <p className="mt-2 text-xs text-slate-500">
          + {events.length - visible.length} autre{events.length - visible.length > 1 ? 's' : ''} échéance
          {events.length - visible.length > 1 ? 's' : ''}
        </p>
      )}
    </Card>
  );
}
