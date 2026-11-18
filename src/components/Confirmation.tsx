import { formatCents, formatDeadline } from '../lib/format';
import type { PublicOrderStatus } from '../lib/amplify';

interface ConfirmationProps {
  order: PublicOrderStatus;
}

const STATUS_TEXT: Record<string, { title: string; text: string }> = {
  pago: { title: 'Bezahlt', text: 'Wir bereiten deine Box vor.' },
  pronto: { title: 'Abholbereit', text: 'Deine Box wartet auf dich.' },
  retirado: { title: 'Abgeholt', text: 'Guten Appetit!' },
};

/** Confirmação de um pedido pago (status pago, pronto ou retirado). */
export function Confirmation({ order }: ConfirmationProps) {
  const status = STATUS_TEXT[order.status as string] ?? STATUS_TEXT.pago;

  return (
    <section className="confirm" aria-labelledby="confirm-title">
      <div className="confirm__badge" aria-hidden="true">
        ✓
      </div>
      <h1 id="confirm-title" className="confirm__title">
        Danke, {order.customerFirstName}!
      </h1>
      <p className="confirm__lead">Deine Bestellung ist bezahlt und für dich reserviert.</p>

      <div className="card confirm__card">
        <p className="label">Bestellnummer</p>
        <p className="confirm__code">{order.orderCode}</p>
        <p className="confirm__hint">Bitte nenne diese Nummer bei der Abholung.</p>
      </div>

      <dl className="card confirm__details">
        <div>
          <dt>Status</dt>
          <dd>
            <strong>{status.title}</strong>
            <span>{status.text}</span>
          </dd>
        </div>
        <div>
          <dt>Abholort</dt>
          <dd>
            <strong>{order.pickupPointName}</strong>
            {order.pickupPointHours && <span>{order.pickupPointHours}</span>}
          </dd>
        </div>
        {order.status !== 'retirado' && (
          <div>
            <dt>Abholung bis</dt>
            <dd>
              <strong>{formatDeadline(order.pickupDeadline)}</strong>
              <span>Deine Becher sind 24 Stunden ab Zahlung für dich reserviert.</span>
            </dd>
          </div>
        )}
        <div>
          <dt>Deine Box</dt>
          <dd>
            <strong>{order.boxSize} Becher</strong>
            <ul className="confirm__items">
              {order.items.map((i) => (
                <li key={i?.flavorId}>
                  {i?.quantity}× {i?.flavorName}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Bezahlt</dt>
          <dd>
            <strong>{formatCents(order.totalCents)}</strong>
            <span>
              Box {formatCents(order.priceCents)} +{' '}
              {order.pfandCharged ? `Pfand ${formatCents(order.pfandCents)}` : 'kein Pfand'}
            </span>
          </dd>
        </div>
      </dl>

      <p className="confirm__hint">Tipp: Speichere diese Seite – hier siehst du jederzeit den Status deiner Bestellung.</p>

      <a className="btn btn--ghost" href="/">
        Neue Bestellung
      </a>
    </section>
  );
}
