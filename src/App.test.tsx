import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { FinancialProvider } from './context/FinancialContext';
import { formatEuros, formatWholeEuros } from './components/common/format';
import type { Budget } from './domain/models/Budget';
import { DATA_VERSION, type PatrimoineData } from './domain/models/PatrimoineData';
import type { SafetySettings } from './domain/models/Safety';
import { budgetAmount, minimumBasisPoints } from './domain/services/BudgetEngine';
import type { Loan } from './domain/models/Loan';
import type { Movement } from './domain/models/Movement';
import { addMonths, lastDayOfMonth, monthKeyOfDate } from './domain/services/Months';
import { projectPortfolio } from './domain/services/ProjectionEngine';
import { MockStorageDriver } from './infrastructure/storage/MockStorageDriver';

// jsdom n'implémente pas <canvas> : les graphiques sont testés visuellement, pas ici.
vi.mock('react-chartjs-2', () => ({ Line: () => null, Doughnut: () => null, Bar: () => null }));

/** Regex tolérante aux espaces insécables produits par Intl (« 1 000,00 € »). */
const euros = (text: string): RegExp => new RegExp(text.replace(/ /g, '[\\s\\u00a0\\u202f]').replace(/\+/g, '\\+'));
/** Texte exact d'un montant, insensible aux espaces insécables (évite « 0,00 € » dans « 10 000,00 € »). */
const normalizeSpaces = (text: string): string => text.replace(/[\s  ]+/g, ' ');
const exactEuros = (text: string) => (content: string) => normalizeSpaces(content) === normalizeSpaces(text);

const seeded = (): PatrimoineData => ({
  version: DATA_VERSION,
  accounts: [
    { id: 'a1', name: 'Compte courant', type: 'CHECKING', initialBalance: 100_000 },
    { id: 'a2', name: 'Livret A', type: 'SAVINGS', initialBalance: 0, interestRate: 3 },
  ],
  movements: [
    { id: 'm1', accountId: 'a1', type: 'DEPOSIT', amount: 200_000, date: '2026-03-02', note: 'Salaire' },
    { id: 'm2', accountId: 'a2', type: 'DEPOSIT', amount: 5_000, date: '2026-03-05', note: 'Épargne de mars' },
    { id: 'm3', accountId: 'a1', type: 'WITHDRAWAL', amount: 4_550, date: '2026-04-01', note: 'Courses' },
  ],
  budgets: [],
  loans: [],
  banks: [],
  properties: [],
});

async function renderApp(path = '/', initial: PatrimoineData | null = null) {
  const storage = new MockStorageDriver(initial);
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider session={null}>
        <FinancialProvider storage={storage}>
          <App />
        </FinancialProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('navigation', { name: 'Navigation mobile' });
  return { storage, user };
}

const mobileNav = () => within(screen.getByRole('navigation', { name: 'Navigation mobile' }));

describe('Application', () => {
  it('permet de créer un compte, d’y saisir un versement et d’en voir l’effet sur le tableau de bord', async () => {
    const { storage, user } = await renderApp('/comptes');

    await user.click(screen.getByRole('button', { name: /nouveau compte/i }));
    const accountDialog = await screen.findByRole('dialog', { name: /nouveau compte/i });
    await user.type(within(accountDialog).getByLabelText(/nom du compte/i), 'Livret A');
    await user.click(within(accountDialog).getByLabelText('Épargne'));
    await user.type(within(accountDialog).getByLabelText(/solde initial/i), '1000');
    await user.type(within(accountDialog).getByLabelText(/taux annuel/i), '3');
    await user.click(within(accountDialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Livret A')).toBeInTheDocument();
    expect(screen.getByText(euros('1 000,00 €'))).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(storage.stored?.accounts).toEqual([
      expect.objectContaining({ name: 'Livret A', type: 'SAVINGS', initialBalance: 100_000, interestRate: 3 }),
    ]);

    await user.click(mobileNav().getByRole('link', { name: /mouvements/i }));
    await user.click(await screen.findByRole('button', { name: /nouveau mouvement/i }));
    const movementDialog = await screen.findByRole('dialog', { name: /nouveau mouvement/i });
    await user.type(within(movementDialog).getByLabelText(/montant/i), '250,50');
    await user.type(within(movementDialog).getByLabelText(/note/i), 'Prime');
    await user.click(within(movementDialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Prime')).toBeInTheDocument();
    expect(screen.getAllByText(euros('+250,50 €')).length).toBeGreaterThan(0);
    expect(storage.stored?.movements).toEqual([
      expect.objectContaining({ type: 'DEPOSIT', amount: 25_050, note: 'Prime' }),
    ]);

    await user.click(mobileNav().getByRole('link', { name: /accueil/i }));
    expect(await screen.findByText('Patrimoine total')).toBeInTheDocument();
    expect(screen.getAllByText(euros('1 250,50 €')).length).toBeGreaterThan(0);
  });

  it('refuse un montant invalide sans fermer le formulaire', async () => {
    const { storage, user } = await renderApp('/mouvements', seeded());

    await user.click(screen.getByRole('button', { name: /nouveau mouvement/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau mouvement/i });
    await user.type(within(dialog).getByLabelText(/montant/i), 'abc');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/montant invalide/i);
    expect(storage.saveCount).toBe(0);
    expect(screen.getByRole('dialog', { name: /nouveau mouvement/i })).toBeInTheDocument();
  });

  it('affiche les mouvements par mois et les filtre par compte', async () => {
    const { user } = await renderApp('/mouvements', seeded());

    expect(screen.getByText('Salaire')).toBeInTheDocument();
    expect(screen.getByText('Épargne de mars')).toBeInTheDocument();
    expect(screen.getByText('Courses')).toBeInTheDocument();
    // avril ne contient qu'un retrait : le montant apparaît sur la ligne et dans le sous-total du mois
    const april = within(screen.getByRole('region', { name: /avril 2026/i }));
    expect(april.getAllByText(euros('-45,50 €'))).toHaveLength(2);
    // mars : +2 000,00 € et +50,00 € => sous-total +2 050,00 €
    const march = within(screen.getByRole('region', { name: /mars 2026/i }));
    expect(march.getByText(euros('+2 050,00 €'))).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrer par compte'), 'Livret A');

    expect(screen.queryByText('Salaire')).not.toBeInTheDocument();
    expect(screen.getByText('Épargne de mars')).toBeInTheDocument();
  });

  it('modifie un mouvement existant', async () => {
    const { storage, user } = await renderApp('/mouvements', seeded());

    await user.click(screen.getByRole('button', { name: /courses/i }));
    const dialog = await screen.findByRole('dialog', { name: /modifier le mouvement/i });
    const amount = within(dialog).getByLabelText(/montant/i);
    expect(amount).toHaveValue('45,50');
    await user.clear(amount);
    await user.type(amount, '60');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findAllByText(euros('-60,00 €'))).toHaveLength(2);
    expect(storage.stored?.movements.find((movement) => movement.id === 'm3')?.amount).toBe(6_000);
  });

  it('supprime un compte avec ses mouvements après confirmation', async () => {
    const { storage, user } = await renderApp('/comptes', seeded());

    await user.click(screen.getByRole('button', { name: /livret a/i }));
    const dialog = await screen.findByRole('dialog', { name: /modifier le compte/i });
    expect(within(dialog).getByText(/supprime aussi son mouvement/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Supprimer le compte' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la suppression' }));

    expect(screen.queryByRole('button', { name: /livret a/i })).not.toBeInTheDocument();
    expect(storage.stored?.accounts.map((account) => account.id)).toEqual(['a1']);
    expect(storage.stored?.movements.map((movement) => movement.id)).toEqual(['m1', 'm3']);
  });

  it('propose des données de démonstration sur un tableau de bord vide', async () => {
    const { storage, user } = await renderApp('/');

    expect(screen.getByText('Bienvenue dans Patrimoine')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /données de démonstration/i }));

    expect(await screen.findByText('Patrimoine total')).toBeInTheDocument();
    expect(screen.getAllByText('Assurance vie').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Projections' })).toBeInTheDocument();
    expect(storage.stored?.accounts).toHaveLength(4);
    expect(storage.stored?.budgets).toHaveLength(3);
    // la démonstration inclut un PEE aux fonds bloqués et un seuil de sécurité confortable
    expect(screen.getByRole('region', { name: 'Patrimoine' })).toHaveAttribute('data-safety-level', 'ok');
    expect(screen.getByRole('heading', { name: 'Prochains déblocages' })).toBeInTheDocument();
    // ... ainsi que des postes de dépense répartissant le dépensable
    const spendable = within(screen.getByRole('heading', { name: 'Ce que vous pouvez dépenser' }).closest('section') as HTMLElement);
    expect(spendable.getByText('Vacances')).toBeInTheDocument();
    expect(spendable.getByText('Future voiture')).toBeInTheDocument();
    // ... dont un objectif que le pourcentage choisi n'atteint pas à l'échéance
    expect(spendable.getByText(/1 objectif n’est pas atteint à son échéance/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Et si je dépense… ?' })).toBeInTheDocument();
  });

  it('indique le mode local et explique la configuration Google Drive', async () => {
    const { user } = await renderApp('/');

    await user.click(screen.getByRole('button', { name: /synchronisation : mode local/i }));
    const dialog = await screen.findByRole('dialog', { name: /google drive/i });
    expect(within(dialog).getByText(/VITE_GOOGLE_CLIENT_ID/)).toBeInTheDocument();
  });
});

describe('Épargne de sécurité', () => {
  // Patrimoine déblocable du jeu de test : 3 004,50 € (aucun fonds bloqué).
  it.each([
    { threshold: 1_000_000, comfortMargin: 500_000, level: 'critical', text: /sous le seuil de sécurité.*il manque 6 995,50/i },
    { threshold: 250_000, comfortMargin: 500_000, level: 'alert', text: /proche du seuil de sécurité/i },
    { threshold: 100_000, comfortMargin: 500_000, level: 'warning', text: /vigilance/i },
    { threshold: 100_000, comfortMargin: 100_000, level: 'ok', text: /confortable/i },
  ])('colore la bannière en $level (seuil $threshold c)', async ({ threshold, comfortMargin, level, text }) => {
    await renderApp('/', { ...seeded(), safety: { threshold, comfortMargin } });

    const banner = screen.getByRole('region', { name: 'Patrimoine' });
    expect(banner).toHaveAttribute('data-safety-level', level);
    expect(within(banner).getByRole('status')).toHaveTextContent(text);
  });

  it('invite à définir un seuil, puis alerte une fois le seuil enregistré', async () => {
    const { storage, user } = await renderApp('/', seeded());
    expect(screen.getByRole('region', { name: 'Patrimoine' })).toHaveAttribute('data-safety-level', 'none');

    await user.click(screen.getByRole('button', { name: /définir l’épargne de sécurité/i }));
    const dialog = await screen.findByRole('dialog', { name: /épargne de sécurité/i });
    expect(within(dialog).getByLabelText(/marge de confort/i)).toHaveValue('5000,00');
    await user.type(within(dialog).getByLabelText(/seuil de sécurité/i), '10000');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Patrimoine' })).toHaveAttribute('data-safety-level', 'critical');
    expect(storage.stored?.safety).toEqual({ threshold: 1_000_000, comfortMargin: 500_000 });
  });

  it('refuse un seuil invalide', async () => {
    const { storage, user } = await renderApp('/', seeded());

    await user.click(screen.getByRole('button', { name: /définir l’épargne de sécurité/i }));
    const dialog = await screen.findByRole('dialog', { name: /épargne de sécurité/i });
    await user.type(within(dialog).getByLabelText(/seuil de sécurité/i), 'beaucoup');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/seuil invalide/i);
    expect(storage.saveCount).toBe(0);
  });

  it('modifie puis supprime le seuil', async () => {
    const { storage, user } = await renderApp('/', { ...seeded(), safety: { threshold: 1_000_000, comfortMargin: 500_000 } });

    await user.click(screen.getByRole('button', { name: /modifier l’épargne de sécurité/i }));
    let dialog = await screen.findByRole('dialog', { name: /épargne de sécurité/i });
    const threshold = within(dialog).getByLabelText(/seuil de sécurité/i);
    expect(threshold).toHaveValue('10000,00');
    await user.clear(threshold);
    await user.type(threshold, '100');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    // marge de 2 904,50 € : moins que la marge de confort (5 000 €), donc jaune
    expect(screen.getByRole('region', { name: 'Patrimoine' })).toHaveAttribute('data-safety-level', 'warning');
    expect(storage.stored?.safety?.threshold).toBe(10_000);

    await user.click(screen.getByRole('button', { name: /modifier l’épargne de sécurité/i }));
    dialog = await screen.findByRole('dialog', { name: /épargne de sécurité/i });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer le seuil' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la suppression' }));

    expect(screen.getByRole('region', { name: 'Patrimoine' })).toHaveAttribute('data-safety-level', 'none');
    expect(storage.stored && 'safety' in storage.stored).toBe(false);
  });
});

