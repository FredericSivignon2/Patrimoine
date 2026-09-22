import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidDataError } from '../../domain/models/errors';
import { DATA_VERSION, type PatrimoineData } from '../../domain/models/PatrimoineData';
import { FakeDriveClient } from '../../test/FakeDriveClient';
import { ConflictError } from '../gdrive/errors';
import { DriveStorageDriver } from './DriveStorageDriver';
import { parsePatrimoineJson, serializePatrimoineData } from './parsePatrimoineData';

const dataWith = (name: string): PatrimoineData => ({
  version: DATA_VERSION,
  accounts: [{ id: name, name, type: 'CHECKING', initialBalance: 0 }],
  movements: [],
  budgets: [],
  loans: [],
  banks: [],
  properties: [],
});

let client: FakeDriveClient;
let fileId: string;

beforeEach(() => {
  client = new FakeDriveClient();
  fileId = client.seed('patrimoine_data.json', serializePatrimoineData(dataWith('distant')));
});

describe('DriveStorageDriver', () => {
  it('charge le contenu du fichier et mémorise sa somme de contrôle', async () => {
    const driver = new DriveStorageDriver(client, fileId);
    expect(await driver.load()).toEqual(dataWith('distant'));
    expect(driver.checksum).toBe('v1');
  });

  it('traite un fichier vide comme une absence de données', async () => {
    const emptyId = client.seed('patrimoine_data.json', '  ');
    expect(await new DriveStorageDriver(client, emptyId).load()).toBeNull();
  });

  it('refuse un contenu invalide', async () => {
    const badId = client.seed('patrimoine_data.json', '{"accounts": 3}');
    await expect(new DriveStorageDriver(client, badId).load()).rejects.toBeInstanceOf(InvalidDataError);
  });

  it('enregistre quand le fichier n’a pas bougé', async () => {
    const driver = new DriveStorageDriver(client, fileId);
    await driver.load();
    await driver.save(dataWith('local'));

    expect(parsePatrimoineJson(client.remoteText(fileId))).toEqual(dataWith('local'));
    expect(driver.checksum).toBe('v2');
    await driver.save(dataWith('local 2')); // la somme de contrôle suivie permet d'enchaîner les envois
    expect(parsePatrimoineJson(client.remoteText(fileId))).toEqual(dataWith('local 2'));
  });

  it('refuse d’écraser un fichier modifié ailleurs', async () => {
    const driver = new DriveStorageDriver(client, fileId);
    await driver.load();
    client.externalEdit(fileId, dataWith('autre utilisateur'));

    await expect(driver.save(dataWith('local'))).rejects.toBeInstanceOf(ConflictError);
    expect(parsePatrimoineJson(client.remoteText(fileId))).toEqual(dataWith('autre utilisateur'));
  });

  it('refuse d’enregistrer sans avoir lu le fichier', async () => {
    await expect(new DriveStorageDriver(client, fileId).save(dataWith('local'))).rejects.toBeInstanceOf(ConflictError);
  });

  it('écrase le fichier sur demande explicite', async () => {
    const driver = new DriveStorageDriver(client, fileId);
    await driver.load();
    client.externalEdit(fileId, dataWith('autre utilisateur'));

    await driver.overwrite(dataWith('local'));
    expect(parsePatrimoineJson(client.remoteText(fileId))).toEqual(dataWith('local'));
    expect(await driver.hasRemoteChanged()).toBe(false);
  });
});
