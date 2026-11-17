import { Footer } from '../components/Footer';

interface LegalPageProps {
  title: string;
}

/** Página provisória para Impressum / Datenschutz. */
export function LegalPage({ title }: LegalPageProps) {
  return (
    <div className="page">
      <main className="legal">
        <a className="back-link" href="/">
          ← Zurück zur Bestellung
        </a>
        <h1>{title}</h1>
        <p>Inhalt folgt in Kürze.</p>
      </main>
      <Footer />
    </div>
  );
}
