import { useCallback, useMemo } from 'react';
import { useFinancial } from '../context/FinancialContext';
import type { NewProperty, PropertyPatch } from '../domain/models/Property';
import { sumCents } from '../domain/services/FinancialMath';
import { propertyCushion } from '../domain/services/PropertyEngine';

export interface PropertyItem {
  id: string;
  name: string;
  estimatedValue: number;
  loanId?: string;
  sellingFeePercent: number;
  /** Valeur nette de revente aujourd'hui (coussin de sécurité, voir `PropertyEngine`). */
  cushion: number;
}

/** Biens immobiliers loués et leur coussin de sécurité (valeur nette de revente, non déblocable rapidement). */
export function useProperties() {
  const { properties, loans, propertyRepository } = useFinancial();

  const items = useMemo<PropertyItem[]>(() => {
    const now = new Date();
    return properties.map((property) => ({ ...property, cushion: propertyCushion(property, loans, now) }));
  }, [properties, loans]);

  const totalCushion = useMemo(() => sumCents(items.map((item) => item.cushion)), [items]);

  const createProperty = useCallback((input: NewProperty) => propertyRepository.create(input), [propertyRepository]);
  const updateProperty = useCallback(
    (id: string, patch: PropertyPatch) => propertyRepository.update(id, patch),
    [propertyRepository],
  );
  const removeProperty = useCallback((id: string) => propertyRepository.remove(id), [propertyRepository]);

  return { items, totalCushion, createProperty, updateProperty, removeProperty };
}
