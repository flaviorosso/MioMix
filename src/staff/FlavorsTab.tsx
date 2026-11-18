import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Cup } from '../components/Cup';
import { errorMessage, staffClient, todayBerlin } from './client';

interface FlavorRow {
  id: string;
  name: string;
  description: string;
  allergens: string[];
  color: string;
  active: boolean;
  sortOrder: number;
}

interface Draft {
  name: string;
  description: string;
  allergens: string;
  color: string;
  sortOrder: string;
}

const emptyDraft = (sortOrder: number): Draft => ({
  name: '',
  description: '',
  allergens: '',
  color: '#E8C9A0',
  sortOrder: String(sortOrder),
});

const toDraft = (f: FlavorRow): Draft => ({
  name: f.name,
  description: f.description,
  allergens: f.allergens.join(', '),
  color: f.color,
  sortOrder: String(f.sortOrder),
});

const parseAllergens = (s: string) =>
  s
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

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

  if (loading) return <p className="status">Wird geladen …</p>;

  const nextSort = Math.max(0, ...flavors.map((f) => (f.sortOrder < 999 ? f.sortOrder : 0))) + 1;

  return (
    <section>
      <div className="staff-intro staff-intro--row">
        <div>
          <h2>Sorten</h2>
          <p className="staff-hint">Inaktive Sorten und Sorten ohne Bestand sehen Kunden nicht.</p>
        </div>
        {editing !== 'new' && (
          <button type="button" className="btn btn--primary btn--small" onClick={() => setEditing('new')}>
            Neue Sorte
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
        {flavors.map((f) =>
          editing === f.id ? (
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
                <p className="staff-hint">Allergene: {f.allergens.join(', ') || 'keine'}</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={f.active} onChange={() => void toggleActive(f)} />
                <span>{f.active ? 'aktiv' : 'inaktiv'}</span>
              </label>
              <button type="button" className="link-btn" onClick={() => setEditing(f.id)}>
                Bearbeiten
              </button>
            </div>
          ),
        )}
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
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isNew = !id;

  const set = (key: keyof Draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const name = draft.name.trim();
    if (name.length < 2) return setError('Bitte einen Namen angeben.');
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.color)) return setError('Ungültige Farbe.');
    const fields = {
      name,
      description: draft.description.trim(),
      allergens: parseAllergens(draft.allergens),
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
      setError('Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card form flavor-form" onSubmit={submit}>
      <div className="flavor-form__head">
        <Cup color={draft.color} size={48} />
        <h3>{isNew ? 'Neue Sorte' : 'Sorte bearbeiten'}</h3>
      </div>
      <label className="field">
        <span>Name</span>
        <input value={draft.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className="field">
        <span>Beschreibung</span>
        <input value={draft.description} onChange={(e) => set('description', e.target.value)} />
      </label>
      <label className="field">
        <span>Allergene (mit Komma getrennt)</span>
        <input
          value={draft.allergens}
          placeholder="z. B. Milch, Schalenfrüchte (Haselnüsse)"
          onChange={(e) => set('allergens', e.target.value)}
        />
      </label>
      <div className="flavor-form__row">
        <label className="field">
          <span>Farbe</span>
          <input type="color" value={draft.color} onChange={(e) => set('color', e.target.value)} />
        </label>
        <label className="field">
          <span>Reihenfolge</span>
          <input
            inputMode="numeric"
            value={draft.sortOrder}
            onChange={(e) => set('sortOrder', e.target.value.replace(/[^0-9]/g, ''))}
          />
        </label>
      </div>
      {isNew && <p className="staff-hint">Neue Sorten starten mit Bestand 0 – danach unter „Bestand“ eintragen.</p>}
      {error && <p className="form__error">{error}</p>}
      <div className="order__actions">
        <button type="submit" className="btn btn--primary btn--small" disabled={saving}>
          {saving ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel} disabled={saving}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
