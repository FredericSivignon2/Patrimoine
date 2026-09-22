const STOPWORDS = new Set(['la', 'le', 'les', 'l', 'd', 'de', 'des', 'du', 'et']);

/** Initiales affichées dans le badge : 2-3 lettres à partir du nom, en ignorant les articles. */
export function bankInitials(name: string): string {
  const words = name
    .split(/[\s’']+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const significant = words.filter((word) => !STOPWORDS.has(word.toLocaleLowerCase('fr-FR')));
  const chosen = significant.length > 0 ? significant : words;
  if (chosen.length === 0) return '?';
  if (chosen.length === 1) {
    const [word] = chosen;
    return (word.length <= 4 ? word : word.slice(0, 3)).toLocaleUpperCase('fr-FR');
  }
  return chosen
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toLocaleUpperCase('fr-FR');
}

/** Palette fixe, choisie par un hash du nom : couleur stable, sans dépendre de logos de marque. */
const PALETTE: readonly string[] = [
  'bg-teal-100 text-teal-800',
  'bg-sky-100 text-sky-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-amber-100 text-amber-800',
  'bg-emerald-100 text-emerald-800',
  'bg-indigo-100 text-indigo-800',
  'bg-fuchsia-100 text-fuchsia-800',
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

export function bankColorClass(name: string): string {
  return PALETTE[hashString(name) % PALETTE.length];
}

/** Pastille d'initiales colorée représentant une banque, sans logo de marque. */
export function BankBadge({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${bankColorClass(name)} ${className}`}
    >
      {bankInitials(name)}
    </span>
  );
}
