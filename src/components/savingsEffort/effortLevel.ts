import type { EffortLevel } from '../../domain/services/SavingsEffortEngine';

/** Libellé court par niveau, pour la synthèse et les badges. */
export const EFFORT_LEVEL_LABELS: Record<EffortLevel, string> = {
  ok: 'Objectif tenu',
  warning: 'Presque',
  alert: 'En dessous',
  critical: 'Loin du compte',
};

/** Classes de fond + texte par niveau, mêmes teintes que la bannière de sécurité (vert/jaune/orange/rouge). */
export const EFFORT_LEVEL_TONE: Record<EffortLevel, string> = {
  ok: 'bg-teal-50 text-teal-800 ring-teal-100',
  warning: 'bg-amber-50 text-amber-900 ring-amber-100',
  alert: 'bg-orange-50 text-orange-900 ring-orange-100',
  critical: 'bg-rose-50 text-rose-900 ring-rose-100',
};

/** Pastille de couleur seule (sans fond), pour un point dans une liste. */
export const EFFORT_LEVEL_DOT: Record<EffortLevel, string> = {
  ok: 'bg-teal-600',
  warning: 'bg-amber-500',
  alert: 'bg-orange-500',
  critical: 'bg-rose-600',
};

const PHRASES: Record<EffortLevel, readonly string[]> = {
  ok: ['Épargne au top, continuez comme ça !', 'Objectif tenu, bravo !', 'Vous creusez l’écart, bien joué.'],
  warning: ['Presque parfait, un petit effort de plus.', 'On y est presque !', 'Un léger coup de collier et c’est gagné.'],
  alert: ['Attention, les dépenses piquent un peu en ce moment.', 'Le rythme ralentit, tout va bien ?', 'Ça se resserre, à surveiller.'],
  critical: ['Aïe, l’épargne a calé récemment.', 'Rien de grave, mais il va falloir se rattraper.', 'Trimestre compliqué : on se relance ?'],
};

/** Phrase « amusante » associée au niveau ; varie doucement d'un jour à l'autre sans changer en cours de session. */
export function effortPhrase(level: EffortLevel, referenceDate: Date = new Date()): string {
  const options = PHRASES[level];
  return options[referenceDate.getDate() % options.length];
}
