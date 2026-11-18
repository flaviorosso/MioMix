import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PFAND_CENTS } from '../../shared/pricing';
import { formatCents } from '../lib/format';
import { errorMessage, staffClient, type PfandBox } from './client';

export function PfandTab() {
  const [boxes, setBoxes] = useState<PfandBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PfandBox | null>(null);
  const [count, setCount] = useState('1');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const all: PfandBox[] = [];
    let nextToken: string | null | undefined;
    do {
      const res = await staffClient.models.PfandBox.list({ limit: 500, nextToken });
      if (res.errors?.length) {
        setMessage({ type: 'error', text: errorMessage(res.errors) });
        break;
      }
      all.push(...res.data);
      nextToken = res.nextToken;
    } while (nextToken);
    setBoxes(all.sort((a, b) => b.boxesInUse - a.boxesInUse || a.customerEmail.localeCompare(b.customerEmail)));
    setLoading(false);
    return all;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = q ? boxes.filter((b) => b.customerEmail.includes(q)) : boxes.filter((b) => b.boxesInUse > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const n = parseInt(count, 10);
    setSaving(true);
    setMessage(null);
    try {
      const res = await staffClient.mutations.registerPfandReturn({ customerEmail: selected.customerEmail, boxes: n });
      if (res.errors?.length || !res.data) {
        setMessage({ type: 'error', text: errorMessage(res.errors) });
        return;
      }
      setMessage({
        type: 'ok',
        text: `${n} Box(en) zurückgenommen. Neues Guthaben: ${formatCents(res.data.creditCents)} – wird bei der nächsten Bestellung verrechnet.`,
      });
      setCount('1');
      const all = await load();
      setSelected(all.find((b) => b.customerEmail === selected.customerEmail) ?? null);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Speichern fehlgeschlagen.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div className="staff-intro">
        <h2>Pfand-Boxen</h2>
        <p className="staff-hint">
          Box ohne Bestellung zurückgebracht? Kunde suchen und Rückgabe eintragen – pro Box {formatCents(PFAND_CENTS)}{' '}
          Guthaben für die nächste Bestellung.
        </p>
      </div>

      <label className="field">
        <span>E-Mail suchen</span>
        <input
          type="search"
          inputMode="email"
          value={query}
          placeholder="kunde@example.com"
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setMessage(null);
          }}
        />
      </label>

      {loading && <p className="status">Wird geladen …</p>}

      {!loading && (
        <div className="pfand-list">
          {!q && <p className="staff-hint">Kunden mit Boxen in Benutzung:</p>}
          {filtered.length === 0 && <p className="status">{q ? 'Keine Treffer.' : 'Keine Boxen in Benutzung.'}</p>}
          {filtered.map((b) => (
            <button
              key={b.customerEmail}
              type="button"
              className={`card pfand-row${selected?.customerEmail === b.customerEmail ? ' is-active' : ''}`}
              onClick={() => {
                setSelected(b);
                setMessage(null);
              }}
            >
              <span className="pfand-row__email">{b.customerEmail}</span>
              <span className="pfand-row__stats">
                {b.boxesInUse} in Benutzung · {b.boxesReturned} zurück · Guthaben {formatCents(b.creditCents)}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <form className="card form" onSubmit={submit}>
          <h3>Rückgabe für {selected.customerEmail}</h3>
          <label className="field">
            <span>Anzahl zurückgebrachter Boxen</span>
            <input
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </label>
          <button
            type="submit"
            className="btn btn--primary btn--small"
            disabled={saving || !(parseInt(count, 10) >= 1) || selected.boxesInUse < 1}
          >
            {saving ? 'Wird gespeichert …' : 'Rückgabe eintragen'}
          </button>
          {selected.boxesInUse < 1 && <p className="staff-hint">Dieser Kunde hat keine Box in Benutzung.</p>}
        </form>
      )}

      {message && (
        <p className={message.type === 'ok' ? 'form__ok' : 'form__error'} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
