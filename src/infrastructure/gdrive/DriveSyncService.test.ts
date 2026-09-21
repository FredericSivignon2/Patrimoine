import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidDataError } from '../../domain/models/errors';
import { DATA_VERSION, type PatrimoineData } from '../../domain/models/PatrimoineData';
import { FakeDriveClient } from '../../test/FakeDriveClient';
import { AccountRepository } from '../repositories/AccountRepository';
import { MockStorageDriver } from '../storage/MockStorageDriver';
import { parsePatrimoineJson, serializePatrimoineData } from '../storage/parsePatrimoineData';
import { PatrimoineStore } from '../storage/PatrimoineStore';
import { BINDING_STORAGE_KEY, DriveSyncService, type BindingStorage } from './DriveSyncService';

const PUSH_DELAY = 100;

class MemoryStorage implements BindingStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const dataWith = (name: string): PatrimoineData => ({
  version: DATA_VERSION,
  accounts: [{ id: name, name, type: 'CHECKING', initialBalance: 0 }],
  movements: [],
  budgets: [],
  loans: [],
});
const names = (data: PatrimoineData): string[] => data.accounts.map((account) => account.name);

async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.advanceTimersByTimeAsync(0);
}

async function setup(initial: PatrimoineData | null = dataWith('local')) {
  const client = new FakeDriveClient();
  const store = new PatrimoineStore(new MockStorageDriver(initial));
  await store.load();
  const persistence = new MemoryStorage();
  const service = new DriveSyncService(store, client, persistence, PUSH_DELAY);
  service.start();
  return { client, store, persistence, service, accounts: new AccountRepository(store) };
}

