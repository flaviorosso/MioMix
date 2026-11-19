import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BOX_SIZES, CUP_GRAMS, PFAND_CENTS, PRICES_CENTS, type BoxSize } from '../../shared/pricing';
import { Cup } from '../components/Cup';
import { BrandLogo } from '../components/BrandLogo';
import { FlavorCard } from '../components/FlavorCard';
import { Footer } from '../components/Footer';
import { client } from '../lib/amplify';
import { fetchFlavors, fetchPickupPoints } from '../lib/data';
import { useCustomerI18n, type CustomerMessages } from '../i18n/customer';
import { formatCents } from '../lib/format';
import { pickupHoursText } from '../lib/hoursText';
import type { FlavorView, PickupPointView } from '../lib/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()/-]{6,25}$/;

type LoadState = 'loading' | 'ready' | 'error';

interface CustomerForm {
  name: string;
  email: string;
  phone: string;
  pfandReturned: boolean;
}

type FieldErrors = Partial<Record<'name' | 'email' | 'phone', string>>;

function validate(form: CustomerForm, t: CustomerMessages): FieldErrors {
  const errors: FieldErrors = {};
  if (form.name.trim().length < 2) errors.name = t.form.errName;
  if (!EMAIL_RE.test(form.email.trim())) errors.email = t.form.errEmail;
  if (!PHONE_RE.test(form.phone.trim())) errors.phone = t.form.errPhone;
  return errors;
}

const pointFromUrl = () => new URLSearchParams(window.location.search).get('ponto')?.trim().toLowerCase() ?? '';

