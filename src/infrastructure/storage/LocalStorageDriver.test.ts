import { describe, expect, it, vi } from 'vitest';
import { DATA_VERSION, type PatrimoineData } from '../../domain/models/PatrimoineData';
import { LOCAL_STORAGE_KEY, LocalStorageDriver } from './LocalStorageDriver';

const data: PatrimoineData = {
  version: DATA_VERSION,
  accounts: [{ id: 'a1', name: 'Livret', type: 'SAVINGS', initialBalance: 100 }],
  movements: [],
  budgets: [{ id: 'b1', name: 'Vacances', percent: 30 }],
  loans: [
    {
      id: 'l1',
      name: 'Prêt conso',
      kind: 'CONSUMER',
      principal: 500_000,
      annualRate: 4.9,
      monthlyPayment: 20_000,
      firstPaymentDate: '2026-10-05',
    },
  ],
  banks: [],
  properties: [],
};

describe('LocalStorageDriver', () => {
  it('renvoie null quand rien n’a été enregistré', async () => {
    expect(await new LocalStorageDriver().load()).toBeNull();
  });

  it('enregistre puis relit les données', async () => {
    const driver = new LocalStorageDriver();
    await driver.save(data);
    expect(await new LocalStorageDriver().load()).toEqual(data);
  });

  it('conserve une copie d’un contenu illisible au lieu de le perdre', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.localStorage.setItem(LOCAL_STORAGE_KEY, '{pas du json');

    expect(await new LocalStorageDriver().load()).toBeNull();

    const backups = Object.keys(window.localStorage).filter((key) => key.startsWith(`${LOCAL_STORAGE_KEY}.corrompu.`));
    expect(backups).toHaveLength(1);
    expect(window.localStorage.getItem(backups[0])).toBe('{pas du json');
    vi.restoreAllMocks();
  });
});
