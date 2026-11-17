import type { FlavorView } from '../lib/types';
import { Cup } from './Cup';

interface FlavorCardProps {
  flavor: FlavorView;
  quantity: number;
  boxFull: boolean;
  onChange: (delta: 1 | -1) => void;
}

const LOW_STOCK = 5;

export function FlavorCard({ flavor, quantity, boxFull, onChange }: FlavorCardProps) {
  const atStockLimit = quantity >= flavor.stock;
  const canAdd = !atStockLimit && !boxFull;
  const remainingStock = flavor.stock - quantity;

  return (
    <article className={`flavor${quantity > 0 ? ' flavor--selected' : ''}`}>
      <Cup color={flavor.color} size={60} />
      <div className="flavor__body">
        <h3 className="flavor__name">{flavor.name}</h3>
        {flavor.description && <p className="flavor__desc">{flavor.description}</p>}
        <p className="flavor__allergens">
          <span>Allergene:</span> {flavor.allergens.length ? flavor.allergens.join(', ') : 'keine'}
        </p>
        {atStockLimit ? (
          <p className="flavor__stock flavor__stock--out">Mehr ist heute leider nicht da.</p>
        ) : (
          flavor.stock <= LOW_STOCK && (
            <p className="flavor__stock">Nur noch {remainingStock} verfügbar</p>
          )
        )}
      </div>
      <div className="stepper" role="group" aria-label={`Anzahl ${flavor.name}`}>
        <button
          type="button"
          className="stepper__btn"
          onClick={() => onChange(-1)}
          disabled={quantity === 0}
          aria-label={`${flavor.name} entfernen`}
        >
          −
        </button>
        <output className="stepper__count" aria-live="polite">
          {quantity}
        </output>
        <button
          type="button"
          className="stepper__btn stepper__btn--add"
          onClick={() => onChange(1)}
          disabled={!canAdd}
          aria-label={`${flavor.name} hinzufügen`}
        >
          +
        </button>
      </div>
    </article>
  );
}
