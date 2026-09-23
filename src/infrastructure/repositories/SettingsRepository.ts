import type { SafetySettings } from '../../domain/models/Safety';
import type { SavingsEffortSettings } from '../../domain/models/SavingsEffort';
import type { ISettingsRepository } from '../../domain/repositories/ISettingsRepository';
import { validateSafety, validateSavingsEffort } from '../../domain/services/Validation';
import type { PatrimoineStore } from '../storage/PatrimoineStore';

export class SettingsRepository implements ISettingsRepository {
  constructor(private readonly store: PatrimoineStore) {}

  async getSafety(): Promise<SafetySettings | undefined> {
    return this.store.snapshot().safety;
  }

  saveSafety(settings: SafetySettings): Promise<SafetySettings> {
    return this.store.mutate((data) => {
      const safety = validateSafety(settings);
      return { next: { ...data, safety }, result: safety };
    });
  }

  clearSafety(): Promise<void> {
    return this.store.mutate((data) => {
      const { safety: _removed, ...rest } = data;
      return { next: rest, result: undefined };
    });
  }

  async getSavingsEffort(): Promise<SavingsEffortSettings | undefined> {
    return this.store.snapshot().savingsEffort;
  }

  saveSavingsEffort(settings: SavingsEffortSettings): Promise<SavingsEffortSettings> {
    return this.store.mutate((data) => {
      const savingsEffort = validateSavingsEffort(settings);
      return { next: { ...data, savingsEffort }, result: savingsEffort };
    });
  }

  clearSavingsEffort(): Promise<void> {
    return this.store.mutate((data) => {
      const { savingsEffort: _removed, ...rest } = data;
      return { next: rest, result: undefined };
    });
  }
}
