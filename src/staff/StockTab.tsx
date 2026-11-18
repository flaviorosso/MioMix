import { useCallback, useEffect, useState } from 'react';
import { Cup } from '../components/Cup';
import { errorMessage, formatDate, staffClient, todayBerlin } from './client';

interface Row {
  flavorId: string;
  name: string;
  color: string;
  active: boolean;
  hasStock: boolean;
  quantity: number; // valor salvo
  stockDate: string | null;
  input: string; // valor no campo
}

export function StockTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const today = todayBerlin();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await staffClient.models.Flavor.list({
      selectionSet: ['id', 'name', 'color', 'active', 'sortOrder', 'stock.quantity', 'stock.stockDate'],
      limit: 500,
    });
    if (res.errors?.length) {
      setMessage({ type: 'error', text: errorMessage(res.errors) });
    } else {
      setRows(
        [...res.data]
          .sort((a, b) => Number(b.active) - Number(a.active) || (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
          .map((f) => ({
            flavorId: f.id,
            name: f.name,
            color: f.color,
            active: f.active,
            hasStock: !!f.stock,
            quantity: f.stock?.quantity ?? 0,
            stockDate: f.stock?.stockDate ?? null,
            input: String(f.stock?.quantity ?? 0),
          })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setInput = (flavorId: string, value: string) =>
    setRows((rs) => rs.map((r) => (r.flavorId === flavorId ? { ...r, input: value } : r)));

  const step = (flavorId: string, delta: number) =>
    setRows((rs) =>
      rs.map((r) =>
        r.flavorId === flavorId ? { ...r, input: String(Math.max(0, (parseInt(r.input, 10) || 0) + delta)) } : r,
      ),
    );

  const invalid = rows.some((r) => !/^\d{1,4}$/.test(r.input.trim()));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const results = await Promise.all(
        rows.map((r) => {
          const qty = parseInt(r.input, 10);
          const changed = qty !== r.quantity;
          if (!r.hasStock) {
            return staffClient.models.Stock.create({ flavorId: r.flavorId, quantity: qty, stockDate: today });
          }
          // Só sobrescreve a quantidade se foi alterada (não apaga reservas feitas entretanto).
          return staffClient.models.Stock.update(
            changed ? { flavorId: r.flavorId, quantity: qty, stockDate: today } : { flavorId: r.flavorId, stockDate: today },
          );
        }),
      );
      const failed = results.find((r) => r.errors?.length);
      if (failed) {
        setMessage({ type: 'error', text: errorMessage(failed.errors) });
      } else {
        setMessage({ type: 'ok', text: `Bestand für heute (${formatDate(today)}) gespeichert.` });
      }
      await load();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Speichern fehlgeschlagen.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading && rows.length === 0) return <p className="status">Wird geladen …</p>;

  const outdated = rows.filter((r) => r.active && r.stockDate !== today).length;

  return (
    <section>
      <div className="staff-intro">
        <h2>Bestand heute</h2>
        <p className="staff-hint">
          Anzahl der verfügbaren Becher pro Sorte. Jeden Morgen eintragen und speichern.
          {outdated > 0 && <strong> {outdated} Sorte(n) noch nicht für heute bestätigt.</strong>}
        </p>
      </div>

      <div className="stock-list">
        {rows.map((r) => {
          const qty = parseInt(r.input, 10);
          const dirty = r.input !== String(r.quantity);
          return (
            <div key={r.flavorId} className={`stock-row card${r.active ? '' : ' is-inactive'}`}>
              <Cup color={r.color} size={40} />
              <div className="stock-row__info">
                <p className="stock-row__name">
                  {r.name}
                  {!r.active && <span className="badge">inaktiv</span>}
                </p>
                <p className={`staff-hint${r.stockDate === today ? '' : ' staff-hint--warn'}`}>
                  {r.stockDate ? `Stand ${formatDate(r.stockDate)}` : 'Noch kein Bestand'}
                  {dirty && ' · geändert'}
                </p>
              </div>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper__btn"
                  onClick={() => step(r.flavorId, -1)}
                  disabled={!(qty > 0)}
                  aria-label={`${r.name} minus 1`}
                >
                  −
                </button>
                <input
                  className="stock-row__input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={r.input}
                  onChange={(e) => setInput(r.flavorId, e.target.value.replace(/[^0-9]/g, ''))}
                  aria-label={`Bestand ${r.name}`}
                />
                <button
                  type="button"
                  className="stepper__btn stepper__btn--add"
                  onClick={() => step(r.flavorId, 1)}
                  aria-label={`${r.name} plus 1`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {message && (
        <p className={message.type === 'ok' ? 'form__ok' : 'form__error'} role="status">
          {message.text}
        </p>
      )}

      <div className="staff-sticky-action">
        <button type="button" className="btn btn--primary btn--block" disabled={saving || invalid} onClick={save}>
          {saving ? 'Wird gespeichert …' : 'Bestand für heute speichern'}
        </button>
      </div>
    </section>
  );
}