export function OrderPage() {
  const { lang, t } = useCustomerI18n();
  const money = (cents: number) => formatCents(cents, lang);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [flavors, setFlavors] = useState<FlavorView[]>([]);
  const [points, setPoints] = useState<PickupPointView[]>([]);

  const [pointCode, setPointCode] = useState('');
  const [choosingPoint, setChoosingPoint] = useState(true);
  const [boxSize, setBoxSize] = useState<BoxSize>(6);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [form, setForm] = useState<CustomerForm>({ name: '', email: '', phone: '', pfandReturned: false });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const formRef = useRef<HTMLElement>(null);

  // --- Carregar sabores e pontos de retirada -------------------------------
  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const [f, p] = await Promise.all([fetchFlavors(), fetchPickupPoints()]);
      setFlavors(f);
      setPoints(p);
      // Ajusta quantidades ao estoque atual (ex.: depois de "nicht genug Vorrat").
      setQuantities((prev) => {
        const next: Record<string, number> = {};
        for (const flavor of f) {
          const q = Math.min(prev[flavor.id] ?? 0, flavor.stock);
          if (q > 0) next[flavor.id] = q;
        }
        return next;
      });
      setLoadState('ready');
      return p;
    } catch (err) {
      console.error(err);
      setLoadState('error');
      return null;
    }
  }, []);

  useEffect(() => {
    void load().then((loadedPoints) => {
      // Ponto de retirada pelo link (?ponto=ciaociao)
      const code = pointFromUrl();
      if (code && loadedPoints?.some((pt) => pt.code === code)) {
        setPointCode(code);
        setChoosingPoint(false);
      }
    });
  }, [load]);

  // --- Derivados -----------------------------------------------------------
  const selectedCups = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + q, 0),
    [quantities],
  );
  const remaining = boxSize - selectedCups;
  const boxComplete = remaining === 0;
  const tooMany = remaining < 0;
  const selectedPoint = points.find((p) => p.code === pointCode) ?? null;
  const priceCents = PRICES_CENTS[boxSize];
  const pfandCents = form.pfandReturned ? 0 : PFAND_CENTS;
  const totalCents = priceCents + pfandCents;

  const changeQuantity = (flavor: FlavorView, delta: 1 | -1) => {
    setQuantities((prev) => {
      const current = prev[flavor.id] ?? 0;
      const next = Math.max(0, Math.min(flavor.stock, current + delta));
      if (delta > 0 && selectedCups >= boxSize) return prev;
      const copy = { ...prev, [flavor.id]: next };
      if (next === 0) delete copy[flavor.id];
      return copy;
    });
  };

  const hoursOf = (p: PickupPointView) => pickupHoursText(p.weeklyHours, p.openingHours, lang);

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // --- Enviar --------------------------------------------------------------
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const errors = validate(form, t);
    setFieldErrors(errors);
    if (!selectedPoint) {
      setSubmitError(t.form.errPoint);
      return;
    }
    if (!boxComplete) {
      setSubmitError(tooMany ? t.form.errTooMany(-remaining) : t.form.errMissing(remaining));
      return;
    }
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    const items = flavors
      .filter((f) => (quantities[f.id] ?? 0) > 0)
      .map((f) => ({ flavorId: f.id, name: f.name, quantity: quantities[f.id] }));
    try {
      const { data, errors: apiErrors } = await client.mutations.placeOrder({
        customerName: form.name.trim(),
        customerEmail: form.email.trim(),
        customerPhone: form.phone.trim(),
        pickupPointCode: selectedPoint.code,
        boxSize,
        items: items.map(({ flavorId, quantity }) => ({ flavorId, quantity })),
        pfandBoxReturned: form.pfandReturned,
        returnOrigin: window.location.origin,
        language: lang,
      });
      if (apiErrors?.length || !data) {
        setSubmitError(apiErrors?.[0]?.message ?? t.form.errUnknown);
        // O erro pode ser "acabou o estoque": recarrega sabores e quantidades.
        await load();
        setSubmitting(false);
        return;
      }
      // Pedido reservado → pagamento no Stripe Checkout (a página fica bloqueada até sair).
      window.location.assign(data.checkoutUrl);
      return;
    } catch (err) {
      console.error(err);
      setSubmitError(t.form.errConnection);
    }
    setSubmitting(false);
  };

  // --- Render --------------------------------------------------------------
  return (
    <div className="page page--with-bar">
      <header className="hero">
        <BrandLogo size={112} className="hero__logo" />
        <h1 className="hero__title">{t.hero.title}</h1>
        <p className="hero__lead">{t.hero.lead}</p>
      </header>

      <main className="main">
        {loadState === 'loading' && <p className="status">{t.load.loading}</p>}
        {loadState === 'error' && (
          <div className="status status--error">
            <p>{t.load.error}</p>
            <button type="button" className="btn btn--ghost" onClick={() => void load()}>
              {t.load.retry}
            </button>
          </div>
        )}

        {loadState === 'ready' && (
          <>
            {/* 1. Abholort */}
            <section className="section" aria-labelledby="sec-point">
              <h2 id="sec-point" className="section__title">
                <span className="section__num">1</span> {t.point.title}
              </h2>
              {!choosingPoint && selectedPoint ? (
                <div className="card point point--selected">
                  <div>
                    <p className="point__name">{selectedPoint.name}</p>
                    {hoursOf(selectedPoint) && <p className="point__meta">{hoursOf(selectedPoint)}</p>}
                  </div>
                  <button type="button" className="link-btn" onClick={() => setChoosingPoint(true)}>
                    {t.point.change}
                  </button>
                </div>
              ) : (
                <div className="choices" role="radiogroup" aria-label={t.point.aria}>
                  {points.map((p) => (
                    <button
                      key={p.code}
                      type="button"
                      role="radio"
                      aria-checked={p.code === pointCode}
                      className={`card point${p.code === pointCode ? ' is-active' : ''}`}
                      onClick={() => {
                        setPointCode(p.code);
                        setChoosingPoint(false);
                      }}
                    >
                      <span className="point__name">{p.name}</span>
                      {hoursOf(p) && <span className="point__meta">{hoursOf(p)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* 2. Box */}
            <section className="section" aria-labelledby="sec-box">
              <h2 id="sec-box" className="section__title">
                <span className="section__num">2</span> {t.box.title}
              </h2>
              <div className="boxes" role="radiogroup" aria-label={t.box.aria}>
                {BOX_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="radio"
                    aria-checked={size === boxSize}
                    className={`card box${size === boxSize ? ' is-active' : ''}`}
                    onClick={() => setBoxSize(size)}
                  >
                    <span className="box__cups" aria-hidden="true">
                      {Array.from({ length: size }, (_, i) => (
                        <i key={i} />
                      ))}
                    </span>
                    <span className="box__size">{t.box.cups(size)}</span>
                    <span className="box__grams">{t.box.grams(CUP_GRAMS)}</span>
                    <span className="box__price">{money(PRICES_CENTS[size])}</span>
                  </button>
                ))}
              </div>
              <p className="section__note">{t.box.pfandNote(money(PFAND_CENTS))}</p>
            </section>

            {/* 3. Sorten */}
            <section className="section" aria-labelledby="sec-flavors">
              <h2 id="sec-flavors" className="section__title">
                <span className="section__num">3</span> {t.flavors.title}
              </h2>
              {flavors.length === 0 ? (
                <p className="status">{t.flavors.soldOutAll}</p>
              ) : (
                <div className="flavors">
                  {flavors.map((f) => (
                    <FlavorCard
                      key={f.id}
                      flavor={f}
                      quantity={quantities[f.id] ?? 0}
                      boxFull={selectedCups >= boxSize}
                      onChange={(delta) => changeQuantity(f, delta)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 4. Daten */}
            <section className="section" aria-labelledby="sec-data" ref={formRef}>
              <h2 id="sec-data" className="section__title">
                <span className="section__num">4</span> {t.form.title}
              </h2>
              <form className="card form" onSubmit={handleSubmit} noValidate>
                <label className="field">
                  <span>{t.form.name}</span>
                  <input
                    type="text"
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    aria-invalid={!!fieldErrors.name}
                  />
                  {fieldErrors.name && <small className="field__error">{fieldErrors.name}</small>}
                </label>
                <label className="field">
                  <span>{t.form.email}</span>
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    aria-invalid={!!fieldErrors.email}
                  />
                  {fieldErrors.email && <small className="field__error">{fieldErrors.email}</small>}
                </label>
                <label className="field">
                  <span>{t.form.phone}</span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="+49 …"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    aria-invalid={!!fieldErrors.phone}
                  />
                  {fieldErrors.phone && <small className="field__error">{fieldErrors.phone}</small>}
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={form.pfandReturned}
                    onChange={(e) => setForm({ ...form, pfandReturned: e.target.checked })}
                  />
                  <span>
                    {t.form.pfandReturned}
                    <small>{t.form.pfandReturnedHint}</small>
                  </span>
                </label>

                <div className="summary">
                  <div className="summary__row">
                    <span>{t.form.boxLine(boxSize)}</span>
                    <span>{money(priceCents)}</span>
                  </div>
                  <div className="summary__row">
                    <span>{t.form.pfand}</span>
                    <span>{form.pfandReturned ? '–' : money(pfandCents)}</span>
                  </div>
                  <div className="summary__row summary__row--total">
                    <span>{t.form.total}</span>
                    <span>{money(totalCents)}</span>
                  </div>
                </div>

                {submitError && (
                  <p className="form__error" role="alert">
                    {submitError}
                  </p>
                )}

                <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
                  {submitting ? t.form.submitting : t.form.submit}
                </button>
                <p className="form__privacy">
                  {t.form.privacyBefore} <a href="/datenschutz">{t.form.privacyLink}</a>.
                </p>
              </form>
            </section>
          </>
        )}
      </main>

      <Footer />

      {/* Barra fixa: progresso da caixa */}
      {loadState === 'ready' && flavors.length > 0 && (
        <div className={`bar${boxComplete ? ' bar--complete' : ''}${tooMany ? ' bar--over' : ''}`}>
          <div className="bar__inner">
            <Cup color={boxComplete ? '#C0583A' : '#E9D9C2'} size={36} />
            <div className="bar__text">
              <p className="bar__label" aria-live="polite">
                {tooMany
                  ? t.bar.tooMany(-remaining)
                  : boxComplete
                    ? t.bar.complete
                    : t.bar.remaining(remaining, boxSize)}
              </p>
              <div
                className="bar__track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={boxSize}
                aria-valuenow={Math.min(selectedCups, boxSize)}
              >
                <span style={{ width: `${Math.min(100, (selectedCups / boxSize) * 100)}%` }} />
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--small"
              disabled={!boxComplete}
              onClick={scrollToForm}
            >
              {t.bar.next}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
