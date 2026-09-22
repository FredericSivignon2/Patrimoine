import type { NewProperty, Property, PropertyPatch } from '../models/Property';

export interface IPropertyRepository {
  list(): Promise<Property[]>;
  create(input: NewProperty): Promise<Property>;
  update(id: string, patch: PropertyPatch): Promise<Property>;
  remove(id: string): Promise<void>;
}
