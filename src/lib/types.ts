export interface FlavorView {
  id: string;
  name: string;
  description: string;
  allergens: string[];
  translations: unknown; // traduções PT/EN (ver shared/lang.ts)
  color: string;
  stock: number;
}

export interface PickupPointView {
  code: string;
  name: string;
  address: string;
  openingHours: string;
  weeklyHours: unknown; // horário estruturado (ver shared/hours.ts)
}
