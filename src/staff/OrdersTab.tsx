import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatCents, formatDeadline } from '../lib/format';
import { LOCALE } from '../../shared/lang';
import { useStaffI18n, type StaffLang } from '../i18n/staff';
import { errorMessage, staffClient, type Order, type OrderStatus } from './client';

const REFRESH_MS = 30_000;
const OPEN: OrderStatus[] = ['aguardando_pagamento', 'pago', 'pronto'];

type Filter = 'open' | 'aguardando_pagamento' | 'pago' | 'pronto' | 'done';
const FILTER_IDS: Filter[] = ['open', 'aguardando_pagamento', 'pago', 'pronto', 'done'];

/** Nome do idioma do cliente, para o staff saber em que língua falar com ele. */
const CUSTOMER_LANG_NAME: Record<StaffLang, Record<string, string>> = {
  de: { de: 'Deutsch', pt: 'Portugiesisch', en: 'Englisch' },
  pt: { de: 'alemão', pt: 'português', en: 'inglês' },
};

/** Link do pagamento no painel do Stripe (modo de teste enquanto a chave for sk_test_). */
const stripePaymentLink = (paymentIntentId: string) =>
  `https://dashboard.stripe.com/${import.meta.env.VITE_STRIPE_LIVE === 'true' ? '' : 'test/'}payments/${paymentIntentId}`;

const formatTime = (iso: string, lang: StaffLang) =>
  new Date(iso).toLocaleString(LOCALE[lang], {
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
  const { lang, t: tt } = useStaffI18n();
  const t = tt.orders;
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
      setLoadError(t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [t]);

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
          {FILTER_IDS.map((id) => {
            const n =
              id === 'open'
                ? OPEN.reduce((s, st) => s + (counts[st] ?? 0), 0)
                : id === 'done'
                  ? null
                  : (counts[id] ?? 0);
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                className={`chip${filter === id ? ' is-active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {t.filters[id]}
                {n !== null && <span className="chip__count">{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="staff-toolbar__row">
          <select value={point} onChange={(e) => setPoint(e.target.value)} aria-label={t.pointAria}>
            <option value="all">{t.allPoints}</option>
            {Object.entries(POINT_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => void load()}>
            {t.refresh}
          </button>
        </div>
        {lastLoaded && (
          <p className="staff-hint">
            {t.lastLoaded(lastLoaded.toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit' }))}
          </p>
        )}
      </div>

      {loading && <p className="status">{tt.loading}</p>}
      {loadError && <p className="form__error">{loadError}</p>}
      {!loading && !loadError && visible.length === 0 && <p className="status">{t.none}</p>}

      <div className="order-list">
        {visible.map((o) => (
          <OrderCard key={o.id} order={o} onChanged={load} />
        ))}
      </div>
    </section>
  );
}

function OrderCard({ order, onChanged }: { order: Order; onChanged: () => Promise<void> }) {
  const { lang, t: tt } = useStaffI18n();
  const t = tt.orders;
  const money = (cents: number) => formatCents(cents, lang);
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
        language: lang,
      });
      if (res.errors?.length) {
        setError(errorMessage(res.errors, tt.unknownError));
        return;
      }
      setConfirmCancel(false);
      await onChanged();
    } catch (err) {
      console.error(err);
      setError(tt.connectionFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`order card status--${status}${overdue ? ' order--overdue' : ''}`}>
      <header className="order__head">
        <span className="order__code">{order.orderCode ?? order.id.slice(0, 8)}</span>
        <span className={`badge badge--${status}`}>{tt.status[status]}</span>
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
            {overdue ? t.overdue : t.pickupBy}
            {formatDeadline(order.pickupDeadline, lang)}
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
        {t.box(order.boxSize)} · {money(order.totalCents)}
        <span>
          {order.pfandCharged ? t.inclPfand(money(order.pfandCents)) : order.pfandReturnDeclared ? t.noPfand : t.pfandCredit}
        </span>
      </p>

      {order.paymentAfterCancel && (
        <p className="order__notice order__notice--alert">
          {t.paidAfterCancel}
          {order.stripePaymentIntentId && (
            <>
              {' '}
              <a href={stripePaymentLink(order.stripePaymentIntentId)} target="_blank" rel="noopener noreferrer">
                {t.openPayment}
              </a>
            </>
          )}
        </p>
      )}
      {isPaid && !order.paymentAfterCancel && (
        <p className="staff-hint">
          {t.paidAt(formatTime(order.paidAt!, lang))}
          {order.stripePaymentIntentId && (
            <>
              {' · '}
              <a href={stripePaymentLink(order.stripePaymentIntentId)} target="_blank" rel="noopener noreferrer">
                {t.viewInStripe}
              </a>
            </>
          )}
        </p>
      )}
      {status === 'cancelado' && order.cancelReason && <p className="staff-hint">{t.reason(order.cancelReason)}</p>}
      {order.language && order.language !== 'de' && (
        <p className="staff-hint">{t.customerLang(CUSTOMER_LANG_NAME[lang][order.language] ?? order.language)}</p>
      )}

      {order.pfandReturnDeclared && !isFinal && (
        <p className="order__notice">{t.bringsBox}</p>
      )}
      {status === 'retirado' && order.pfandReturnDeclared && (
        <p className="order__notice order__notice--muted">
          {order.pfandCollectedOnSite ? t.noBoxCollected : t.boxReceived}
        </p>
      )}
      {order.updatedBy && isFinal && <p className="staff-hint">{t.lastChangedBy(order.updatedBy)}</p>}

      {error && <p className="form__error">{error}</p>}

      {!isFinal && !confirmCancel && (
        <div className="order__actions">
          {status === 'aguardando_pagamento' && (
            <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => change('pago')}>
              {t.markPaid}
            </button>
          )}
          {status === 'pago' && (
            <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => change('pronto')}>
              {t.markReady}
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
                  {t.pickedUpWithBox}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={busy}
                  onClick={() => change('retirado', false)}
                >
                  {t.pickedUpNoBox}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--small"
                disabled={busy}
                onClick={() => change('retirado')}
              >
                {t.pickedUp}
              </button>
            ))}
          <button type="button" className="link-btn link-btn--danger" disabled={busy} onClick={() => setConfirmCancel(true)}>
            {t.cancel}
          </button>
        </div>
      )}

      {confirmCancel && (
        <div className="order__confirm" role="alertdialog" aria-label={t.confirmCancelAria}>
          <p>{t.confirmCancel}</p>
          {isPaid && (
            <p>
              <strong>{t.paidWarningStrong}</strong> {t.paidWarning}
            </p>
          )}
          <div className="order__actions">
            <button type="button" className="btn btn--danger btn--small" disabled={busy} onClick={() => change('cancelado')}>
              {t.yesCancel}
            </button>
            <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => setConfirmCancel(false)}>
              {t.abort}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
