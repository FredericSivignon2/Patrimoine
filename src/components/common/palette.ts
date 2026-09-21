export const PALETTE = ['#0f766e', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#22c55e', '#f97316', '#64748b'];
export const POSITIVE_COLOR = '#10b981';
export const NEGATIVE_COLOR = '#f43f5e';

/** Couleur d'une série d'après sa position (les couleurs se répètent au-delà de la palette). */
export const paletteColor = (index: number): string => PALETTE[index % PALETTE.length];
