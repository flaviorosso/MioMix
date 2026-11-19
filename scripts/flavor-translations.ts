import type { FlavorTranslations } from '../shared/lang';

/** Traduções PT/EN dos sabores de exemplo (editáveis depois na aba "Sorten"/"Sabores" do painel). */
export const FLAVOR_TRANSLATIONS: Record<string, FlavorTranslations> = {
  vanille: {
    pt: { name: 'Baunilha', description: 'Sorvete cremoso com baunilha Bourbon de verdade.', allergens: ['Leite', 'Ovo'] },
    en: { name: 'Vanilla', description: 'Creamy ice cream with real Bourbon vanilla.', allergens: ['Milk', 'Egg'] },
  },
  schokolade: {
    pt: { name: 'Chocolate', description: 'Chocolate amargo intenso.', allergens: ['Leite', 'Soja'] },
    en: { name: 'Chocolate', description: 'Intense dark chocolate.', allergens: ['Milk', 'Soy'] },
  },
  pistazie: {
    pt: { name: 'Pistache', description: 'Feito com pistaches da Sicília.', allergens: ['Leite', 'Castanhas (pistache)'] },
    en: { name: 'Pistachio', description: 'Made with Sicilian pistachios.', allergens: ['Milk', 'Tree nuts (pistachios)'] },
  },
  erdbeere: {
    pt: { name: 'Morango', description: 'Frutado, com morangos frescos.', allergens: ['Leite'] },
    en: { name: 'Strawberry', description: 'Fruity, with fresh strawberries.', allergens: ['Milk'] },
  },
  stracciatella: {
    pt: { name: 'Stracciatella', description: 'Sorvete de creme com raspas finas de chocolate.', allergens: ['Leite', 'Soja'] },
    en: { name: 'Stracciatella', description: 'Milk ice cream with fine chocolate shavings.', allergens: ['Milk', 'Soy'] },
  },
  haselnuss: {
    pt: { name: 'Avelã', description: 'Avelãs torradas do Piemonte.', allergens: ['Leite', 'Castanhas (avelãs)'] },
    en: { name: 'Hazelnut', description: 'Roasted hazelnuts from Piedmont.', allergens: ['Milk', 'Tree nuts (hazelnuts)'] },
  },
  zitrone: {
    pt: { name: 'Limão siciliano', description: 'Sorbet refrescante de limões da Costa Amalfitana. Vegano.', allergens: [] },
    en: { name: 'Lemon', description: 'Refreshing sorbet made with Amalfi lemons. Vegan.', allergens: [] },
  },
  mango: {
    pt: { name: 'Manga', description: 'Sorbet de manga ensolarado. Vegano.', allergens: [] },
    en: { name: 'Mango', description: 'Sunny mango sorbet. Vegan.', allergens: [] },
  },
};
