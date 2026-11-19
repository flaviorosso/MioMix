import { client } from './amplify';
import type { FlavorView, PickupPointView } from './types';

/** Sabores ativos com estoque > 0, na ordem definida pela gelateria. */
export async function fetchFlavors(): Promise<FlavorView[]> {
  const { data, errors } = await client.models.Flavor.list({
    filter: { active: { eq: true } },
    selectionSet: ['id', 'name', 'description', 'allergens', 'translations', 'color', 'sortOrder', 'stock.quantity'],
    limit: 200,
  });
  if (errors?.length) throw new Error(errors[0].message);
  return [...data]
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
    .map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description ?? '',
      allergens: (f.allergens ?? []).filter((a): a is string => !!a),
      translations: f.translations,
      color: f.color,
      stock: f.stock?.quantity ?? 0,
    }))
    .filter((f) => f.stock > 0);
}

export async function fetchPickupPoints(): Promise<PickupPointView[]> {
  const { data, errors } = await client.models.PickupPoint.list();
  if (errors?.length) throw new Error(errors[0].message);
  return data
    .filter((p) => p.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((p) => ({
      code: p.code,
      name: p.name,
      address: p.address ?? '',
      openingHours: p.openingHours ?? '',
      weeklyHours: p.weeklyHours,
    }));
}
