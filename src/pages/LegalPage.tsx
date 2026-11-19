import { Footer } from '../components/Footer';
import { useCustomerI18n } from '../i18n/customer';

/** Títulos legais ficam em alemão (é o nome oficial); nos outros idiomas mostramos a tradução ao lado. */
const TITLES = {
  impressum: { de: 'Impressum', pt: 'Impressum (dados legais)', en: 'Impressum (legal notice)' },
  datenschutz: { de: 'Datenschutz', pt: 'Datenschutz (privacidade)', en: 'Datenschutz (privacy policy)' },
} as const;

/** Página provisória para Impressum / Datenschutz. */
export function LegalPage({ kind }: { kind: keyof typeof TITLES }) {
  const { lang, t } = useCustomerI18n();
  return (
    <div className="page">
      <main className="legal">
        <a className="back-link" href="/">
          {t.legal.back}
        </a>
        <h1>{TITLES[kind][lang]}</h1>
        {t.legal.germanOnly && <p className="legal__note">{t.legal.germanOnly}</p>}
        <p>{t.legal.soon}</p>
      </main>
      <Footer />
    </div>
  );
}
