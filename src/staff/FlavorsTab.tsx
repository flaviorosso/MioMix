import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { parseTranslations, type FlavorTranslations } from '../../shared/lang';
import { Cup } from '../components/Cup';
import { useStaffI18n } from '../i18n/staff';
import { errorMessage, staffClient, todayBerlin } from './client';

interface FlavorRow {
  id: string;
  name: string;
  description: string;
  allergens: string[];
  translations: FlavorTranslations;
  color: string;
  active: boolean;
  sortOrder: number;
}

/** Textos de um idioma no formulário. */
interface TextDraft {
  name: string;
  description: string;
  allergens: string;
}

interface Draft {
  de: TextDraft;
  pt: TextDraft;
  en: TextDraft;
  color: string;
  sortOrder: string;
}

const emptyText = (): TextDraft => ({ name: '', description: '', allergens: '' });

const emptyDraft = (sortOrder: number): Draft => ({
  de: emptyText(),
  pt: emptyText(),
  en: emptyText(),
  color: '#E8C9A0',
  sortOrder: String(sortOrder),
});

const toDraft = (f: FlavorRow): Draft => ({
  de: { name: f.name, description: f.description, allergens: f.allergens.join(', ') },
  pt: {
    name: f.translations.pt?.name ?? '',
    description: f.translations.pt?.description ?? '',
    allergens: (f.translations.pt?.allergens ?? []).join(', '),
  },
  en: {
    name: f.translations.en?.name ?? '',
    description: f.translations.en?.description ?? '',
    allergens: (f.translations.en?.allergens ?? []).join(', '),
  },
  color: f.color,
  sortOrder: String(f.sortOrder),
});

const parseAllergens = (s: string) =>
  s
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

/** Tradução de um idioma para gravar (campos vazios são omitidos → vale o alemão). */
const toTranslation = (t: TextDraft) => {
  const out: { name?: string; description?: string; allergens?: string[] } = {};
  if (t.name.trim()) out.name = t.name.trim();
  if (t.description.trim()) out.description = t.description.trim();
  const allergens = parseAllergens(t.allergens);
  if (allergens.length) out.allergens = allergens;
  return Object.keys(out).length ? out : undefined;
};