describe('Postes de dépense', () => {
  // Patrimoine déblocable du jeu de test : 3 004,50 €. Avec un seuil de 1 000 €, le dépensable est de 2 004,50 €.
  const SAFETY: SafetySettings = { threshold: 100_000, comfortMargin: 500_000 };
  /** `safety: null` = aucun seuil défini (un `undefined` déclencherait la valeur par défaut). */
  const withBudgets = (budgets: Budget[], safety: SafetySettings | null = SAFETY): PatrimoineData => ({
    ...seeded(),
    budgets,
    ...(safety ? { safety } : {}),
  });
  const openNewBudget = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /nouveau poste/i }));
    return screen.findByRole('dialog', { name: /nouveau poste/i });
  };

  it('explique le dépensable et invite à créer un premier poste', async () => {
    await renderApp('/postes', withBudgets([]));

    const summary = within(screen.getByRole('region', { name: 'Dépensable' }));
    expect(summary.getByText(euros('2 004,50 €'))).toBeInTheDocument();
    expect(summary.getByText(/déblocable 3 004,50.*moins seuil de sécurité 1 000,00/i)).toBeInTheDocument();
    expect(screen.getByText('Aucun poste pour l’instant')).toBeInTheDocument();
  });

  it('crée un poste, montre l’aperçu du montant puis la répartition', async () => {
    const { storage, user } = await renderApp('/postes', withBudgets([]));

    const dialog = await openNewBudget(user);
    await user.click(within(dialog).getByRole('button', { name: 'Vacances' })); // suggestion de nom
    expect(within(dialog).getByLabelText(/nom du poste/i)).toHaveValue('Vacances');
    await user.type(within(dialog).getByLabelText(/part du dépensable/i), '30');
    expect(within(dialog).getByText(euros('Soit 601,35 € aujourd’hui'))).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    const list = within(await screen.findByRole('heading', { name: 'Répartition du dépensable' }).then((h) => h.closest('section') as HTMLElement));
    expect(list.getByText('Vacances')).toBeInTheDocument();
    expect(list.getByText(/30 % du dépensable/)).toBeInTheDocument();
    expect(list.getByText(euros('601,35 €'))).toBeInTheDocument();
    // le reste (70 % = 2 004,50 - 601,35) est non affecté
    expect(list.getByText(/70 % du dépensable/)).toBeInTheDocument();
    expect(list.getByText(euros('1 403,15 €'))).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /vacances 30 %, non affecté 70 %/i })).toBeInTheDocument();
    expect(storage.stored?.budgets).toEqual([expect.objectContaining({ name: 'Vacances', percent: 30 })]);
  });

  it('refuse un pourcentage supérieur à ce qui reste à répartir', async () => {
    const { storage, user } = await renderApp('/postes', withBudgets([{ id: 'b1', name: 'Travaux', percent: 80 }]));

    const dialog = await openNewBudget(user);
    await user.type(within(dialog).getByLabelText(/nom du poste/i), 'Voiture');
    await user.type(within(dialog).getByLabelText(/part du dépensable/i), '30');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/il ne reste que 20 % à répartir/i);
    expect(storage.saveCount).toBe(0);
  });

  it('refuse un pourcentage invalide', async () => {
    const { storage, user } = await renderApp('/postes', withBudgets([]));

    const dialog = await openNewBudget(user);
    await user.type(within(dialog).getByLabelText(/nom du poste/i), 'Voiture');
    await user.type(within(dialog).getByLabelText(/part du dépensable/i), 'beaucoup');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/pourcentage invalide/i);
    expect(storage.saveCount).toBe(0);
  });

  it('borne le curseur à ce qui reste et le relie au champ et à l’aperçu', async () => {
    const { user } = await renderApp('/postes', withBudgets([{ id: 'b1', name: 'Travaux', percent: 80 }]));

    const dialog = await openNewBudget(user);
    const slider = within(dialog).getByRole('slider', { name: /ajuster le pourcentage/i });
    expect(slider).toHaveAttribute('max', '20');

    fireEvent.change(slider, { target: { value: '15' } });
    expect(within(dialog).getByLabelText(/part du dépensable/i)).toHaveValue('15');
    expect(within(dialog).getByText(euros('Soit 300,67 € aujourd’hui'))).toBeInTheDocument(); // 15 % de 2 004,50 €
  });

  it('désactive le curseur quand tout est réparti', async () => {
    const { user } = await renderApp('/postes', withBudgets([{ id: 'b1', name: 'Travaux', percent: 100 }]));
    const dialog = await openNewBudget(user);
    expect(within(dialog).getByRole('slider')).toBeDisabled();
  });

  it('modifie puis supprime un poste', async () => {
    const budgets: Budget[] = [
      { id: 'b1', name: 'Vacances', percent: 25 },
      { id: 'b2', name: 'Travaux', percent: 30 },
    ];
    const { storage, user } = await renderApp('/postes', withBudgets(budgets));

    await user.click(screen.getByRole('button', { name: /vacances/i }));
    let dialog = await screen.findByRole('dialog', { name: /modifier le poste/i });
    const percent = within(dialog).getByLabelText(/part du dépensable/i);
    expect(percent).toHaveValue('25');
    expect(within(dialog).getByRole('slider')).toHaveAttribute('max', '70'); // 100 - 30
    await user.clear(percent);
    await user.type(percent, '40');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/40 % du dépensable/)).toBeInTheDocument();
    expect(storage.stored?.budgets.find((budget) => budget.id === 'b1')?.percent).toBe(40);

    await user.click(screen.getByRole('button', { name: /vacances/i }));
    dialog = await screen.findByRole('dialog', { name: /modifier le poste/i });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer le poste' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la suppression' }));

    expect(screen.queryByRole('button', { name: /vacances/i })).not.toBeInTheDocument();
    expect(storage.stored?.budgets.map((budget) => budget.id)).toEqual(['b2']);
  });

  it('signale l’absence de seuil de sécurité et permet de le définir', async () => {
    const { storage, user } = await renderApp('/postes', withBudgets([], null));

    const summary = within(screen.getByRole('region', { name: 'Dépensable' }));
    expect(summary.getByText(exactEuros('3 004,50 €'))).toBeInTheDocument(); // tout le déblocable
    expect(summary.getByText(/aucun seuil de sécurité défini/i)).toBeInTheDocument();

    await user.click(summary.getByRole('button', { name: /définir le seuil/i }));
    const dialog = await screen.findByRole('dialog', { name: /épargne de sécurité/i });
    await user.type(within(dialog).getByLabelText(/seuil de sécurité/i), '1000');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(screen.queryByText(/aucun seuil de sécurité défini/i)).not.toBeInTheDocument();
    expect(summary.getByText(exactEuros('2 004,50 €'))).toBeInTheDocument();
    expect(storage.stored?.safety).toEqual({ threshold: 100_000, comfortMargin: 500_000 });
  });

  it('prévient quand la réserve de sécurité n’est pas atteinte : rien n’est dépensable', async () => {
    await renderApp('/postes', withBudgets([{ id: 'b1', name: 'Vacances', percent: 50 }], { threshold: 1_000_000, comfortMargin: 0 }));

    const summary = within(screen.getByRole('region', { name: 'Dépensable' }));
    expect(summary.getByText(exactEuros('0,00 €'))).toBeInTheDocument();
    expect(summary.getByRole('status')).toHaveTextContent(/rien n.est dépensable/i);
  });

  it('signale une somme de pourcentages supérieure à 100 %', async () => {
    await renderApp(
      '/postes',
      withBudgets([
        { id: 'b1', name: 'Vacances', percent: 60 },
        { id: 'b2', name: 'Travaux', percent: 60 },
      ]),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/120 %.*dépasse 100 %/i);
  });

  it('résume le dépensable par poste sur le tableau de bord', async () => {
    await renderApp(
      '/',
      withBudgets([
        { id: 'b1', name: 'Vacances', percent: 30 },
        { id: 'b2', name: 'Voiture', percent: 20 },
      ]),
    );

    const card = within(screen.getByRole('heading', { name: 'Ce que vous pouvez dépenser' }).closest('section') as HTMLElement);
    expect(card.getByText(euros('2 004,50 €'))).toBeInTheDocument();
    expect(card.getByText('Vacances')).toBeInTheDocument();
    expect(card.getByText(euros('601,35 €'))).toBeInTheDocument(); // 30 %
    expect(card.getByText(euros('400,90 €'))).toBeInTheDocument(); // 20 %
    expect(card.getByText(euros('1 002,25 €'))).toBeInTheDocument(); // non affecté (50 %)
    expect(card.getByRole('link', { name: /gérer les postes/i })).toHaveAttribute('href', '/postes');
  });

  it('invite à créer un poste depuis le tableau de bord quand il n’y en a pas', async () => {
    await renderApp('/', withBudgets([]));

    const card = within(screen.getByRole('heading', { name: 'Ce que vous pouvez dépenser' }).closest('section') as HTMLElement);
    expect(card.getByText(/répartissez ce montant en postes/i)).toBeInTheDocument();
    expect(card.getByRole('link', { name: /créer un poste/i })).toHaveAttribute('href', '/postes');
  });

  it('est accessible depuis la navigation', async () => {
    const { user } = await renderApp('/', withBudgets([]));
    await user.click(mobileNav().getByRole('link', { name: /postes/i }));
    expect(await screen.findByRole('heading', { name: 'Postes de dépense' })).toBeInTheDocument();
  });
});

/**
 * Un livret à 12 % (1 % par mois) sans mouvement : la projection est déterministe et indépendante de la date.
 * Dépensable aujourd'hui : 2 000 € (12 000 € - seuil de 10 000 €), puis croissant.
 */
const GROWING: PatrimoineData = {
  version: DATA_VERSION,
  accounts: [{ id: 'g1', name: 'Livret 12', type: 'SAVINGS', initialBalance: 1_200_000, interestRate: 12 }],
  movements: [],
  budgets: [],
  loans: [],
  banks: [],
  properties: [],
  safety: { threshold: 1_000_000, comfortMargin: 500_000 },
};
const growingProjection = () => projectPortfolio(GROWING.accounts, GROWING.movements, new Date());
/** Dépensable dans `months` mois pour GROWING. */
const growingSpendable = (months: number): number =>
  Math.max(0, growingProjection().points[months].available - (GROWING.safety?.threshold ?? 0));
const inMonths = (months: number, day = '15'): string => `${addMonths(monthKeyOfDate(new Date()), months)}-${day}`;

