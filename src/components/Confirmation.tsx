import { useCustomerI18n } from '../i18n/customer';
import type { PublicOrderStatus } from '../lib/amplify';
import { formatCents, formatDeadline } from '../lib/format';
import { pickupHoursText } from '../lib/hoursText';

interface ConfirmationProps {
  order: PublicOrderStatus;
}

/** Confirmação de um pedido pago (status pago, pronto ou retirado). */
export function Confirmation({ order }: ConfirmationProps) {
  const { lang, t } = useCustomerI18n();
  const c = t.confirm;
  const money = (cents: number) => formatCents(cents, lang);
  const status = c.statusText[order.status as string] ?? c.statusText.pago;
  const hours = pickupHoursText(order.pickupPointWeeklyHours, order.pickupPointHours, lang);

  return (
    <section className="confirm" aria-labelledby="confirm-title">
      <div className="confirm__badge" aria-hidden="true">
        ✓
      </div>
      <h1 id="confirm-title" className="confirm__title">
        {c.thanks(order.customerFirstName)}
      </h1>
      <p className="confirm__lead">{c.lead}</p>

      <div className="card confirm__card">
        <p className="label">{c.orderNumber}</p>
        <p className="confirm__code">{order.orderCode}</p>
        <p className="confirm__hint">{c.sayNumber}</p>
      </div>

      <dl className="card confirm__details">
        <div>
          <dt>{c.status}</dt>
          <dd>
            <strong>{status.title}</strong>
            <span>{status.text}</span>
          </dd>
        </div>
        <div>
          <dt>{c.pickupPoint}</dt>
          <dd>
            <strong>{order.pickupPointName}</strong>
            {hours && <span>{hours}</span>}
          </dd>
        </div>
        {order.status !== 'retirado' && (
          <div>
            <dt>{c.pickupUntil}</dt>
            <dd>
              <strong>{formatDeadline(order.pickupDeadline, lang)}</strong>
              <span>{c.pickupRule}</span>
            </dd>
          </div>
        )}
        <div>
          <dt>{c.yourBox}</dt>
          <dd>
            <strong>{t.box.cups(order.boxSize)}</strong>
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
          <dt>{c.paid}</dt>
          <dd>
            <strong>{money(order.totalCents)}</strong>
            <span>{c.priceLine(money(order.priceCents), order.pfandCharged ? money(order.pfandCents) : null)}</span>
          </dd>
        </div>
      </dl>

      <p className="confirm__hint">{c.tip}</p>

      <a className="btn btn--ghost" href="/">
        {c.newOrder}
      </a>
    </section>
  );
}