/** Simule un redémarrage de l'application : nouveau service sur le même cache local et le même lien persistant. */
function restart(previous: Awaited<ReturnType<typeof setup>>) {
  previous.service.dispose();
  const service = new DriveSyncService(previous.store, previous.client, previous.persistence, PUSH_DELAY);
  service.start();
  return service;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('DriveSyncService', () => {
  it('est indisponible sans client Drive', async () => {
    const store = new PatrimoineStore(new MockStorageDriver());
    const service = new DriveSyncService(store, null, new MemoryStorage());
    expect(service.getState()).toEqual({ status: 'unavailable' });
    await expect(service.listCandidates()).rejects.toThrow();
  });

  it('démarre non lié et liste les fichiers trouvés', async () => {
    const { client, service } = await setup();
    const id = client.seed('patrimoine_data.json', serializePatrimoineData(dataWith('distant')));
    client.seed('autre.json', '{}');

    expect(service.getState()).toEqual({ status: 'unbound' });
    expect(await service.listCandidates()).toEqual([{ id, name: 'patrimoine_data.json' }]);
  });

  describe('création du fichier', () => {
    it('crée le fichier à partir des données locales et le lie', async () => {
      const { client, service, persistence } = await setup();
      await service.createAndLink();

      const [id] = [...client.files.keys()];
      expect(service.getState()).toEqual({ status: 'idle', fileId: id });
      expect(names(parsePatrimoineJson(client.remoteText(id)))).toEqual(['local']);
      expect(JSON.parse(persistence.getItem(BINDING_STORAGE_KEY) ?? 'null')).toEqual({
        fileId: id,
        checksum: 'v1',
        dirty: false,
      });
    });

    it('envoie les modifications locales après un court délai, en un seul envoi groupé', async () => {
      const { client, service, accounts } = await setup();
      await service.createAndLink();
      const [id] = [...client.files.keys()];

      await accounts.create({ name: 'B', type: 'SAVINGS', initialBalance: 100 });
      await accounts.create({ name: 'C', type: 'SAVINGS', initialBalance: 200 });
      expect(client.writes).toBe(1);

      await tick(PUSH_DELAY);
      expect(client.writes).toBe(2);
      expect(names(parsePatrimoineJson(client.remoteText(id)))).toEqual(['local', 'B', 'C']);
      expect(service.getState()).toEqual({ status: 'idle', fileId: id });
    });
  });

  describe('liaison à un fichier existant', () => {
    it('remplace les données locales par celles de Drive sans les renvoyer', async () => {
      const { client, store, service } = await setup();
      const id = client.seed('patrimoine_data.json', serializePatrimoineData(dataWith('distant')));

      await service.linkExisting(id);
      await tick(PUSH_DELAY * 3);

      expect(names(store.snapshot())).toEqual(['distant']);
      expect(client.writes).toBe(0);
      expect(service.getState()).toEqual({ status: 'idle', fileId: id });
    });

    it('ne lie rien si le fichier est illisible', async () => {
      const { client, store, service, persistence } = await setup();
      const id = client.seed('patrimoine_data.json', '{oups');

      await expect(service.linkExisting(id)).rejects.toBeInstanceOf(InvalidDataError);

      expect(service.getState()).toEqual({ status: 'unbound' });
      expect(names(store.snapshot())).toEqual(['local']);
      expect(persistence.getItem(BINDING_STORAGE_KEY)).toBeNull();
    });

    it('traite un fichier vide comme des données vierges', async () => {
      const { client, store, service } = await setup();
      await service.linkExisting(client.seed('patrimoine_data.json', ''));
      expect(store.snapshot().accounts).toEqual([]);
    });
  });

  describe('conflits', () => {
    async function linkedWithRemoteEdit() {
      const context = await setup();
      await context.service.createAndLink();
      const [id] = [...context.client.files.keys()];
      context.client.externalEdit(id, dataWith('distant'));
      await context.accounts.create({ name: 'B', type: 'SAVINGS', initialBalance: 0 });
      await tick(PUSH_DELAY);
      return { ...context, id };
    }

    it('détecte un fichier modifié ailleurs et ne l’écrase pas', async () => {
      const { client, service, id } = await linkedWithRemoteEdit();
      expect(service.getState()).toEqual({ status: 'conflict', fileId: id });
      expect(names(parsePatrimoineJson(client.remoteText(id)))).toEqual(['distant']);
    });

    it('recharge la version Drive sur demande', async () => {
      const { store, service, id } = await linkedWithRemoteEdit();
      await service.pull();
      expect(names(store.snapshot())).toEqual(['distant']);
      expect(service.getState()).toEqual({ status: 'idle', fileId: id });
    });

    it('écrase Drive avec la version locale sur demande', async () => {
      const { client, service, id } = await linkedWithRemoteEdit();
      await service.forcePush();
      expect(names(parsePatrimoineJson(client.remoteText(id)))).toEqual(['local', 'B']);
      expect(service.getState()).toEqual({ status: 'idle', fileId: id });
    });

    it('n’envoie plus rien tant que le conflit n’est pas résolu', async () => {
      const { client, accounts } = await linkedWithRemoteEdit();
      const writes = client.writes;
      await accounts.create({ name: 'C', type: 'SAVINGS', initialBalance: 0 });
      await tick(PUSH_DELAY * 3);
      expect(client.writes).toBe(writes);
    });
  });

  describe('reprise après redémarrage', () => {
    async function linkedThenRestarted() {
      const context = await setup();
      await context.service.createAndLink();
      const [id] = [...context.client.files.keys()];
      const service = restart(context);
      return { ...context, service, id };
    }

    it('demande une reconnexion tant que la session Google n’est pas rétablie', async () => {
      const { service, id } = await linkedThenRestarted();
      expect(service.getState()).toEqual({ status: 'auth-required', fileId: id });
    });

    it('récupère les changements de Drive quand rien n’est en attente en local', async () => {
      const { client, store, service, id } = await linkedThenRestarted();
      client.externalEdit(id, dataWith('distant'));

      await service.resume();

      expect(names(store.snapshot())).toEqual(['distant']);
      expect(service.getState()).toEqual({ status: 'idle', fileId: id });
    });

    it('envoie les modifications faites hors connexion si Drive n’a pas bougé', async () => {
      const { client, service, accounts, id } = await linkedThenRestarted();
      await accounts.create({ name: 'B', type: 'SAVINGS', initialBalance: 0 });
      await tick(PUSH_DELAY * 3);
      expect(client.writes).toBe(1); // rien d'envoyé sans session

      await service.resume();

      expect(names(parsePatrimoineJson(client.remoteText(id)))).toEqual(['local', 'B']);
      expect(service.getState()).toEqual({ status: 'idle', fileId: id });
    });

    it('signale un conflit si Drive et le local ont tous deux changé', async () => {
      const { client, store, service, accounts, id } = await linkedThenRestarted();
      await accounts.create({ name: 'B', type: 'SAVINGS', initialBalance: 0 });
      client.externalEdit(id, dataWith('distant'));

      await service.resume();

      expect(service.getState()).toEqual({ status: 'conflict', fileId: id });
      expect(names(store.snapshot())).toEqual(['local', 'B']);
      expect(names(parsePatrimoineJson(client.remoteText(id)))).toEqual(['distant']);
    });
  });

  describe('erreurs', () => {
    it('demande une reconnexion quand la session expire pendant un envoi, puis reprend', async () => {
      const { client, service, accounts } = await setup();
      await service.createAndLink();
      const [id] = [...client.files.keys()];

      client.authExpired = true;
      await accounts.create({ name: 'B', type: 'SAVINGS', initialBalance: 0 });
      await tick(PUSH_DELAY);
      expect(service.getState()).toEqual({ status: 'auth-required', fileId: id });

      client.authExpired = false;
      await service.resume();
      expect(names(parsePatrimoineJson(client.remoteText(id)))).toEqual(['local', 'B']);
      expect(service.getState()).toEqual({ status: 'idle', fileId: id });
    });

    it('passe en erreur sur un incident réseau puis réessaie', async () => {
      const { client, service, accounts } = await setup();
      await service.createAndLink();
      const [id] = [...client.files.keys()];

      client.failNext = new Error('réseau coupé');
      await accounts.create({ name: 'B', type: 'SAVINGS', initialBalance: 0 });
      await tick(PUSH_DELAY);
      expect(service.getState()).toEqual({ status: 'error', fileId: id, message: 'réseau coupé' });

      await service.retry();
      expect(names(parsePatrimoineJson(client.remoteText(id)))).toEqual(['local', 'B']);
      expect(service.getState()).toEqual({ status: 'idle', fileId: id });
    });

    it('signale une déconnexion volontaire', async () => {
      const { service } = await setup();
      await service.createAndLink();
      service.markSignedOut();
      expect(service.getState().status).toBe('auth-required');
    });
  });

  it('se délie en conservant les données locales', async () => {
    const { client, store, service, persistence, accounts } = await setup();
    await service.createAndLink();
    service.unlink();

    expect(service.getState()).toEqual({ status: 'unbound' });
    expect(persistence.getItem(BINDING_STORAGE_KEY)).toBeNull();

    const writes = client.writes;
    await accounts.create({ name: 'B', type: 'SAVINGS', initialBalance: 0 });
    await tick(PUSH_DELAY * 3);
    expect(client.writes).toBe(writes);
    expect(names(store.snapshot())).toEqual(['local', 'B']);
  });

  it('notifie les abonnés à chaque changement d’état', async () => {
    const { service } = await setup();
    const listener = vi.fn();
    service.subscribe(listener);
    await service.createAndLink();
    expect(listener).toHaveBeenCalled();
  });
});
