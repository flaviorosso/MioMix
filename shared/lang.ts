/** Idiomas do site. Alemão é o padrão (e a versão juridicamente válida). */
export const LANGS = ['de', 'pt', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'de';

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);
export const normalizeLang = (v: unknown): Lang => (isLang(v) ? v : DEFAULT_LANG);

/** Locale para datas e valores em cada idioma. */
export const LOCALE: Record<Lang, string> = { de: 'de-DE', pt: 'pt-BR', en: 'en-GB' };

/** Locale da página de pagamento do Stripe. */
export const STRIPE_LOCALE: Record<Lang, 'de' | 'pt-BR' | 'en'> = { de: 'de', pt: 'pt-BR', en: 'en' };

/** Tradução de um sabor em um idioma (campos vazios = usar o alemão). */
export interface FlavorTranslation {
  name?: string;
  description?: string;
  allergens?: string[];
}
export type FlavorTranslations = Partial<Record<Exclude<Lang, 'de'>, FlavorTranslation>>;

/** Lê o campo `translations` vindo do banco (texto JSON ou objeto). */
export function parseTranslations(raw: unknown): FlavorTranslations {
  // Pode chegar como texto JSON (às vezes codificado duas vezes) ou já como objeto.
  let value = raw;
  for (let i = 0; i < 3 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};
  const out: FlavorTranslations = {};
  for (const lang of ['pt', 'en'] as const) {
    const t = (value as Record<string, unknown>)[lang];
    if (!t || typeof t !== 'object') continue;
    const { name, description, allergens } = t as Record<string, unknown>;
    out[lang] = {
      name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
      description: typeof description === 'string' && description.trim() ? description.trim() : undefined,
      allergens: Array.isArray(allergens)
        ? allergens.filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => a.trim())
        : undefined,
    };
  }
  return out;
}

/** Nome/descrição/alérgenos no idioma pedido, com o alemão como reserva. */
export function localizeFlavor(
  base: { name: string; description?: string | null; allergens?: readonly (string | null)[] | null },
  translations: unknown,
  lang: Lang,
): { name: string; description: string; allergens: string[] } {
  const de = {
    name: base.name,
    description: base.description ?? '',
    allergens: (base.allergens ?? []).filter((a): a is string => !!a),
  };
  if (lang === 'de') return de;
  const t = parseTranslations(translations)[lang];
  return {
    name: t?.name ?? de.name,
    description: t?.description ?? de.description,
    // Lista traduzida vazia só vale se o original também for vazio ("keine").
    allergens: t?.allergens && (t.allergens.length > 0 || de.allergens.length === 0) ? t.allergens : de.allergens,
  };
}
