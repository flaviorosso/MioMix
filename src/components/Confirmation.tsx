import { formatCents, formatDeadline } from '../lib/format';
import type { PlaceOrderResult } from '../lib/amplify';
import type { PickupPointView } from '../lib/types';

export interface ConfirmedOrder {
  result: PlaceOrderResult;
  customerName: string;
  pickupPoint: PickupPointView;
  items: { name: string; quantity: number }[];
}

interface ConfirmationProps {
  order: ConfirmedOrder;
  onNewOrder: () => void;
}

export function Confirmation({ order, onNewOrder }: ConfirmationProps) {
  const { result, pickupPoint } = order;
  const firstName = order.customerName.split(' ')[0];

  return (
    <section className="confirm" aria-labelledby="confirm-title">
      <div className="confirm__badge" aria-hidden="true">
        ✓
      </div>
      <h1 id="confirm-title" className="confirm__title">
        Danke, {firstName}!
      </h1>
      <p className="confirm__lead">Deine Bestellung ist bei uns eingegangen.</p>

      <div className="card confirm__card">
        <p className="label">Bestellnummer</p>
        <p className="confirm__code">{result.orderCode}</p>
        <p className="confirm__hint">Bitte nenne diese Nummer bei der Abholung.</p>
      </div>

      <dl className="card confirm__details">
        <div>
          <dt>Abholort</dt>
          <dd>
            <strong>{pickupPoint.name}</strong>
            {pickupPoint.address && <span>{pickupPoint.address}</span>}
            {pickupPoint.openingHours && <span>{pickupPoint.openingHours}</span>}
          </dd>
        </div>
        <div>
          <dt>Abholung bis</dt>
          <dd>
            <strong>{formatDeadline(result.pickupDeadline)}</strong>
            <span>Deine Becher sind 24 Stunden für dich reserviert.</span>
          </dd>
        </div>
        <div>
          <dt>Deine Box</dt>
          <dd>
            <strong>{result.boxSize} Becher</strong>
            <ul className="confirm__items">
              {order.items.map((i) => (
                <li key={i.name}>
                  {i.quantity}× {i.name}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Summe</dt>
          <dd>
            <strong>{formatCents(result.totalCents)}</strong>
            <span>
              Box {formatCents(result.priceCents)} +{' '}
              {result.pfandCharged ? `Pfand ${formatCents(result.pfandCents)}` : 'kein Pfand'}
            </span>
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <strong>Zahlung ausstehend</strong>
            <span>Die Online-Zahlung ist bald verfügbar – wir melden uns bei dir.</span>
          </dd>
        </div>
      </dl>

      <button type="button" className="btn btn--ghost" onClick={onNewOrder}>
        Neue Bestellung
      </button>
    </section>
  );
}
