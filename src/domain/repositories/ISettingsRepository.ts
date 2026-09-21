import type { SafetySettings } from '../models/Safety';

export interface ISettingsRepository {
  getSafety(): Promise<SafetySettings | undefined>;
  saveSafety(settings: SafetySettings): Promise<SafetySettings>;
  clearSafety(): Promise<void>;
}
