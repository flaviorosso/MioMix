export interface FlavorView {
  id: string;
  name: string;
  description: string;
  allergens: string[];
  color: string;
  stock: number;
}

export interface PickupPointView {
  code: string;
  name: string;
  address: string;
  openingHours: string;
}
