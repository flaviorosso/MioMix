import { useCallback, useEffect, useState } from 'react';
import {
  WEEKDAYS_DE_LONG,
  formatWeeklyHours,
  parseWeeklyHours,
  validateWeeklyHours,
  type OpeningDay,
} from '../../shared/hours';
import { errorMessage, staffClient } from './client';

/** Um dia no formulário (inclui os fechados, para poder reabrir). */
interface DayDraft {
  open: boolean;
  from: string;
  to: string;
}

interface PointRow {
  code: string;
  name: string;
  address: string;
  days: DayDraft[]; // 7 entradas, 0 = Montag
}

const toDrafts = (hours: OpeningDay[]): DayDraft[] =>
  Array.from({ length: 7 }, (_, day) => {
    const d = hours.find((h) => h.day === day);
    return d ? { open: true, from: d.open, to: d.close } : { open: false, from: '11:00', to: '21:00' };
  });

const toHours = (days: DayDraft[]): OpeningDay[] =>
  days.flatMap((d, day) => (d.open ? [{ day, open: d.from, close: d.to }] : []));

export function PickupPointsTab() {
  const [points, setPoints] = useState<PointRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await staffClient.models.PickupPoint.list({ limit: 100 });
      if (res.errors?.length) throw new Error(errorMessage(res.errors));
      setPoints(
        res.data
          .map((p) => ({
            code: p.code,
            name: p.name,
            address: p.address ?? '',
            days: toDrafts(parseWeeklyHours(p.weeklyHours)),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setLoadError('');
    } catch (err) {
      console.error(err);
      setLoadError('Abholorte konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="staff-intro">
        <h2>Abholorte</h2>
        <p className="staff-hint">
          Öffnungszeiten je Wochentag. Fällt das Abholende (24 h nach Zahlung) in eine geschlossene Zeit, gilt die
          Bestellung bis zum Ladenschluss des nächsten Öffnungstags.
        </p>
      </div>
      {loading && <p className="status">Wird geladen …</p>}
      {loadError && <p className="form__error">{loadError}</p>}
      <div className="point-list">
        {points.map((p) => (
          <PointCard key={p.code} point={p} onSaved={load} />
        ))}
      </div>
    </section>
  );
}

function PointCard({ point, onSaved }: { point: PointRow; onSaved: () => Promise<void> }) {
  const [days, setDays] = useState<DayDraft[]>(point.days);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => setDays(point.days), [point.days]);

  const setDay = (i: number, patch: Partial<DayDraft>) => {
    setOk('');
    setDays((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  };

  const hours = toHours(days);
  const preview = formatWeeklyHours(hours) || 'Geschlossen';

  const save = async () => {
    const invalid = validateWeeklyHours(hours);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await staffClient.models.PickupPoint.update({
        code: point.code,
        weeklyHours: JSON.stringify(hours),
        openingHours: formatWeeklyHours(hours),
      });
      if (res.errors?.length) {
        setError(errorMessage(res.errors));
        return;
      }
      setOk('Gespeichert.');
      await onSaved();
    } catch (err) {
      console.error(err);
      setError('Verbindung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card point-card">
      <header>
        <h3>{point.name}</h3>
        {point.address && <p className="staff-hint">{point.address}</p>}
      </header>

      <div className="hours-grid">
        {days.map((d, i) => (
          <div key={i} className={`hours-row${d.open ? '' : ' is-closed'}`}>
            <label className="switch hours-row__day">
              <input type="checkbox" checked={d.open} onChange={(e) => setDay(i, { open: e.target.checked })} />
              {WEEKDAYS_DE_LONG[i]}
            </label>
            {d.open ? (
              <span className="hours-row__times">
                <input
                  type="time"
                  value={d.from}
                  aria-label={`${WEEKDAYS_DE_LONG[i]} öffnet`}
                  onChange={(e) => setDay(i, { from: e.target.value })}
                />
                <span>–</span>
                <input
                  type="time"
                  value={d.to}
                  aria-label={`${WEEKDAYS_DE_LONG[i]} schließt`}
                  onChange={(e) => setDay(i, { to: e.target.value })}
                />
              </span>
            ) : (
              <span className="staff-hint">geschlossen</span>
            )}
          </div>
        ))}
      </div>

      <p className="staff-hint">
        Anzeige für Kunden: <strong>{preview}</strong>
      </p>
      {error && <p className="form__error">{error}</p>}
      {ok && <p className="form__ok">{ok}</p>}
      <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save()}>
        {busy ? 'Wird gespeichert …' : 'Öffnungszeiten speichern'}
      </button>
    </article>
  );
}
