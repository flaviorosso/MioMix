import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Confirmation } from '../components/Confirmation';
import { Footer } from '../components/Footer';
import type { Lang } from '../../shared/lang';
import { useCustomerI18n, type CustomerMessages } from '../i18n/customer';
import { client, type PublicOrderStatus } from '../lib/amplify';
import { formatCents } from '../lib/format';

const POLL_MS = 2000;
const POLL_MAX = 20; // ~40 s esperando o aviso do Stripe

type View =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'error' }
  | { kind: 'order'; order: PublicOrderStatus };

const params = new URLSearchParams(window.location.search);
const ORDER_ID = params.get('id') ?? '';
const CANCELLED_AT_STRIPE = params.get('abgebrochen') === '1';

const minutesLeft = (iso?: string | null) =>
  iso ? Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000)) : 0;

export function OrderStatusPage() {
  const { lang, t } = useCustomerI18n();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [pollsLeft, setPollsLeft] = useState(CANCELLED_AT_STRIPE ? 0 : POLL_MAX);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    if (!ORDER_ID) {
      setView({ kind: 'notFound' });
      return null;
    }
    try {
      const { data, errors } = await client.queries.getOrderStatus({ orderId: ORDER_ID, language: lang });
      if (errors?.length) throw new Error(errors[0].message);
      if (!data) {
        setView({ kind: 'notFound' });
        return null;
      }
      setView({ kind: 'order', order: data });
      return data;
    } catch (err) {
      console.error(err);
      setView({ kind: 'error' });
      return null;
    }
  }, [lang]);

  // Carrega e, se ainda aguardando pagamento (voltando do Stripe), consulta de novo por alguns segundos.
  useEffect(() => {
    let cancelled = false;
    const tick = async (remaining: number) => {
      const order = await load();
      if (cancelled) return;
      if (order?.status === 'aguardando_pagamento' && remaining > 0) {
        setPollsLeft(remaining - 1);
        timer.current = window.setTimeout(() => void tick(remaining - 1), POLL_MS);
      } else {
        setPollsLeft(0);
      }
    };
    void tick(CANCELLED_AT_STRIPE ? 0 : POLL_MAX);
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [load]);

  return (
    <div className="page">
      <main className="main">{renderView(view, pollsLeft, () => void load(), t, lang)}</main>
      <Footer />
    </div>
  );
}

function renderView(view: View, pollsLeft: number, reload: () => void, t: CustomerMessages, lang: Lang) {
  const s = t.status;
  if (view.kind === 'loading') return <p className="status">{s.loading}</p>;

  if (view.kind === 'notFound') {
    return (
      <Notice title={s.notFoundTitle}>
        <p>{s.notFoundText}</p>
        <a className="btn btn--primary" href="/">
          {s.toOrder}
        </a>
      </Notice>
    );
  }

  if (view.kind === 'error') {
    return (
      <Notice title={s.errorTitle}>
        <p>{s.errorText}</p>
        <button type="button" className="btn btn--ghost" onClick={reload}>
          {s.retry}
        </button>
      </Notice>
    );
  }

  const { order } = view;

  if (order.status === 'cancelado') {
    return (
      <Notice title={s.cancelledTitle}>
        <p>{s.cancelledText(order.orderCode, order.paid)}</p>
        <a className="btn btn--primary" href="/">
          {s.newOrder}
        </a>
      </Notice>
    );
  }

  if (order.status === 'aguardando_pagamento') {
    // Voltou do Stripe com sucesso, mas o aviso ainda não chegou.
    if (pollsLeft > 0 && !CANCELLED_AT_STRIPE) {
      return (
        <Notice title={s.confirmingTitle}>
          <p>{s.confirmingText}</p>
        </Notice>
      );
    }
    return (
      <Notice title={CANCELLED_AT_STRIPE ? s.abortedTitle : s.openTitle}>
        <p>{s.unpaidText(order.orderCode, formatCents(order.totalCents, lang))}</p>
        {order.checkoutUrl ? (
          <>
            <p>{s.holdText(minutesLeft(order.checkoutExpiresAt))}</p>
            <a className="btn btn--primary" href={order.checkoutUrl}>
              {s.payNow}
            </a>
          </>
        ) : (
          <p>{s.expired}</p>
        )}
        {!CANCELLED_AT_STRIPE && (
          <button type="button" className="link-btn" onClick={reload}>
            {s.refresh}
          </button>
        )}
      </Notice>
    );
  }

  return <Confirmation order={order} />;
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="notice">
      <h1 className="confirm__title">{title}</h1>
      {children}
    </section>
  );
}