describe('Postes dans le temps', () => {
  it('montre le dépensable et le montant de chaque poste à l’échéance choisie', async () => {
    const { user } = await renderApp('/postes', { ...GROWING, budgets: [{ id: 'b1', name: 'Vacances', percent: 50 }] });

    const summary = within(screen.getByRole('region', { name: 'Dépensable' }));
    expect(summary.getByText('Dépensable aujourd’hui')).toBeInTheDocument();
    expect(summary.getByText(exactEuros('2 000,00 €'))).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Dans 1 an' }));

    const inOneYear = growingSpendable(12);
    expect(inOneYear).toBeGreaterThan(200_000); // le livret rapporte : plus de dépensable dans un an
    expect(summary.getByText('Dépensable dans 1 an')).toBeInTheDocument();
    expect(summary.getByText(exactEuros(formatEuros(inOneYear)))).toBeInTheDocument();
    expect(summary.getByText(/projection sans nouvelle dépense/i)).toBeInTheDocument();

    const row = within(screen.getByRole('button', { name: /vacances/i }));
    expect(row.getByText(exactEuros(formatEuros(budgetAmount(inOneYear, 50))))).toBeInTheDocument();
    expect(row.getByText(/vs aujourd’hui/)).toHaveTextContent(/^\+/);

    await user.click(screen.getByRole('radio', { name: 'Aujourd’hui' }));
    expect(summary.getByText('Dépensable aujourd’hui')).toBeInTheDocument();
    expect(screen.queryByText(/vs aujourd’hui/)).not.toBeInTheDocument();
  });

  it('prévient qu’à une échéance rien ne serait dépensable', async () => {
    const { user } = await renderApp('/postes', {
      ...GROWING,
      safety: { threshold: 100_000_000, comfortMargin: 0 }, // seuil hors de portée
    });
    await user.click(screen.getByRole('radio', { name: 'Dans 2 ans' }));
    expect(within(screen.getByRole('region', { name: 'Dépensable' })).getByRole('status')).toHaveTextContent(
      /à cette échéance.*rien ne serait dépensable/i,
    );
  });

  it('prévisualise le montant du poste dans le temps pendant la saisie', async () => {
    const { user } = await renderApp('/postes', GROWING);

    const dialog = await screen.findByRole('button', { name: /nouveau poste/i }).then(async (button) => {
      await user.click(button);
      return screen.findByRole('dialog', { name: /nouveau poste/i });
    });
    const timeline = within(within(dialog).getByLabelText('Montant du poste dans le temps'));
    expect(timeline.getAllByText('—')).toHaveLength(5); // pas encore de pourcentage

    await user.type(within(dialog).getByLabelText(/part du dépensable/i), '40');
    for (const months of [0, 12, 24, 36, 60]) {
      expect(timeline.getByText(exactEuros(formatWholeEuros(budgetAmount(growingSpendable(months), 40))))).toBeInTheDocument();
    }
  });
});

