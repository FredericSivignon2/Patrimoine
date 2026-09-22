import { NotFoundError } from '../../domain/models/errors';
import type { NewProperty, Property, PropertyPatch } from '../../domain/models/Property';
import type { IPropertyRepository } from '../../domain/repositories/IPropertyRepository';
import { newId } from '../../domain/services/ids';
import { validateProperty } from '../../domain/services/Validation';
import type { PatrimoineStore } from '../storage/PatrimoineStore';

export class PropertyRepository implements IPropertyRepository {
  constructor(private readonly store: PatrimoineStore) {}

  async list(): Promise<Property[]> {
    return this.store.snapshot().properties;
  }

  create(input: NewProperty): Promise<Property> {
    return this.store.mutate((data) => {
      const property: Property = { id: newId(), ...validateProperty(input, data.loans, data.properties) };
      return { next: { ...data, properties: [...data.properties, property] }, result: property };
    });
  }

  update(id: string, patch: PropertyPatch): Promise<Property> {
    return this.store.mutate((data) => {
      const existing = data.properties.find((property) => property.id === id);
      if (!existing) throw new NotFoundError(`Bien introuvable : ${id}`);
      const { id: _id, ...current } = existing;
      const others = data.properties.filter((property) => property.id !== id);
      const updated: Property = { id, ...validateProperty({ ...current, ...patch }, data.loans, others) };
      return {
        next: { ...data, properties: data.properties.map((property) => (property.id === id ? updated : property)) },
        result: updated,
      };
    });
  }

  remove(id: string): Promise<void> {
    return this.store.mutate((data) => {
      if (!data.properties.some((property) => property.id === id)) throw new NotFoundError(`Bien introuvable : ${id}`);
      return { next: { ...data, properties: data.properties.filter((property) => property.id !== id) }, result: undefined };
    });
  }
}
