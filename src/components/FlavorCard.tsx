import { localizeFlavor } from '../../shared/lang';
import { useCustomerI18n } from '../i18n/customer';
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
  const { lang, t } = useCustomerI18n();
  const text = localizeFlavor(flavor, flavor.translations, lang);

  return (
    <article className={`flavor${quantity > 0 ? ' flavor--selected' : ''}`}>
      <Cup color={flavor.color} size={60} />
      <div className="flavor__body">
        <h3 className="flavor__name">{text.name}</h3>
        {text.description && <p className="flavor__desc">{text.description}</p>}
        <p className="flavor__allergens">
          <span>{t.flavors.allergens}</span> {text.allergens.length ? text.allergens.join(', ') : t.flavors.noAllergens}
        </p>
        {atStockLimit ? (
          <p className="flavor__stock flavor__stock--out">{t.flavors.noMore}</p>
        ) : (
          flavor.stock <= LOW_STOCK && <p className="flavor__stock">{t.flavors.onlyLeft(remainingStock)}</p>
        )}
      </div>
      <div className="stepper" role="group" aria-label={t.flavors.countAria(text.name)}>
        <button
          type="button"
          className="stepper__btn"
          onClick={() => onChange(-1)}
          disabled={quantity === 0}
          aria-label={t.flavors.removeAria(text.name)}
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
          aria-label={t.flavors.addAria(text.name)}
        >
          +
        </button>
      </div>
    </article>
  );
}
