import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatCents, formatDeadline } from '../lib/format';
import { STATUS_LABEL, errorMessage, staffClient, type Order, type OrderStatus } from './client';

const REFRESH_MS = 30_000;
const OPEN: OrderStatus[] = ['aguardando_pagamento', 'pago', 'pronto'];

type Filter = 'open' | OrderStatus | 'done';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Offen' },
  { id: 'aguardando_pagamento', label: 'Zahlung offen' },
  { id: 'pago', label: 'Bezahlt' },
  { id: 'pronto', label: 'Abholbereit' },
  { id: 'done', label: 'Erledigt' },
];

/** Link do pagamento no painel do Stripe (modo de teste enquanto a chave for sk_test_). */
const stripePaymentLink = (paymentIntentId: string) =>
  `https://dashboard.stripe.com/${import.meta.env.VITE_STRIPE_LIVE === 'true' ? '' : 'test/'}payments/${paymentIntentId}`;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  });

const POINT_NAMES: Record<string, string> = {
  ciaociao: 'Ciao Ciao',
  racchetta: 'La Racchetta',
};

async function fetchAllOrders(): Promise<Order[]> {
  const all: Order[] = [];
  let nextToken: string | null | undefined;
  do {
    const res = await staffClient.models.Order.list({ limit: 500, nextToken });
    if (res.errors?.length) throw new Error(errorMessage(res.errors));
    all.push(...res.data);
    nextToken = res.nextToken;
  } while (nextToken);
  return all;
}