describe('Objectifs', () => {
  it('évalue l’objectif pendant la saisie et propose le pourcentage nécessaire', async () => {
    const { storage, user } = await renderApp('/postes', GROWING);

    await user.click(screen.getByRole('button', { name: /nouveau poste/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau poste/i });
    await user.type(within(dialog).getByLabelText(/nom du poste/i), 'Voiture');
    await user.type(within(dialog).getByLabelText(/part du dépensable/i), '10');
    await user.type(within(dialog).getByLabelText(/montant visé/i), '500');
    fireEvent.change(within(dialog).getByLabelText(/échéance/i), { target: { value: inMonths(12) } });

    const objective = within(within(dialog).getByRole('region', { name: 'Objectif' }));
    const spendable = growingSpendable(12);
    const required = (minimumBasisPoints(spendable, 50_000) ?? 0) / 100;
    expect(required).toBeGreaterThan(10);
    expect(objective.getByText(/il manque/i)).toBeInTheDocument();
    expect(objective.getByText(/il faudrait/i)).toHaveTextContent(String(required).replace('.', ','));

    await user.click(objective.getByRole('button', { name: /utiliser/i }));
    expect(within(dialog).getByLabelText(/part du dépensable/i)).toHaveValue(String(required).replace('.', ','));
    expect(objective.getByText('Objectif atteint à l’échéance')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('heading', { name: 'Objectifs' })).toBeInTheDocument();
    expect(storage.stored?.budgets).toEqual([
      expect.objectContaining({ name: 'Voiture', percent: required, targetAmount: 50_000, targetDate: inMonths(12) }),
    ]);
  });

  it('refuse un objectif incomplet', async () => {
    const { storage, user } = await renderApp('/postes', GROWING);

    await user.click(screen.getByRole('button', { name: /nouveau poste/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau poste/i });
    await user.type(within(dialog).getByLabelText(/nom du poste/i), 'Voiture');
    await user.type(within(dialog).getByLabelText(/part du dépensable/i), '10');
    await user.type(within(dialog).getByLabelText(/montant visé/i), '500'); // sans échéance
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/objectif incomplet/i);
    expect(storage.saveCount).toBe(0);
  });

  it('retire l’objectif d’un poste en vidant ses champs', async () => {
    const budget: Budget = { id: 'b1', name: 'Voiture', percent: 10, targetAmount: 50_000, targetDate: inMonths(12) };
    const { storage, user } = await renderApp('/postes', { ...GROWING, budgets: [budget] });

    await user.click(screen.getByRole('button', { name: /voiture/i }));
    const dialog = await screen.findByRole('dialog', { name: /modifier le poste/i });
    expect(within(dialog).getByLabelText(/montant visé/i)).toHaveValue('500,00');
    await user.clear(within(dialog).getByLabelText(/montant visé/i));
    fireEvent.change(within(dialog).getByLabelText(/échéance/i), { target: { value: '' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(screen.queryByRole('heading', { name: 'Objectifs' })).not.toBeInTheDocument();
    const saved = storage.stored?.budgets[0];
    expect(saved).toMatchObject({ name: 'Voiture', percent: 10 });
    expect(saved && 'targetAmount' in saved).toBe(false);
  });

  it('détaille les objectifs atteints, insuffisants ou hors d’atteinte', async () => {
    const budgets: Budget[] = [
      { id: 'ok', name: 'Vacances', percent: 50, targetAmount: 10_000, targetDate: inMonths(12) }, // 100 €
      { id: 'short', name: 'Voiture', percent: 10, targetAmount: 50_000, targetDate: inMonths(12) }, // 500 €
      { id: 'never', name: 'Piscine', percent: 5, targetAmount: 100_000_000, targetDate: inMonths(12) }, // 1 M€
    ];
    await renderApp('/postes', { ...GROWING, budgets });

    const card = within(screen.getByRole('heading', { name: 'Objectifs' }).closest('section') as HTMLElement);
    const statusOf = (name: string) => card.getByRole('listitem', { name: `Objectif ${name}` }).querySelector('[data-objective]');
    expect(statusOf('Vacances')).toHaveAttribute('data-objective', 'reached');
    expect(statusOf('Voiture')).toHaveAttribute('data-objective', 'short');
    expect(statusOf('Piscine')).toHaveAttribute('data-objective', 'unreachable');
    expect(card.getByText(/même la totalité du dépensable/i)).toBeInTheDocument();
    expect(card.getAllByRole('progressbar')).toHaveLength(3);
    expect(card.getByRole('progressbar', { name: /vacances/i })).toHaveAttribute('aria-valuenow', '100');
  });

  it('alerte quand les objectifs demandent ensemble plus de 100 % du dépensable', async () => {
    const budgets: Budget[] = [
      { id: 'a', name: 'Voiture', percent: 10, targetAmount: 300_000, targetDate: inMonths(12) }, // ~85 % du dépensable
      { id: 'b', name: 'Travaux', percent: 10, targetAmount: 300_000, targetDate: inMonths(12) },
    ];
    await renderApp('/postes', { ...GROWING, budgets });

    expect(screen.getByRole('alert')).toHaveTextContent(/demandent ensemble .* du dépensable.*pas tous être financés/i);
  });

  it('ne signale aucun problème quand les objectifs tiennent ensemble', async () => {
    const budgets: Budget[] = [
      { id: 'a', name: 'Voiture', percent: 40, targetAmount: 100_000, targetDate: inMonths(12) },
      { id: 'b', name: 'Travaux', percent: 40, targetAmount: 100_000, targetDate: inMonths(12) },
    ];
    await renderApp('/postes', { ...GROWING, budgets });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('signale sur le tableau de bord les objectifs non atteints', async () => {
    const budgets: Budget[] = [{ id: 'a', name: 'Voiture', percent: 10, targetAmount: 50_000, targetDate: inMonths(12) }];
    await renderApp('/', { ...GROWING, budgets });

    const card = within(screen.getByRole('heading', { name: 'Ce que vous pouvez dépenser' }).closest('section') as HTMLElement);
    expect(card.getByText(/1 objectif n’est pas atteint à son échéance/)).toBeInTheDocument();
    expect(card.getByRole('link', { name: /voir les objectifs/i })).toHaveAttribute('href', '/postes');
  });
});

describe('Simulateur de dépense', () => {
  // Patrimoine déblocable du jeu de test : 3 004,50 €, seuil de 1 000 € (dépensable 2 004,50 €).
  const withSafety = (safety: SafetySettings | null, budgets: Budget[] = []): PatrimoineData => ({
    ...seeded(),
    budgets,
    ...(safety ? { safety } : {}),
  });
  const card = () =>
    within(screen.getByRole('heading', { name: 'Et si je dépense… ?' }).closest('section') as HTMLElement);
  const typeAmount = async (user: ReturnType<typeof userEvent.setup>, amount: string) => {
    const field = card().getByLabelText(/montant/i);
    await user.clear(field);
    await user.type(field, amount);
  };

  it('invite à saisir un montant', async () => {
    await renderApp('/', withSafety({ threshold: 100_000, comfortMargin: 100_000 }));
    expect(card().getByText(/saisissez un montant/i)).toBeInTheDocument();
    expect(card().queryByRole('status')).not.toBeInTheDocument();
  });

  it('juge raisonnable une dépense qui laisse une marge confortable', async () => {
    const { user } = await renderApp('/', withSafety({ threshold: 100_000, comfortMargin: 100_000 }));
    await typeAmount(user, '500');

    const result = card().getByRole('status');
    expect(result).toHaveAttribute('data-verdict', 'reasonable');
    expect(result).toHaveTextContent(/raisonnable/i);
    expect(result).toHaveTextContent(/3 004,50.*2 504,50/); // déblocable avant → après
    expect(result).toHaveTextContent(/bannière.*verte/i);
  });

  it('prévient quand la marge devient faible, puis déconseille sous le seuil', async () => {
    const { user } = await renderApp('/', withSafety({ threshold: 100_000, comfortMargin: 500_000 }));

    await typeAmount(user, '500'); // marge restante 1 504,50 € : dans la marge de confort
    expect(card().getByRole('status')).toHaveAttribute('data-verdict', 'tight');
    expect(card().getByRole('status')).toHaveTextContent(/possible, mais la marge devient faible/i);
    expect(card().getByRole('status')).toHaveTextContent(/bannière.*jaune/i);

    await typeAmount(user, '2500'); // reste 504,50 € : sous le seuil de 1 000 €
    expect(card().getByRole('status')).toHaveAttribute('data-verdict', 'unsafe');
    expect(card().getByRole('status')).toHaveTextContent(/déconseillé : sous le seuil de sécurité.*il manquerait 495,50/i);
    expect(card().getByRole('status')).toHaveTextContent(/bannière.*rouge/i);
  });

  it('compare la dépense au budget du poste choisi', async () => {
    const { user } = await renderApp(
      '/',
      withSafety({ threshold: 100_000, comfortMargin: 100_000 }, [{ id: 'v', name: 'Vacances', percent: 10 }]),
    );
    await typeAmount(user, '300'); // le poste dispose de 200,45 € (10 % de 2 004,50 €)
    await user.selectOptions(card().getByLabelText('Poste'), 'Vacances');

    const result = card().getByRole('status');
    expect(result).toHaveAttribute('data-verdict', 'over-budget');
    expect(result).toHaveTextContent(/dépasse le budget du poste/i);
    expect(result).toHaveTextContent(/vacances disposerait de 200,45.*il manquerait 99,55/i);

    await typeAmount(user, '150');
    expect(card().getByRole('status')).toHaveAttribute('data-verdict', 'reasonable');
    expect(card().getByRole('status')).toHaveTextContent(/tient dans le budget du poste Vacances/i);
  });

  it('projette la dépense à une échéance choisie', async () => {
    const { user } = await renderApp('/', { ...GROWING });
    await typeAmount(user, '1000');
    await user.selectOptions(card().getByLabelText('Quand ?'), 'Dans 1 an');

    const result = card().getByRole('status');
    expect(result).toHaveTextContent(/projection en .* sans autre dépense/i);
    // le déblocable projeté dans un an (avant la dépense) figure dans le détail
    expect(normalizeSpaces(result.textContent ?? '')).toContain(
      normalizeSpaces(formatEuros(growingProjection().points[12].available)),
    );
  });

  it('sans seuil défini, ne déconseille que le dépassement du déblocable', async () => {
    const { user } = await renderApp('/', withSafety(null));

    await typeAmount(user, '1000');
    expect(card().getByRole('status')).toHaveAttribute('data-verdict', 'reasonable');
    expect(card().getByRole('status')).not.toHaveTextContent(/bannière/i);

    await typeAmount(user, '5000'); // plus que les 3 004,50 € déblocables
    expect(card().getByRole('status')).toHaveAttribute('data-verdict', 'unsafe');
    expect(card().getByRole('status')).toHaveTextContent(/plus que le déblocable.*il manquerait 1 995,50/i);
  });

  it('ignore un montant invalide ou nul', async () => {
    const { user } = await renderApp('/', withSafety({ threshold: 100_000, comfortMargin: 100_000 }));
    await typeAmount(user, 'beaucoup');
    expect(card().queryByRole('status')).not.toBeInTheDocument();
    await typeAmount(user, '0');
    expect(card().queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Prêts', () => {
  const currentMonth = () => monthKeyOfDate(new Date());
  const nextMonthDate = (day = '05') => `${addMonths(currentMonth(), 1)}-${day}`;
  const withLoans = (loans: Loan[]): PatrimoineData => ({ ...seeded(), loans });
  const cardOf = (name: RegExp) => within(screen.getByRole('button', { name }));

  const ECO_PTZ: Loan = {
    id: 'eco',
    name: 'Éco-PTZ',
    kind: 'RENOVATION',
    principal: 1_200_000,
    annualRate: 0,
    monthlyPayment: 100_000,
    firstPaymentDate: nextMonthDate('05'),
  };
  const IMMO: Loan = {
    id: 'immo',
    name: 'Prêt immobilier',
    kind: 'MORTGAGE',
    principal: 6_000_000,
    annualRate: 1.5,
    monthlyPayment: 60_000,
    monthlyInsurance: 2_000,
    firstPaymentDate: nextMonthDate('10'),
  };

  it('invite à ajouter un premier prêt', async () => {
    await renderApp('/prets', seeded());
    expect(screen.getByText('Aucun prêt pour l’instant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajouter un prêt/i })).toBeInTheDocument();
  });

  it('crée un prêt à taux zéro en calculant la mensualité depuis la durée', async () => {
    const { storage, user } = await renderApp('/prets', seeded());

    await user.click(screen.getByRole('button', { name: /nouveau prêt/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau prêt/i });
    await user.type(within(dialog).getByLabelText(/nom du prêt/i), 'Éco-PTZ');
    await user.selectOptions(within(dialog).getByLabelText(/type de prêt/i), 'Rénovation');
    await user.type(within(dialog).getByLabelText(/capital restant dû/i), '12000');
    await user.type(within(dialog).getByLabelText(/taux annuel/i), '0');
    await user.type(within(dialog).getByLabelText(/durée restante/i), '120');
    await user.click(within(dialog).getByRole('button', { name: /calculer la mensualité/i }));

    expect(within(dialog).getByLabelText(/mensualité \(hors assurance\)/i)).toHaveValue('100,00');
    expect(within(dialog).getByRole('status')).toHaveTextContent(/120 échéances, fin en/i);
    expect(within(dialog).getByRole('status')).toHaveTextContent(/intérêts : 0,00/i);
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    const card = cardOf(/éco-ptz/i);
    expect(await screen.findByRole('button', { name: /éco-ptz/i })).toBeInTheDocument();
    expect(card.getByText(euros('12 000,00 €'))).toBeInTheDocument();
    expect(card.getByText(/taux zéro.*100,00.*\/ mois/i)).toBeInTheDocument();
    expect(card.getByText(/120 échéances restantes.*prochaine échéance le/i)).toBeInTheDocument();
    expect(storage.stored?.loans).toEqual([
      expect.objectContaining({ name: 'Éco-PTZ', kind: 'RENOVATION', principal: 1_200_000, annualRate: 0, monthlyPayment: 10_000 }),
    ]);
  });

  it('prévient et refuse une mensualité qui ne couvre pas les intérêts', async () => {
    const { storage, user } = await renderApp('/prets', seeded());

    await user.click(screen.getByRole('button', { name: /nouveau prêt/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau prêt/i });
    await user.type(within(dialog).getByLabelText(/nom du prêt/i), 'Prêt conso');
    await user.type(within(dialog).getByLabelText(/capital restant dû/i), '100000');
    await user.type(within(dialog).getByLabelText(/taux annuel/i), '12');
    await user.type(within(dialog).getByLabelText(/mensualité \(hors assurance\)/i), '500'); // 1 000 € d'intérêts par mois

    expect(within(dialog).getByRole('status')).toHaveTextContent(/ne couvre pas les intérêts/i);
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/ne couvre pas les intérêts/i);
    expect(storage.saveCount).toBe(0);
  });

  it('refuse le calcul de mensualité sans les données nécessaires', async () => {
    const { user } = await renderApp('/prets', seeded());

    await user.click(screen.getByRole('button', { name: /nouveau prêt/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau prêt/i });
    await user.click(within(dialog).getByRole('button', { name: /calculer la mensualité/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/renseignez le capital, le taux et une durée/i);
  });

  it('résume le capital restant dû, les mensualités et l’évolution dans le temps', async () => {
    await renderApp('/prets', withLoans([ECO_PTZ, IMMO]));

    const summary = within(screen.getByRole('region', { name: 'Synthèse des prêts' }));
    expect(summary.getByText(exactEuros('72 000,00 €'))).toBeInTheDocument(); // 12 000 € + 60 000 €, rien n'est encore remboursé
    expect(summary.getByText(exactEuros('0,00 €'))).toBeInTheDocument(); // aucune échéance ce mois-ci

    const later = within(screen.getByRole('region', { name: 'Prêts dans le temps' }));
    expect(later.getByText('Dans 1 an')).toBeInTheDocument();
    expect(later.getByText('Dans 5 ans')).toBeInTheDocument();
    expect(later.getAllByText(/mensualités :/i)).toHaveLength(4);
  });

  it('additionne les mensualités du mois, assurance comprise', async () => {
    const thisMonth = (loan: Loan): Loan => ({ ...loan, firstPaymentDate: lastDayOfMonth(currentMonth()) });
    await renderApp('/prets', withLoans([thisMonth(ECO_PTZ), thisMonth(IMMO)]));

    // 1 000 € + 600 € + 20 € d'assurance
    const summary = within(screen.getByRole('region', { name: 'Synthèse des prêts' }));
    expect(summary.getByText(exactEuros('1 620,00 €'))).toBeInTheDocument();
  });

  it('détaille chaque prêt par type : taux, assurance, avancement et fin', async () => {
    const finished: Loan = {
      id: 'old',
      name: 'Ancien prêt',
      kind: 'CONSUMER',
      principal: 100_000,
      annualRate: 0,
      monthlyPayment: 50_000,
      firstPaymentDate: '2020-01-05',
    };
    await renderApp('/prets', withLoans([ECO_PTZ, IMMO, finished]));

    const mortgage = cardOf(/prêt immobilier/i);
    expect(mortgage.getByText(/1,5 % \/ an.*600,00.*\/ mois.*20,00.*d’assurance/i)).toBeInTheDocument();
    expect(mortgage.getByRole('progressbar', { name: /part remboursée/i })).toHaveAttribute('aria-valuenow', '0');
    expect(within(screen.getByRole('region', { name: 'Immobilier' })).getByText('Prêt immobilier')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Rénovation' })).getByText('Éco-PTZ')).toBeInTheDocument();

    const old = cardOf(/ancien prêt/i);
    expect(old.getByText('Soldé')).toBeInTheDocument();
    expect(old.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('liste les prochaines fins de prêt avec la charge libérée', async () => {
    await renderApp('/prets', withLoans([ECO_PTZ]));
    const card = within(screen.getByRole('heading', { name: 'Prochaines fins de prêt' }).closest('section') as HTMLElement);
    expect(card.getByText('Éco-PTZ')).toBeInTheDocument();
    expect(card.getByText(/^\+1 000,00/)).toBeInTheDocument();
    expect(card.getByText(/mois libérés/)).toBeInTheDocument();
  });

  it('modifie un prêt puis le supprime après confirmation', async () => {
    const { storage, user } = await renderApp('/prets', withLoans([ECO_PTZ]));

    await user.click(screen.getByRole('button', { name: /éco-ptz/i }));
    let dialog = await screen.findByRole('dialog', { name: /modifier le prêt/i });
    expect(within(dialog).getByLabelText(/capital restant dû/i)).toHaveValue('12000,00');
    const payment = within(dialog).getByLabelText(/mensualité \(hors assurance\)/i);
    await user.clear(payment);
    await user.type(payment, '200');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(storage.stored?.loans[0].monthlyPayment).toBe(20_000);

    await user.click(await screen.findByRole('button', { name: /éco-ptz/i }));
    dialog = await screen.findByRole('dialog', { name: /modifier le prêt/i });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer le prêt' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la suppression' }));

    expect(storage.stored?.loans).toEqual([]);
    expect(screen.getByText('Aucun prêt pour l’instant')).toBeInTheDocument();
  });

  describe('ce qu’il reste à payer aujourd’hui', () => {
    const openLoanForm = async (loan: Loan) => {
      const app = await renderApp('/prets', withLoans([loan]));
      await app.user.click(screen.getByRole('button', { name: new RegExp(loan.name, 'i') }));
      return within(await screen.findByRole('dialog', { name: /modifier le prêt/i }));
    };

    it('déduit les échéances passées sans toucher au capital saisi', async () => {
      // échéances le 1er : les trois dernières (il y a deux mois, le mois dernier, ce mois-ci) sont passées
      const dialog = await openLoanForm({ ...ECO_PTZ, firstPaymentDate: `${addMonths(currentMonth(), -2)}-01` });

      expect(dialog.getByLabelText(/capital restant dû/i)).toHaveValue('12000,00');
      expect(dialog.getByText(euros('Aujourd’hui : 9 000,00 € restant dû'))).toBeInTheDocument();
      expect(dialog.getByText(/après 3 échéances payées depuis le/i)).toHaveTextContent(/inutile de modifier le montant/i);

      const status = dialog.getByRole('status');
      expect(status).toHaveTextContent(/9 échéances restantes sur 12, fin en/i);
      expect(status).toHaveTextContent(euros('Reste à payer \\(assurance et remboursements anticipés compris\\) : 9 000,00 €'));
    });

    it('n’affiche rien de plus pour un prêt qui n’a pas commencé', async () => {
      const dialog = await openLoanForm(ECO_PTZ);
      expect(dialog.queryByText(/aujourd’hui :/i)).not.toBeInTheDocument();
      expect(dialog.getByRole('status')).toHaveTextContent(/12 échéances, fin en/i);
    });

    it('indique un prêt soldé', async () => {
      const dialog = await openLoanForm({
        id: 'old',
        name: 'Ancien prêt',
        kind: 'CONSUMER',
        principal: 100_000,
        annualRate: 0,
        monthlyPayment: 50_000,
        firstPaymentDate: '2020-01-05',
      });
      expect(dialog.getByText('Aujourd’hui : prêt soldé')).toBeInTheDocument();
      expect(dialog.getByRole('status')).toHaveTextContent(/prêt soldé : toutes ses échéances sont passées/i);
    });
  });

  it('résume les prêts sur le tableau de bord', async () => {
    await renderApp('/', withLoans([ECO_PTZ, IMMO]));

    const card = within(screen.getByRole('heading', { name: 'Prêts en cours' }).closest('section') as HTMLElement);
    expect(card.getByText(exactEuros('72 000,00 €'))).toBeInTheDocument();
    expect(card.getByText(/fin du dernier prêt/i)).toBeInTheDocument();
    expect(card.getByRole('link', { name: /voir les prêts/i })).toHaveAttribute('href', '/prets');
  });

  it('n’affiche pas de carte de prêts sur le tableau de bord sans prêt', async () => {
    await renderApp('/', seeded());
    expect(screen.queryByRole('heading', { name: 'Prêts en cours' })).not.toBeInTheDocument();
  });

  it('donne les mensualités comme repère pour fixer l’épargne de sécurité', async () => {
    const { user } = await renderApp('/', withLoans([ECO_PTZ, { ...IMMO, firstPaymentDate: lastDayOfMonth(currentMonth()) }]));

    await user.click(screen.getByRole('button', { name: /définir l’épargne de sécurité/i }));
    const dialog = await screen.findByRole('dialog', { name: /épargne de sécurité/i });
    // ce mois-ci : seule la mensualité du prêt immobilier (600 € + 20 € d'assurance) ; six mois = 3 720 €
    expect(within(dialog).getByText(/vos prêts coûtent 620,00.*3 720,00.*six mois/i)).toBeInTheDocument();
  });

  it('est accessible depuis la navigation', async () => {
    const { user } = await renderApp('/', seeded());
    await user.click(mobileNav().getByRole('link', { name: /prêts/i }));
    expect(await screen.findByRole('heading', { name: 'Prêts en cours' })).toBeInTheDocument();
  });

  describe('remboursements anticipés', () => {
    // Éco-PTZ : 12 échéances de 1 000 € à partir du mois prochain. Un remboursement de 3 000 € à la 3e échéance
    // laisse 6 000 € : 6 échéances de moins, soit 9 au total.
    const thirdInstallment = () => inMonths(3, '05');

    const openLoan = async (loan: Loan) => {
      const app = await renderApp('/prets', withLoans([loan]));
      await app.user.click(screen.getByRole('button', { name: new RegExp(loan.name, 'i') }));
      const dialog = await screen.findByRole('dialog', { name: /modifier le prêt/i });
      return { ...app, dialog: within(dialog) };
    };

    const addPrepayment = async (
      app: Awaited<ReturnType<typeof openLoan>>,
      { amount, date, effect }: { amount?: string; date?: string; effect?: string },
    ) => {
      await app.user.click(app.dialog.getByRole('button', { name: /ajouter un remboursement anticipé/i }));
      const rows = app.dialog.getAllByLabelText(/montant remboursé/i);
      const index = rows.length - 1;
      if (amount !== undefined) await app.user.type(rows[index], amount);
      if (date !== undefined) fireEvent.change(app.dialog.getAllByLabelText(/remboursé le/i)[index], { target: { value: date } });
      if (effect !== undefined) await app.user.selectOptions(app.dialog.getAllByLabelText(/effet du remboursement/i)[index], effect);
    };

    it('ajoute un remboursement anticipé, en montre l’effet avant d’enregistrer, puis l’indique sur la carte', async () => {
      const app = await openLoan(ECO_PTZ);
      expect(app.dialog.queryByLabelText(/montant remboursé/i)).not.toBeInTheDocument();

      await addPrepayment(app, { amount: '3000', date: thirdInstallment() });

      const status = app.dialog.getByRole('status');
      expect(status).toHaveTextContent(/9 échéances, fin en/i);
      expect(status).toHaveTextContent(/sans remboursement anticipé : 12 échéances/i);
      expect(status).toHaveTextContent(/vous économisez 0,00.*d’intérêts et 3 échéances/i);
      await app.user.click(app.dialog.getByRole('button', { name: 'Enregistrer' }));

      expect(app.storage.stored?.loans[0].prepayments).toEqual([
        { date: thirdInstallment(), amount: 300_000, effect: 'DURATION' },
      ]);
      const card = cardOf(/éco-ptz/i);
      expect(await card.findByText(/9 échéances restantes/)).toBeInTheDocument();
      expect(card.getByText(/1 remboursement anticipé · 3 échéances en moins$/)).toBeInTheDocument();
    });

    it('réduire la mensualité conserve la fin du prêt et indique la nouvelle mensualité', async () => {
      const app = await openLoan(ECO_PTZ);
      await addPrepayment(app, { amount: '3000', date: thirdInstallment(), effect: 'Réduire la mensualité' });

      const status = app.dialog.getByRole('status');
      expect(status).toHaveTextContent(/12 échéances, fin en/i); // 1 000 € jusqu'au remboursement, puis 6 000 € sur 9 échéances
      expect(status).toHaveTextContent(/mensualité ramenée à 666,67/i);
      await app.user.click(app.dialog.getByRole('button', { name: 'Enregistrer' }));

      expect(app.storage.stored?.loans[0].prepayments).toEqual([
        { date: thirdInstallment(), amount: 300_000, effect: 'PAYMENT' },
      ]);
    });

    it('chiffre les intérêts économisés d’un prêt à taux non nul', async () => {
      const conso: Loan = {
        id: 'conso',
        name: 'Prêt conso',
        kind: 'CONSUMER',
        principal: 800_000,
        annualRate: 4.9,
        monthlyPayment: 19_000,
        firstPaymentDate: nextMonthDate('25'),
        prepayments: [{ date: inMonths(6, '25'), amount: 300_000, effect: 'DURATION' }],
      };
      await renderApp('/prets', withLoans([conso]));
      expect(cardOf(/prêt conso/i).getByText(/1 remboursement anticipé · \d+ échéances en moins · .*d’intérêts économisés$/)).toBeInTheDocument();
    });

    it('affiche la mensualité réduite d’un remboursement déjà effectué', async () => {
      const reduced: Loan = {
        ...ECO_PTZ,
        firstPaymentDate: `${addMonths(monthKeyOfDate(new Date()), -3)}-05`,
        prepayments: [{ date: `${addMonths(monthKeyOfDate(new Date()), -2)}-05`, amount: 300_000, effect: 'PAYMENT' }],
      };
      await renderApp('/prets', withLoans([reduced]));
      // 1 000 € par mois avant le remboursement ; ensuite 7 000 € sur les 10 échéances restantes
      const card = cardOf(/éco-ptz/i);
      expect(card.getByText(/taux zéro.*700,00.*\/ mois/i)).toBeInTheDocument();
      expect(card.getByText(/^1 remboursement anticipé · mensualité ramenée à 700,00/)).toBeInTheDocument();
    });

    it('ignore une ligne vide et refuse une ligne incomplète', async () => {
      const app = await openLoan(ECO_PTZ);
      await addPrepayment(app, {});
      await app.user.click(app.dialog.getByRole('button', { name: 'Enregistrer' }));
      expect(app.storage.stored?.loans[0]).not.toHaveProperty('prepayments');

      await app.user.click(await screen.findByRole('button', { name: /éco-ptz/i }));
      const again = within(await screen.findByRole('dialog', { name: /modifier le prêt/i }));
      await app.user.click(again.getByRole('button', { name: /ajouter un remboursement anticipé/i }));
      await app.user.type(again.getByLabelText(/montant remboursé/i), '500');
      const saves = app.storage.saveCount;
      await app.user.click(again.getByRole('button', { name: 'Enregistrer' }));

      expect(await again.findByRole('alert')).toHaveTextContent(/remboursement anticipé 1 : saisissez un montant positif et une date/i);
      expect(app.storage.saveCount).toBe(saves);
    });

    it('prévient d’un remboursement daté après la fin du prêt', async () => {
      const app = await openLoan(ECO_PTZ);
      await addPrepayment(app, { amount: '500', date: inMonths(40) });

      expect(app.dialog.getByRole('status')).toHaveTextContent(/un remboursement anticipé daté d’après la fin du prêt n’est pas pris en compte/i);
      await app.user.click(app.dialog.getByRole('button', { name: 'Enregistrer' }));
      expect(await cardOf(/éco-ptz/i).findByText(/1 remboursement daté après la fin du prêt : sans effet/i)).toBeInTheDocument();
    });

    it('retire un remboursement anticipé existant', async () => {
      const app = await openLoan({
        ...ECO_PTZ,
        prepayments: [{ date: thirdInstallment(), amount: 300_000, effect: 'DURATION' }],
      });
      expect(app.dialog.getByLabelText(/montant remboursé/i)).toHaveValue('3000,00');
      expect(app.dialog.getByLabelText(/effet du remboursement/i)).toHaveValue('DURATION');

      await app.user.click(app.dialog.getByRole('button', { name: /retirer le remboursement anticipé 1/i }));
      expect(app.dialog.queryByLabelText(/montant remboursé/i)).not.toBeInTheDocument();
      await app.user.click(app.dialog.getByRole('button', { name: 'Enregistrer' }));

      expect(app.storage.stored?.loans[0]).not.toHaveProperty('prepayments');
      expect(await cardOf(/éco-ptz/i).findByText(/12 échéances restantes/)).toBeInTheDocument();
      expect(cardOf(/éco-ptz/i).queryByText(/remboursement anticipé/)).not.toBeInTheDocument();
    });

    it('rappelle que le remboursement n’est pas déduit des comptes', async () => {
      const app = await openLoan(ECO_PTZ);
      expect(app.dialog.getByText(/n’est pas déduit de vos comptes/i)).toBeInTheDocument();
    });
  });

  describe('fonds réservés', () => {
    const RESERVED_LOAN: Loan = {
      id: 'travaux',
      name: 'Prêt conso travaux',
      kind: 'CONSUMER',
      principal: 800_000,
      annualRate: 4.9,
      monthlyPayment: 19_000,
      firstPaymentDate: nextMonthDate('25'),
      reservedFunds: {
        note: 'À verser à l’artisan',
        since: '2026-01-10',
        allocations: [
          { accountId: 'a1', amount: 50_000 },
          { accountId: 'a2', amount: 2_000 },
        ],
      },
    };

    it('affiche les fonds réservés sur la bannière du tableau de bord et sur les comptes concernés', async () => {
      await renderApp('/', withLoans([RESERVED_LOAN]));

      expect(screen.getByText(/dont 520,00.*réservés pour un ou plusieurs prêts en cours/i)).toBeInTheDocument();

      const checking = within(screen.getByRole('region', { name: 'Comptes courants' }));
      expect(checking.getByText(euros('500,00 € réservés'))).toBeInTheDocument();
      const savings = within(screen.getByRole('region', { name: 'Épargne' }));
      expect(savings.getByText(euros('20,00 € réservés'))).toBeInTheDocument();
    });

    it('montre les fonds réservés et le déblocable restant sur la page Comptes', async () => {
      await renderApp('/comptes', withLoans([RESERVED_LOAN]));
      const livret = within(screen.getByRole('button', { name: /livret a/i }));
      expect(livret.getByText(euros('20,00 € réservés · 30,00 € déblocables'))).toBeInTheDocument();
    });

    it('indique les fonds réservés sur la carte du prêt, avec les comptes, la date et la destination', async () => {
      await renderApp('/prets', withLoans([RESERVED_LOAN]));
      const card = cardOf(/prêt conso travaux/i);
      expect(card.getByText(/520,00.*réservés \(Compte courant, Livret A\)/i)).toBeInTheDocument();
      expect(card.getByText(/à verser à l’artisan/i)).toBeInTheDocument();
    });

    it('crée un prêt avec des fonds réservés sur un compte', async () => {
      const { storage, user } = await renderApp('/prets', seeded());

      await user.click(screen.getByRole('button', { name: /nouveau prêt/i }));
      const dialog = within(await screen.findByRole('dialog', { name: /nouveau prêt/i }));
      await user.type(dialog.getByLabelText(/nom du prêt/i), 'Prêt conso travaux');
      await user.type(dialog.getByLabelText(/capital restant dû/i), '8000');
      await user.type(dialog.getByLabelText(/taux annuel/i), '4,9');
      await user.type(dialog.getByLabelText(/mensualité \(hors assurance\)/i), '190');

      await user.type(dialog.getByLabelText(/destination/i), 'À verser à l’artisan');
      fireEvent.change(dialog.getByLabelText(/réservé depuis le/i), { target: { value: '2026-01-10' } });
      await user.click(dialog.getByRole('button', { name: /ajouter un compte/i }));
      await user.selectOptions(dialog.getByLabelText('Compte'), 'a1');
      await user.type(dialog.getByLabelText(/montant réservé/i), '500');
      expect(dialog.getByText(/total réservé : 500,00/i)).toBeInTheDocument();

      await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));

      expect(storage.stored?.loans[0].reservedFunds).toEqual({
        note: 'À verser à l’artisan',
        since: '2026-01-10',
        allocations: [{ accountId: 'a1', amount: 50_000 }],
      });
      expect(await cardOf(/prêt conso travaux/i).findByText(/500,00.*réservés \(Compte courant\)/i)).toBeInTheDocument();
    });

    it('prérempli les fonds réservés existants et permet de les retirer', async () => {
      const { storage, user } = await renderApp('/prets', withLoans([RESERVED_LOAN]));

      await user.click(screen.getByRole('button', { name: /prêt conso travaux/i }));
      const dialog = within(await screen.findByRole('dialog', { name: /modifier le prêt/i }));
      expect(dialog.getByLabelText(/destination/i)).toHaveValue('À verser à l’artisan');
      expect(dialog.getByLabelText(/réservé depuis le/i)).toHaveValue('2026-01-10');
      const amounts = dialog.getAllByLabelText(/montant réservé/i);
      expect(amounts.map((input) => (input as HTMLInputElement).value)).toEqual(['500,00', '20,00']);

      await user.click(dialog.getByRole('button', { name: /retirer le compte 1 des fonds réservés/i }));
      await user.click(dialog.getByRole('button', { name: /retirer le compte 1 des fonds réservés/i }));
      await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));

      expect(storage.stored?.loans[0]).not.toHaveProperty('reservedFunds');
    });

    it('refuse une ligne de fonds réservés incomplète, puis un compte utilisé deux fois', async () => {
      const { storage, user } = await renderApp('/prets', seeded());
      await user.click(screen.getByRole('button', { name: /nouveau prêt/i }));
      const dialog = within(await screen.findByRole('dialog', { name: /nouveau prêt/i }));
      await user.type(dialog.getByLabelText(/nom du prêt/i), 'Prêt conso');
      await user.type(dialog.getByLabelText(/capital restant dû/i), '8000');
      await user.type(dialog.getByLabelText(/taux annuel/i), '4,9');
      await user.type(dialog.getByLabelText(/mensualité \(hors assurance\)/i), '190');

      await user.click(dialog.getByRole('button', { name: /ajouter un compte/i }));
      await user.selectOptions(dialog.getByLabelText('Compte'), 'a1');
      const saves = 0;
      await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
      expect(await dialog.findByRole('alert')).toHaveTextContent(/fonds réservés 1 : choisissez un compte et un montant positif/i);
      expect(storage.saveCount).toBe(saves);

      await user.type(dialog.getByLabelText(/montant réservé/i), '500');
      await user.click(dialog.getByRole('button', { name: /ajouter un compte/i }));
      await user.selectOptions(dialog.getAllByLabelText('Compte')[1], 'a1');
      await user.type(dialog.getAllByLabelText(/montant réservé/i)[1], '100');
      await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
      expect(await dialog.findByRole('alert')).toHaveTextContent(/fonds réservés 2 : ce compte est déjà utilisé pour ce prêt/i);
      expect(storage.saveCount).toBe(saves);
    });

    it('détache l’allocation d’un compte réservé quand ce compte est supprimé', async () => {
      const { storage, user } = await renderApp('/comptes', withLoans([RESERVED_LOAN]));

      await user.click(screen.getByRole('button', { name: /livret a/i }));
      const dialog = within(await screen.findByRole('dialog', { name: /modifier le compte/i }));
      await user.click(dialog.getByRole('button', { name: 'Supprimer le compte' }));
      await user.click(dialog.getByRole('button', { name: 'Confirmer la suppression' }));

      expect(storage.stored?.loans[0].reservedFunds?.allocations).toEqual([{ accountId: 'a1', amount: 50_000 }]);
    });
  });
});

describe('Retraits rattachés à un poste', () => {
  const year = new Date().getFullYear();
  const SAFETY: SafetySettings = { threshold: 100_000, comfortMargin: 500_000 };
  const BUDGETS: Budget[] = [
    { id: 'vac', name: 'Vacances', percent: 25 },
    { id: 'trav', name: 'Travaux', percent: 30 },
  ];
  const withTagged = (extra: Movement[] = [], loans: Loan[] = []): PatrimoineData => {
    const base = seeded();
    return { ...base, movements: [...base.movements, ...extra], budgets: BUDGETS, safety: SAFETY, loans };
  };
  const spentOnVacances: Movement = {
    id: 'm4',
    accountId: 'a1',
    type: 'WITHDRAWAL',
    amount: 10_000,
    date: `${year}-02-10`,
    note: 'Week-end',
    budgetId: 'vac',
  };

  it('propose le poste pour un retrait seulement, et l’enregistre', async () => {
    const { storage, user } = await renderApp('/mouvements', withTagged());

    await user.click(screen.getByRole('button', { name: /nouveau mouvement/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau mouvement/i });
    expect(within(dialog).queryByLabelText(/poste \(facultatif\)/i)).not.toBeInTheDocument(); // versement par défaut

    await user.click(within(dialog).getByLabelText('Retrait'));
    await user.selectOptions(within(dialog).getByLabelText(/poste \(facultatif\)/i), 'Travaux');
    await user.type(within(dialog).getByLabelText(/montant/i), '120');
    await user.type(within(dialog).getByLabelText(/note/i), 'Peinture');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    const row = within(await screen.findByRole('button', { name: /peinture/i }));
    expect(row.getByText('Travaux')).toBeInTheDocument(); // pastille du poste
    expect(storage.stored?.movements.find((movement) => movement.note === 'Peinture')).toMatchObject({
      type: 'WITHDRAWAL',
      amount: 12_000,
      budgetId: 'trav',
    });
  });

  it('retire le rattachement quand on repasse en versement', async () => {
    const { storage, user } = await renderApp('/mouvements', withTagged([spentOnVacances]));

    await user.click(screen.getByRole('button', { name: /week-end/i }));
    const dialog = await screen.findByRole('dialog', { name: /modifier le mouvement/i });
    expect(within(dialog).getByLabelText(/poste \(facultatif\)/i)).toHaveValue('vac');
    await user.click(within(dialog).getByLabelText('Versement'));
    expect(within(dialog).queryByLabelText(/poste \(facultatif\)/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    const saved = storage.stored?.movements.find((movement) => movement.id === 'm4');
    expect(saved?.type).toBe('DEPOSIT');
    expect(saved && 'budgetId' in saved).toBe(false);
  });

  it('filtre les mouvements par poste ou sans poste', async () => {
    const { user } = await renderApp('/mouvements', withTagged([spentOnVacances]));
    const filter = screen.getByLabelText('Filtrer par poste');

    await user.selectOptions(filter, 'Vacances');
    expect(screen.getByText('Week-end')).toBeInTheDocument();
    expect(screen.queryByText('Courses')).not.toBeInTheDocument();

    await user.selectOptions(filter, 'Retraits sans poste');
    expect(screen.getByText('Courses')).toBeInTheDocument(); // retrait sans poste
    expect(screen.queryByText('Week-end')).not.toBeInTheDocument();
    expect(screen.queryByText('Salaire')).not.toBeInTheDocument(); // un versement n'est pas un « retrait sans poste »
  });

  it('ne propose aucun poste tant qu’il n’en existe pas', async () => {
    const { user } = await renderApp('/mouvements', seeded());
    expect(screen.queryByLabelText('Filtrer par poste')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /nouveau mouvement/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau mouvement/i });
    await user.click(within(dialog).getByLabelText('Retrait'));
    expect(within(dialog).queryByLabelText(/poste \(facultatif\)/i)).not.toBeInTheDocument();
  });

  it('déduit la dépense de l’enveloppe du poste sans toucher aux autres', async () => {
    await renderApp('/postes', withTagged([spentOnVacances]));

    // dépensable réel 1 904,50 € + 100 € dépensés = base 2 004,50 € : vacances 25 % = 501,12 €, moins 100 € = 401,12 €
    const vacances = within(screen.getByRole('button', { name: /vacances/i }));
    expect(vacances.getByText(exactEuros('401,12 €'))).toBeInTheDocument();
    expect(vacances.getByText(/dépensé 100,00 € cette année/i)).toBeInTheDocument();
    // travaux : 30 % de 2 004,50 € = 601,35 €, comme avant la dépense
    expect(within(screen.getByRole('button', { name: /travaux/i })).getByText(exactEuros('601,35 €'))).toBeInTheDocument();
    expect(screen.getByText(/ne consomme que l’enveloppe de ce poste/i)).toBeInTheDocument();
  });

  it('signale un poste dont la dépense dépasse l’enveloppe', async () => {
    const big: Movement = { ...spentOnVacances, id: 'm5', amount: 100_000, note: 'Grand voyage' }; // 1 000 € > enveloppe
    await renderApp('/postes', withTagged([big]));
    expect(within(screen.getByRole('button', { name: /vacances/i })).getByText('dépassé')).toBeInTheDocument();
  });

  it('résume le reste à dépenser sur le tableau de bord', async () => {
    await renderApp('/', withTagged([spentOnVacances]));
    const card = within(screen.getByRole('heading', { name: 'Ce que vous pouvez dépenser' }).closest('section') as HTMLElement);
    expect(card.getByText(exactEuros('401,12 €'))).toBeInTheDocument();
    expect(card.getByText(/dépensé 100,00/)).toBeInTheDocument();
  });

  it('montre où passe l’argent : postes, retraits sans poste et mensualités de prêts', async () => {
    const untagged: Movement = { ...spentOnVacances, id: 'm6', amount: 5_000, note: 'Divers', budgetId: undefined };
    const loan: Loan = {
      id: 'l',
      name: 'Prêt',
      kind: 'CONSUMER',
      principal: 1_200_000,
      annualRate: 0,
      monthlyPayment: 100_000,
      firstPaymentDate: `${year}-01-05`, // 12 mensualités de 1 000 € dans l'année
    };
    await renderApp('/postes', withTagged([spentOnVacances, untagged], [loan]));

    const card = within(screen.getByRole('heading', { name: 'Où passe l’argent' }).closest('section') as HTMLElement);
    // Seuls les retraits de l'année courante (100 € rattachés à Vacances, 50 € sans poste) et les mensualités
    // de cette année s'additionnent.
    expect(card.getByText('Vacances')).toBeInTheDocument();
    expect(card.getByText('Retraits sans poste')).toBeInTheDocument();
    expect(card.getByText('Mensualités de prêts')).toBeInTheDocument();
    expect(card.getByText(exactEuros('12 000,00 €'))).toBeInTheDocument(); // mensualités
    expect(card.getByText(/retraits et mensualités de prêts de l’année/i)).toBeInTheDocument();
    expect(card.getByText(/inutile de les saisir comme mouvements/i)).toBeInTheDocument();
  });

  it('permet de consulter les années précédentes', async () => {
    const lastYear: Movement = {
      ...spentOnVacances,
      id: 'm7',
      amount: 250_000,
      note: 'Vacances d’avant',
      date: `${year - 1}-07-10`,
    };
    const { user } = await renderApp('/postes', withTagged([lastYear]));
    const card = within(screen.getByRole('heading', { name: 'Où passe l’argent' }).closest('section') as HTMLElement);

    expect(card.getByRole('button', { name: 'Année suivante' })).toBeDisabled();
    await user.click(card.getByRole('button', { name: 'Année précédente' }));

    expect(card.getByText(String(year - 1))).toBeInTheDocument();
    expect(card.getAllByText(exactEuros('2 500,00 €'))).toHaveLength(2); // total de l'année et ligne « Vacances »
    expect(card.getByRole('button', { name: 'Année précédente' })).toBeDisabled();
  });

  it('invite à rattacher des retraits quand il n’y a aucune dépense dans l’année', async () => {
    await renderApp('/postes', { ...seeded(), movements: [], budgets: BUDGETS });
    const card = within(screen.getByRole('heading', { name: 'Où passe l’argent' }).closest('section') as HTMLElement);
    expect(card.getByText(/aucune dépense en/i)).toBeInTheDocument();
  });
});

describe('Fonds bloqués', () => {
  const withPee = (): PatrimoineData => {
    const base = seeded();
    return {
      ...base,
      accounts: [
        ...base.accounts,
        {
          id: 'pee',
          name: 'PEE',
          type: 'SAVINGS',
          initialBalance: 200_000,
          depositLockYears: 5,
          // triées par date, comme le garantit le dépôt à l'enregistrement
          lockedTranches: [
            { amount: 30_000, unlockDate: '2098-06-10' },
            { amount: 150_000, unlockDate: '2099-01-15' },
          ],
        },
      ],
    };
  };

  it('crée un compte d’épargne avec durée de blocage et tranches bloquées', async () => {
    const { storage, user } = await renderApp('/comptes');

    await user.click(screen.getByRole('button', { name: /nouveau compte/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau compte/i });
    await user.type(within(dialog).getByLabelText(/nom du compte/i), 'PEE');
    expect(within(dialog).queryByLabelText(/versements bloqués pendant/i)).not.toBeInTheDocument(); // compte courant
    await user.click(within(dialog).getByLabelText('Épargne'));
    await user.type(within(dialog).getByLabelText(/solde initial/i), '2000');
    await user.type(within(dialog).getByLabelText(/versements bloqués pendant/i), '5');

    await user.click(within(dialog).getByRole('button', { name: /ajouter une tranche/i }));
    const tranche = within(within(dialog).getByRole('group', { name: 'Tranche 1' }));
    await user.type(tranche.getByLabelText(/montant bloqué/i), '1500');
    fireEvent.change(tranche.getByLabelText(/débloqué le/i), { target: { value: '2099-01-15' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(euros('1 500,00 € bloqués'))).toBeInTheDocument();
    expect(screen.getByText(euros('500,00 € déblocables'))).toBeInTheDocument();
    expect(storage.stored?.accounts[0]).toMatchObject({
      name: 'PEE',
      type: 'SAVINGS',
      initialBalance: 200_000,
      depositLockYears: 5,
      lockedTranches: [{ amount: 150_000, unlockDate: '2099-01-15' }],
    });
  });

  it('refuse une tranche incomplète ou une durée invalide sans rien enregistrer', async () => {
    const { storage, user } = await renderApp('/comptes');

    await user.click(screen.getByRole('button', { name: /nouveau compte/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau compte/i });
    await user.type(within(dialog).getByLabelText(/nom du compte/i), 'PEE');
    await user.click(within(dialog).getByLabelText('Épargne'));
    await user.click(within(dialog).getByRole('button', { name: /ajouter une tranche/i }));
    await user.type(within(dialog).getByLabelText(/montant bloqué/i), '1000'); // sans date
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/tranche 1/i);

    await user.click(within(dialog).getByRole('button', { name: /retirer la tranche 1/i }));
    await user.type(within(dialog).getByLabelText(/versements bloqués pendant/i), 'cinq');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/durée de blocage invalide/i);
    expect(storage.saveCount).toBe(0);
  });

  it('modifie les tranches d’un compte existant', async () => {
    const { storage, user } = await renderApp('/comptes', withPee());

    await user.click(screen.getByRole('button', { name: /pee/i }));
    const dialog = await screen.findByRole('dialog', { name: /modifier le compte/i });
    // les tranches sont triées par date : la plus proche (juin 2098) en premier
    const first = within(within(dialog).getByRole('group', { name: 'Tranche 1' }));
    expect(first.getByLabelText(/montant bloqué/i)).toHaveValue('300,00');
    expect(first.getByLabelText(/débloqué le/i)).toHaveValue('2098-06-10');
    expect(within(dialog).getByLabelText(/versements bloqués pendant/i)).toHaveValue('5');

    await user.click(within(dialog).getByRole('button', { name: /retirer la tranche 1/i }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    const pee = storage.stored?.accounts.find((account) => account.id === 'pee');
    expect(pee?.lockedTranches).toEqual([{ amount: 150_000, unlockDate: '2099-01-15' }]);
    expect(await screen.findByText(euros('1 500,00 € bloqués'))).toBeInTheDocument();
  });

  it('montre le déblocable, le bloqué et les prochains déblocages sur le tableau de bord', async () => {
    await renderApp('/', withPee());

    const banner = within(screen.getByRole('region', { name: 'Patrimoine' }));
    // total 3 004,50 + 2 000 = 5 004,50 € ; bloqué min(1 800, 2 000) = 1 800 € ; déblocable 3 204,50 €
    expect(banner.getByText(euros('5 004,50 €'))).toBeInTheDocument();
    expect(banner.getByText(euros('1 800,00 €'))).toBeInTheDocument();
    expect(banner.getByText(euros('3 204,50 €'))).toBeInTheDocument();

    const schedule = within(screen.getByRole('heading', { name: 'Prochains déblocages' }).closest('section') as HTMLElement);
    expect(schedule.getByText(/juin 2098/i)).toBeInTheDocument();
    expect(schedule.getByText(/janvier 2099/i)).toBeInTheDocument();
    expect(schedule.getByText(euros('+300,00 €'))).toBeInTheDocument();
    expect(schedule.getByText(euros('+1 500,00 €'))).toBeInTheDocument();
  });

  it('n’affiche pas de déblocages quand aucun fonds n’est bloqué', async () => {
    await renderApp('/', seeded());
    expect(screen.queryByRole('heading', { name: 'Prochains déblocages' })).not.toBeInTheDocument();
  });

  it('coche « disponible à la retraite » : aucune date requise, la tranche est bloquée sans échéance connue', async () => {
    const { storage, user } = await renderApp('/comptes');

    await user.click(screen.getByRole('button', { name: /nouveau compte/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau compte/i });
    await user.type(within(dialog).getByLabelText(/nom du compte/i), 'PEE');
    await user.click(within(dialog).getByLabelText('Épargne'));
    await user.click(within(dialog).getByRole('button', { name: /ajouter une tranche/i }));
    const tranche = within(within(dialog).getByRole('group', { name: 'Tranche 1' }));
    await user.type(tranche.getByLabelText(/montant bloqué/i), '3000');

    await user.click(tranche.getByLabelText(/disponible à la retraite/i));
    expect(tranche.queryByLabelText(/débloqué le/i)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(storage.stored?.accounts[0].lockedTranches).toEqual([{ amount: 300_000, unlockAtRetirement: true }]);
  });

  it('n’affiche pas une tranche « retraite » dans les prochains déblocages, mais la compte comme bloquée', async () => {
    const data = withPee();
    data.accounts[data.accounts.length - 1] = {
      ...data.accounts[data.accounts.length - 1],
      lockedTranches: [
        { amount: 30_000, unlockDate: '2098-06-10' },
        { amount: 150_000, unlockAtRetirement: true },
      ],
    };
    await renderApp('/', data);

    const banner = within(screen.getByRole('region', { name: 'Patrimoine' }));
    expect(banner.getByText(euros('1 800,00 €'))).toBeInTheDocument(); // toujours bloqué : 300 + 1 500 €

    const schedule = within(screen.getByRole('heading', { name: 'Prochains déblocages' }).closest('section') as HTMLElement);
    expect(schedule.getByText(/juin 2098/i)).toBeInTheDocument();
    expect(schedule.queryByText(euros('+1 500,00 €'))).not.toBeInTheDocument();
  });
});

describe('Banques', () => {
  it('ajoute une banque, la propose à un compte et affiche son badge', async () => {
    const { storage, user } = await renderApp('/comptes');

    const banksCard = within(screen.getByRole('heading', { name: 'Banques' }).closest('section') as HTMLElement);
    await user.type(banksCard.getByLabelText(/nom de la banque/i), 'LCL');
    await user.click(banksCard.getByRole('button', { name: 'Ajouter' }));
    expect(await banksCard.findByRole('button', { name: /retirer lcl/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /nouveau compte/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau compte/i });
    await user.type(within(dialog).getByLabelText(/nom du compte/i), 'Livret LCL');
    await user.selectOptions(within(dialog).getByLabelText(/^banque/i), 'LCL');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    const accountRow = (await screen.findByText('Livret LCL')).closest('button') as HTMLElement;
    expect(within(accountRow).getByRole('img', { name: 'LCL' })).toBeInTheDocument();
    const created = storage.stored?.accounts.find((account) => account.name === 'Livret LCL');
    expect(created?.bankId).toBe(storage.stored?.banks[0]?.id);
  });

  it('propose les banques suggérées en un clic, puis les retire des suggestions', async () => {
    const { user } = await renderApp('/comptes');
    const banksCard = within(screen.getByRole('heading', { name: 'Banques' }).closest('section') as HTMLElement);

    await user.click(banksCard.getByRole('button', { name: '+ La Banque Postale' }));
    expect(await banksCard.findByText('La Banque Postale')).toBeInTheDocument();
    expect(banksCard.queryByRole('button', { name: '+ La Banque Postale' })).not.toBeInTheDocument();
  });

  it('refuse un nom vide ou déjà utilisé', async () => {
    const { storage, user } = await renderApp('/comptes');
    const banksCard = within(screen.getByRole('heading', { name: 'Banques' }).closest('section') as HTMLElement);

    expect(banksCard.getByRole('button', { name: 'Ajouter' })).toBeDisabled();

    await user.type(banksCard.getByLabelText(/nom de la banque/i), 'LCL');
    await user.click(banksCard.getByRole('button', { name: 'Ajouter' }));
    await user.type(banksCard.getByLabelText(/nom de la banque/i), 'lcl');
    await user.click(banksCard.getByRole('button', { name: 'Ajouter' }));

    expect(await banksCard.findByRole('alert')).toHaveTextContent(/existe déjà/i);
    expect(storage.stored?.banks).toHaveLength(1);
  });

  it('détache les comptes rattachés quand la banque est supprimée', async () => {
    const { storage, user } = await renderApp('/comptes');
    const banksCard = within(screen.getByRole('heading', { name: 'Banques' }).closest('section') as HTMLElement);
    await user.click(banksCard.getByRole('button', { name: '+ LCL' }));
    await banksCard.findByRole('button', { name: /retirer lcl/i });

    await user.click(screen.getByRole('button', { name: /nouveau compte/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau compte/i });
    await user.type(within(dialog).getByLabelText(/nom du compte/i), 'Livret LCL');
    await user.selectOptions(within(dialog).getByLabelText(/^banque/i), 'LCL');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    const accountRow = (await screen.findByText('Livret LCL')).closest('button') as HTMLElement;
    await within(accountRow).findByRole('img', { name: 'LCL' });

    await user.click(banksCard.getByRole('button', { name: /retirer lcl/i }));

    expect(screen.queryByRole('img', { name: 'LCL' })).not.toBeInTheDocument();
    expect(storage.stored?.accounts.find((account) => account.name === 'Livret LCL')?.bankId).toBeUndefined();
  });

  it('rattache un prêt existant à une banque, affichée sur sa carte', async () => {
    const { storage, user } = await renderApp('/comptes');
    const banksCard = within(screen.getByRole('heading', { name: 'Banques' }).closest('section') as HTMLElement);
    await user.click(banksCard.getByRole('button', { name: '+ LCL' }));
    await banksCard.findByRole('button', { name: /retirer lcl/i });

    await user.click(mobileNav().getByRole('link', { name: /prêts/i }));
    await user.click(await screen.findByRole('button', { name: /nouveau prêt/i }));
    const dialog = await screen.findByRole('dialog', { name: /nouveau prêt/i });
    await user.type(within(dialog).getByLabelText(/nom du prêt/i), 'Prêt LCL');
    await user.type(within(dialog).getByLabelText(/capital restant dû/i), '10000');
    await user.type(within(dialog).getByLabelText(/taux annuel/i), '0');
    await user.type(within(dialog).getByLabelText(/mensualité \(hors assurance\)/i), '500');
    await user.selectOptions(within(dialog).getByLabelText(/banque prêteuse/i), 'LCL');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('img', { name: 'LCL' })).toBeInTheDocument();
    expect(storage.stored?.loans[0].bankId).toBe(storage.stored?.banks[0]?.id);
  });
});

describe('Biens immobiliers loués', () => {
  const withLoan = (): PatrimoineData => ({
    ...seeded(),
    loans: [
      {
        id: 'loan1',
        name: 'Prêt secondaire',
        kind: 'MORTGAGE',
        principal: 10_000_000,
        annualRate: 0,
        monthlyPayment: 100_000,
        firstPaymentDate: '2027-01-05',
      },
    ],
  });

  const propertiesCard = () =>
    within(screen.getByRole('heading', { name: 'Biens immobiliers loués' }).closest('section') as HTMLElement);

  it('ajoute un bien rattaché à un prêt, montre son coussin net et l’additionne à la bannière', async () => {
    const { storage, user } = await renderApp('/comptes', withLoan());
    const card = propertiesCard();

    await user.click(card.getByRole('button', { name: /ajouter/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau bien' });
    await user.type(within(dialog).getByLabelText(/nom du bien/i), 'Appartement loué');
    await user.type(within(dialog).getByLabelText(/valeur estimée/i), '200000');
    const fee = within(dialog).getByLabelText(/^frais de vente/i);
    await user.clear(fee);
    await user.type(fee, '8');
    await user.selectOptions(within(dialog).getByLabelText(/prêt rattaché/i), 'Prêt secondaire');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    // 200 000 € - 100 000 € (capital restant dû, rien remboursé) - 16 000 € (8 %) = 84 000 €
    expect(await card.findByText(euros('84 000,00 €'))).toBeInTheDocument();
    expect(storage.stored?.properties[0]).toMatchObject({
      name: 'Appartement loué',
      estimatedValue: 20_000_000,
      loanId: 'loan1',
      sellingFeePercent: 8,
    });

    await user.click(mobileNav().getByRole('link', { name: /accueil/i }));
    const banner = within(await screen.findByRole('region', { name: 'Patrimoine' }));
    expect(banner.getByText(/coussin immobilier/i)).toHaveTextContent(euros('84 000,00 €'));
  });

  it('refuse une valeur estimée invalide', async () => {
    const { user } = await renderApp('/comptes', withLoan());
    await user.click(propertiesCard().getByRole('button', { name: /ajouter/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau bien' });
    await user.type(within(dialog).getByLabelText(/nom du bien/i), 'Appartement loué');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/valeur estimée invalide/i);
  });

  it('détache le bien quand son prêt est supprimé, sans supprimer le bien', async () => {
    const { storage, user } = await renderApp('/comptes', withLoan());
    const card = propertiesCard();
    await user.click(card.getByRole('button', { name: /ajouter/i }));
    let dialog = await screen.findByRole('dialog', { name: 'Nouveau bien' });
    await user.type(within(dialog).getByLabelText(/nom du bien/i), 'Appartement loué');
    await user.type(within(dialog).getByLabelText(/valeur estimée/i), '200000');
    await user.selectOptions(within(dialog).getByLabelText(/prêt rattaché/i), 'Prêt secondaire');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await card.findByText('Appartement loué');

    await user.click(mobileNav().getByRole('link', { name: /prêts/i }));
    await user.click(await screen.findByRole('button', { name: /prêt secondaire/i }));
    dialog = await screen.findByRole('dialog', { name: /modifier le prêt/i });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer le prêt' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la suppression' }));

    await user.click(mobileNav().getByRole('link', { name: /comptes/i }));
    await user.click(await propertiesCard().findByText('Appartement loué'));
    const editDialog = await screen.findByRole('dialog', { name: 'Modifier le bien' });
    expect(within(editDialog).getByLabelText(/prêt rattaché/i)).toHaveValue('');
    expect(storage.stored?.properties[0]).not.toHaveProperty('loanId');
  });
});

describe('Effort d’épargne', () => {
  const monthsAgo = (count: number, day = '05'): string => `${addMonths(monthKeyOfDate(new Date()), -count)}-${day}`;

  /** `monthlyAmountsEuros[0]` est le mois le plus ancien ; le dernier est le mois complet le plus récent (1 mois avant aujourd'hui). */
  const withSavingsHistory = (monthlyAmountsEuros: number[]): PatrimoineData => {
    const base = seeded();
    const movements: Movement[] = [...base.movements];
    monthlyAmountsEuros.forEach((amountEuros, index) => {
      movements.push({
        id: `sav-${index}`,
        accountId: 'a2', // Livret A
        type: 'DEPOSIT',
        amount: amountEuros * 100,
        date: monthsAgo(monthlyAmountsEuros.length - index),
      });
    });
    return { ...base, movements };
  };

  it('accède à la page depuis la navigation', async () => {
    const { user } = await renderApp('/', seeded());
    await user.click(mobileNav().getByRole('link', { name: /effort/i }));
    expect(await screen.findByRole('heading', { name: 'Effort d’épargne' })).toBeInTheDocument();
  });

  it('calcule l’objectif en direct pendant la saisie, avant d’enregistrer', async () => {
    const { user } = await renderApp('/effort', seeded());

    await user.click(screen.getByRole('button', { name: /ajouter un revenu/i }));
    await user.type(screen.getByLabelText('Nom'), 'Salaire');
    await user.type(screen.getByLabelText(/montant net/i), '3000');
    const rate = screen.getByLabelText(/taux d'épargne cible/i);
    await user.clear(rate);
    await user.type(rate, '20');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(euros('3 000,00'));
    expect(status).toHaveTextContent(/objectif d'épargne libre : 600,00.*20 %/i);
  });

  it('enregistre les revenus et le taux, puis les relit à la réouverture', async () => {
    const { storage, user } = await renderApp('/effort', seeded());

    await user.click(screen.getByRole('button', { name: /ajouter un revenu/i }));
    await user.type(screen.getByLabelText('Nom'), 'Salaire');
    await user.type(screen.getByLabelText(/montant net/i), '3000');
    const rate = screen.getByLabelText(/taux d'épargne cible/i);
    await user.clear(rate);
    await user.type(rate, '20');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(storage.stored?.savingsEffort).toEqual({
      incomeSources: [{ name: 'Salaire', monthlyAmount: 300_000 }],
      targetRatePercent: 20,
    });
    expect(await screen.findByRole('heading', { name: 'Synthèse de l’effort d’épargne' })).toBeInTheDocument();
  });

  it('ignore une ligne de revenu vide et refuse une ligne incomplète', async () => {
    const { storage, user } = await renderApp('/effort', seeded());

    await user.click(screen.getByRole('button', { name: /ajouter un revenu/i }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(storage.stored?.savingsEffort).toEqual({ incomeSources: [], targetRatePercent: 15 });

    await user.click(screen.getByRole('button', { name: /ajouter un revenu/i }));
    await user.type(screen.getAllByLabelText('Nom')[0], 'Salaire');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/revenu 1.*nom et un montant/i);
  });

  it('n’affiche pas de ligne sous la bannière tant que rien n’est configuré', async () => {
    await renderApp('/', seeded());
    await screen.findByRole('region', { name: 'Patrimoine' });
    expect(screen.queryByRole('link', { name: /coussin immobilier|objectif/i })).not.toBeInTheDocument();
  });

  it('affiche l’effort réalisé sous la bannière, avec un lien vers le détail', async () => {
    const data: PatrimoineData = {
      ...withSavingsHistory([1_000, 1_000, 1_000]), // 1 000 €/mois sur les 3 derniers mois complets
      savingsEffort: { incomeSources: [{ name: 'Salaire', monthlyAmount: 300_000 }], targetRatePercent: 20 },
    };
    await renderApp('/', data);

    // objectif = 20 % de 3 000 € (aucun prêt, aucune dépense de poste) = 600 €/mois ; réalisé 1 000 € : au-dessus
    const banner = await screen.findByRole('link', { name: /600,00/ });
    expect(banner).toHaveTextContent(euros('1 000,00'));
    expect(banner).toHaveAttribute('href', '/effort');
  });

  it('propose de relever le taux cible quand le réalisé dépasse durablement l’objectif, et l’applique', async () => {
    const data: PatrimoineData = {
      ...withSavingsHistory([1_000, 1_000, 1_000, 1_000, 1_000, 1_000]), // 6 mois à 1 000 €
      savingsEffort: { incomeSources: [{ name: 'Salaire', monthlyAmount: 300_000 }], targetRatePercent: 20 },
    };
    const { storage, user } = await renderApp('/effort', data);

    const recalibrationHeading = await screen.findByRole('heading', { name: 'Un ajustement à envisager ?' });
    const card = within(recalibrationHeading.closest('section') as HTMLElement);
    expect(card.getByText(/20 %/).closest('span')).toHaveTextContent(/20 %.*35 %/);
    await user.click(card.getByRole('button', { name: /relever à 35 %/i }));

    expect(storage.stored?.savingsEffort?.targetRatePercent).toBe(35);
  });

  it('retire la configuration avec « Ne plus suivre »', async () => {
    const data: PatrimoineData = {
      ...seeded(),
      savingsEffort: { incomeSources: [{ name: 'Salaire', monthlyAmount: 300_000 }], targetRatePercent: 20 },
    };
    const { storage, user } = await renderApp('/effort', data);

    await user.click(screen.getByRole('button', { name: /ne plus suivre/i }));
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    expect(storage.stored && 'savingsEffort' in storage.stored).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Synthèse de l’effort d’épargne' })).not.toBeInTheDocument();
  });
});