/** "Süße Mandel" → "suesse-mandel" (ID estável e legível). */
const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function FlavorsTab() {
  const { t: tt } = useStaffI18n();
  const t = tt.flavors;
  const [flavors, setFlavors] = useState<FlavorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // id ou 'new'
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await staffClient.models.Flavor.list({ limit: 500 });
    if (res.errors?.length) {
      setError(errorMessage(res.errors));
    } else {
      setFlavors(
        res.data
          .map((f) => ({
            id: f.id,
            name: f.name,
            description: f.description ?? '',
            allergens: (f.allergens ?? []).filter((a): a is string => !!a),
            translations: parseTranslations(f.translations),
            color: f.color,
            active: f.active,
            sortOrder: f.sortOrder ?? 999,
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (f: FlavorRow) => {
    setError('');
    setFlavors((fs) => fs.map((x) => (x.id === f.id ? { ...x, active: !f.active } : x)));
    const res = await staffClient.models.Flavor.update({ id: f.id, active: !f.active });
    if (res.errors?.length) {
      setError(errorMessage(res.errors));
      await load();
    }
  };

  if (loading) return <p className="status">{tt.loading}</p>;

  const nextSort = Math.max(0, ...flavors.map((f) => (f.sortOrder < 999 ? f.sortOrder : 0))) + 1;

  return (
    <section>
      <div className="staff-intro staff-intro--row">
        <div>
          <h2>{t.title}</h2>
          <p className="staff-hint">{t.hint}</p>
        </div>
        {editing !== 'new' && (
          <button type="button" className="btn btn--primary btn--small" onClick={() => setEditing('new')}>
            {t.newFlavor}
          </button>
        )}
      </div>

      {error && <p className="form__error">{error}</p>}

      {editing === 'new' && (
        <FlavorForm
          draft={emptyDraft(nextSort)}
          existingIds={flavors.map((f) => f.id)}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      <div className="flavor-admin-list">
        {flavors.map((f) => {
          const translated = (['pt', 'en'] as const).filter((l) => f.translations[l]?.name);
          return editing === f.id ? (
            <FlavorForm
              key={f.id}
              id={f.id}
              draft={toDraft(f)}
              existingIds={[]}
              onCancel={() => setEditing(null)}
              onSaved={async () => {
                setEditing(null);
                await load();
              }}
            />
          ) : (
            <div key={f.id} className={`flavor-admin card${f.active ? '' : ' is-inactive'}`}>
              <Cup color={f.color} size={44} />
              <div className="flavor-admin__info">
                <p className="stock-row__name">{f.name}</p>
                <p className="staff-hint">
                  {t.allergens}: {f.allergens.join(', ') || t.none}
                </p>
                <p className={`staff-hint${translated.length ? '' : ' staff-hint--warn'}`}>
                  {translated.length ? t.translated(translated.map((l) => l.toUpperCase()).join(', ')) : t.notTranslated}
                </p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={f.active} onChange={() => void toggleActive(f)} />
                <span>{f.active ? t.active : t.inactive}</span>
              </label>
              <button type="button" className="link-btn" onClick={() => setEditing(f.id)}>
                {t.edit}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface FlavorFormProps {
  id?: string;
  draft: Draft;
  existingIds: string[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

function FlavorForm({ id, draft: initial, existingIds, onCancel, onSaved }: FlavorFormProps) {
  const { t: tt } = useStaffI18n();
  const t = tt.flavors;
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isNew = !id;

  const setText = (lang: 'de' | 'pt' | 'en', key: keyof TextDraft, value: string) =>
    setDraft((d) => ({ ...d, [lang]: { ...d[lang], [key]: value } }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const name = draft.de.name.trim();
    if (name.length < 2) return setError(t.errName);
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.color)) return setError(t.errColor);
    const translations: FlavorTranslations = {};
    const pt = toTranslation(draft.pt);
    const en = toTranslation(draft.en);
    if (pt) translations.pt = pt;
    if (en) translations.en = en;
    const fields = {
      name,
      description: draft.de.description.trim(),
      allergens: parseAllergens(draft.de.allergens),
      translations: JSON.stringify(translations),
      color: draft.color,
      sortOrder: parseInt(draft.sortOrder, 10) || 999,
    };

    setSaving(true);
    try {
      if (isNew) {
        let newId = slugify(name) || 'sorte';
        for (let i = 2; existingIds.includes(newId); i++) newId = `${slugify(name)}-${i}`;
        const created = await staffClient.models.Flavor.create({ id: newId, ...fields, active: true });
        if (created.errors?.length) return setError(errorMessage(created.errors));
        // Estoque inicial 0: a sorte só aparece para clientes depois de ter Bestand.
        const stock = await staffClient.models.Stock.create({ flavorId: newId, quantity: 0, stockDate: todayBerlin() });
        if (stock.errors?.length) return setError(errorMessage(stock.errors));
      } else {
        const updated = await staffClient.models.Flavor.update({ id, ...fields });
        if (updated.errors?.length) return setError(errorMessage(updated.errors));
      }
      await onSaved();
    } catch (err) {
      console.error(err);
      setError(tt.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const textFields = (lang: 'de' | 'pt' | 'en', title: string, optional: boolean) => (
    <>
      <p className="flavor-form__lang">{title}</p>
      {optional && <p className="staff-hint">{t.emptyFallback}</p>}
      <label className="field">
        <span>{t.name}</span>
        <input
          value={draft[lang].name}
          placeholder={optional ? draft.de.name : undefined}
          onChange={(e) => setText(lang, 'name', e.target.value)}
        />
      </label>
      <label className="field">
        <span>{t.description}</span>
        <input
          value={draft[lang].description}
          placeholder={optional ? draft.de.description : undefined}
          onChange={(e) => setText(lang, 'description', e.target.value)}
        />
      </label>
      <label className="field">
        <span>{t.allergensField}</span>
        <input
          value={draft[lang].allergens}
          placeholder={optional ? draft.de.allergens : t.allergensPlaceholder}
          onChange={(e) => setText(lang, 'allergens', e.target.value)}
        />
      </label>
    </>
  );

  return (
    <form className="card form flavor-form" onSubmit={submit}>
      <div className="flavor-form__head">
        <Cup color={draft.color} size={48} />
        <h3>{isNew ? t.newFlavor : t.editFlavor}</h3>
      </div>
      {textFields('de', t.german, false)}
      <div className="flavor-form__row">
        <label className="field">
          <span>{t.color}</span>
          <input type="color" value={draft.color} onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} />
        </label>
        <label className="field">
          <span>{t.order}</span>
          <input
            inputMode="numeric"
            value={draft.sortOrder}
            onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value.replace(/[^0-9]/g, '') }))}
          />
        </label>
      </div>
      {textFields('pt', t.portuguese, true)}
      {textFields('en', t.english, true)}
      {isNew && <p className="staff-hint">{t.newHint}</p>}
      {error && <p className="form__error">{error}</p>}
      <div className="order__actions">
        <button type="submit" className="btn btn--primary btn--small" disabled={saving}>
          {saving ? tt.saving : tt.save}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel} disabled={saving}>
          {tt.cancel}
        </button>
      </div>
    </form>
  );
}