export function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [point, setPoint] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      setOrders(await fetchAllOrders());
      setLoadError('');
      setLastLoaded(new Date());
    } catch (err) {
      console.error(err);
      setLoadError('Bestellungen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const visible = useMemo(() => {
    const byStatus = (o: Order) => {
      const s = o.status as OrderStatus;
      if (filter === 'open') return OPEN.includes(s);
      if (filter === 'done') return s === 'retirado' || s === 'cancelado';
      return s === filter;
    };
    const list = orders.filter((o) => byStatus(o) && (point === 'all' || o.pickupPointCode === point));
    // Abertos: prazo mais próximo primeiro. Erledigt: mais recentes primeiro (últimos 50).
    if (filter === 'done') {
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50);
    }
    return list.sort((a, b) => a.pickupDeadline.localeCompare(b.pickupDeadline));
  }, [orders, filter, point]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of orders) c[o.status as string] = (c[o.status as string] ?? 0) + 1;
    return c;
  }, [orders]);

  return (
    <section>
      <div className="staff-toolbar">
        <div className="chips" role="tablist" aria-label="Status">
          {FILTERS.map((f) => {
            const n =
              f.id === 'open'
                ? OPEN.reduce((s, st) => s + (counts[st] ?? 0), 0)
                : f.id === 'done'
                  ? null
                  : (counts[f.id] ?? 0);
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`chip${filter === f.id ? ' is-active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                {n !== null && <span className="chip__count">{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="staff-toolbar__row">
          <select value={point} onChange={(e) => setPoint(e.target.value)} aria-label="Abholort">
            <option value="all">Alle Abholorte</option>
            {Object.entries(POINT_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => void load()}>
            Aktualisieren
          </button>
        </div>
        {lastLoaded && (
          <p className="staff-hint">
            Stand {lastLoaded.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · aktualisiert sich
            alle 30 Sekunden
          </p>
        )}
      </div>

      {loading && <p className="status">Wird geladen …</p>}
      {loadError && <p className="form__error">{loadError}</p>}
      {!loading && !loadError && visible.length === 0 && <p className="status">Keine Bestellungen.</p>}

      <div className="order-list">
        {visible.map((o) => (
          <OrderCard key={o.id} order={o} onChanged={load} />
        ))}
      </div>
    </section>
  );
}

function OrderCard({ order, onChanged }: { order: Order; onChanged: () => Promise<void> }) {
  const status = order.status as OrderStatus;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isFinal = status === 'retirado' || status === 'cancelado';
  const isPaid = !!order.paidAt;
  const overdue = !isFinal && new Date(order.pickupDeadline).getTime() < Date.now();

  const change = async (next: OrderStatus, pfandBoxReceived?: boolean) => {
    setBusy(true);
    setError('');
    try {
      const res = await staffClient.mutations.updateOrderStatus({
        orderId: order.id,
        status: next,
        pfandBoxReceived,
      });
      if (res.errors?.length) {
        setError(errorMessage(res.errors));
        return;
      }
      setConfirmCancel(false);
      await onChanged();
    } catch (err) {
      console.error(err);
      setError('Verbindung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`order card status--${status}${overdue ? ' order--overdue' : ''}`}>
      <header className="order__head">
        <span className="order__code">{order.orderCode ?? order.id.slice(0, 8)}</span>
        <span className={`badge badge--${status}`}>{STATUS_LABEL[status]}</span>
      </header>

      <div className="order__grid">
        <div>
          <p className="order__name">{order.customerName}</p>
          <p className="order__contact">
            <a href={`tel:${order.customerPhone.replace(/[^+0-9]/g, '')}`}>{order.customerPhone}</a>
            {' · '}
            <a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a>
          </p>
        </div>
        <div className="order__meta">
          <p>
            <strong>{POINT_NAMES[order.pickupPointCode] ?? order.pickupPointCode}</strong>
          </p>
          <p className={overdue ? 'order__deadline--overdue' : ''}>
            {overdue ? 'Abholfrist abgelaufen: ' : 'Abholung bis '}
            {formatDeadline(order.pickupDeadline)}
          </p>
        </div>
      </div>

      <ul className="order__items">
        {order.items.map((i) => (
          <li key={i?.flavorId}>
            <strong>{i?.quantity}×</strong> {i?.flavorName}
          </li>
        ))}
      </ul>

      <p className="order__price">
        Box {order.boxSize} · {formatCents(order.totalCents)}
        <span>
          {order.pfandCharged
            ? ` (inkl. ${formatCents(order.pfandCents)} Pfand)`
            : order.pfandReturnDeclared
              ? ' (ohne Pfand)'
              : ' (Pfand mit Guthaben verrechnet)'}
        </span>
      </p>

      {order.paymentAfterCancel && (
        <p className="order__notice order__notice--alert">
          Zahlung nach der Stornierung eingegangen – bitte im Stripe-Dashboard erstatten.
          {order.stripePaymentIntentId && (
            <>
              {' '}
              <a href={stripePaymentLink(order.stripePaymentIntentId)} target="_blank" rel="noopener noreferrer">
                Zahlung öffnen
              </a>
            </>
          )}
        </p>
      )}
      {isPaid && !order.paymentAfterCancel && (
        <p className="staff-hint">
          Bezahlt am {formatTime(order.paidAt!)}
          {order.stripePaymentIntentId && (
            <>
              {' · '}
              <a href={stripePaymentLink(order.stripePaymentIntentId)} target="_blank" rel="noopener noreferrer">
                in Stripe ansehen
              </a>
            </>
          )}
        </p>
      )}
      {status === 'cancelado' && order.cancelReason && <p className="staff-hint">Grund: {order.cancelReason}</p>}

      {order.pfandReturnDeclared && !isFinal && (
        <p className="order__notice">Kunde bringt eine Pfand-Box zurück – bei Abholung bitte prüfen.</p>
      )}
      {status === 'retirado' && order.pfandReturnDeclared && (
        <p className="order__notice order__notice--muted">
          {order.pfandCollectedOnSite ? 'Keine Box zurückgegeben – Pfand vor Ort kassiert.' : 'Pfand-Box erhalten.'}
        </p>
      )}
      {order.updatedBy && isFinal && <p className="staff-hint">Zuletzt geändert von {order.updatedBy}</p>}

      {error && <p className="form__error">{error}</p>}

      {!isFinal && !confirmCancel && (
        <div className="order__actions">
          {status === 'aguardando_pagamento' && (
            <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => change('pago')}>
              Als bezahlt markieren
            </button>
          )}
          {status === 'pago' && (
            <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => change('pronto')}>
              Abholbereit
            </button>
          )}
          {status === 'pronto' &&
            (order.pfandReturnDeclared ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  disabled={busy}
                  onClick={() => change('retirado', true)}
                >
                  Abgeholt – Box erhalten
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={busy}
                  onClick={() => change('retirado', false)}
                >
                  Abgeholt – ohne Box (Pfand kassiert)
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--small"
                disabled={busy}
                onClick={() => change('retirado')}
              >
                Abgeholt
              </button>
            ))}
          <button type="button" className="link-btn link-btn--danger" disabled={busy} onClick={() => setConfirmCancel(true)}>
            Stornieren
          </button>
        </div>
      )}

      {confirmCancel && (
        <div className="order__confirm" role="alertdialog" aria-label="Stornierung bestätigen">
          <p>Wirklich stornieren? Die Becher gehen zurück in den Bestand.</p>
          {isPaid && (
            <p>
              <strong>Achtung: Diese Bestellung ist bezahlt.</strong> Der Betrag wird nicht automatisch erstattet – bitte
              danach im Stripe-Dashboard erstatten.
            </p>
          )}
          <div className="order__actions">
            <button type="button" className="btn btn--danger btn--small" disabled={busy} onClick={() => change('cancelado')}>
              Ja, stornieren
            </button>
            <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => setConfirmCancel(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
