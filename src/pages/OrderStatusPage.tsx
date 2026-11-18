import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Confirmation } from '../components/Confirmation';
import { Footer } from '../components/Footer';
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
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [pollsLeft, setPollsLeft] = useState(CANCELLED_AT_STRIPE ? 0 : POLL_MAX);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    if (!ORDER_ID) {
      setView({ kind: 'notFound' });
      return null;
    }
    try {
      const { data, errors } = await client.queries.getOrderStatus({ orderId: ORDER_ID });
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
  }, []);

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
      <main className="main">{renderView(view, pollsLeft, () => void load())}</main>
      <Footer />
    </div>
  );
}

function renderView(view: View, pollsLeft: number, reload: () => void) {
  if (view.kind === 'loading') return <p className="status">Bestellung wird geladen …</p>;

  if (view.kind === 'notFound') {
    return (
      <Notice title="Bestellung nicht gefunden">
        <p>Bitte prüfe den Link oder bestelle neu.</p>
        <a className="btn btn--primary" href="/">
          Zur Bestellung
        </a>
      </Notice>
    );
  }

  if (view.kind === 'error') {
    return (
      <Notice title="Gerade nicht erreichbar">
        <p>Wir können den Status deiner Bestellung im Moment nicht laden.</p>
        <button type="button" className="btn btn--ghost" onClick={reload}>
          Erneut versuchen
        </button>
      </Notice>
    );
  }

  const { order } = view;

  if (order.status === 'cancelado') {
    return (
      <Notice title="Bestellung storniert">
        <p>
          Die Bestellung <strong>{order.orderCode}</strong> wurde storniert
          {order.paid ? '.' : ' – es wurde nichts abgebucht.'}
        </p>
        <a className="btn btn--primary" href="/">
          Neue Bestellung
        </a>
      </Notice>
    );
  }

  if (order.status === 'aguardando_pagamento') {
    // Voltou do Stripe com sucesso, mas o aviso ainda não chegou.
    if (pollsLeft > 0 && !CANCELLED_AT_STRIPE) {
      return (
        <Notice title="Zahlung wird bestätigt …">
          <p>Einen Moment bitte, wir warten auf die Bestätigung deiner Zahlung.</p>
        </Notice>
      );
    }
    return (
      <Notice title={CANCELLED_AT_STRIPE ? 'Zahlung abgebrochen' : 'Zahlung noch offen'}>
        <p>
          Deine Bestellung <strong>{order.orderCode}</strong> über {formatCents(order.totalCents)} ist noch nicht
          bezahlt.
        </p>
        {order.checkoutUrl ? (
          <>
            <p>Wir halten deine Becher noch etwa {minutesLeft(order.checkoutExpiresAt)} Minuten für dich bereit.</p>
            <a className="btn btn--primary" href={order.checkoutUrl}>
              Jetzt bezahlen
            </a>
          </>
        ) : (
          <p>Die Reservierung ist abgelaufen. Bitte bestelle neu.</p>
        )}
        {!CANCELLED_AT_STRIPE && (
          <button type="button" className="link-btn" onClick={reload}>
            Status aktualisieren
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
