import { useEffect, useState } from 'react';
import { Authenticator, translations, useAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { fetchAuthSession } from 'aws-amplify/auth';
import { I18n } from 'aws-amplify/utils';
import { FlavorsTab } from './FlavorsTab';
import { OrdersTab } from './OrdersTab';
import { PfandTab } from './PfandTab';
import { StockTab } from './StockTab';
import './staff.css';

I18n.putVocabularies(translations);
I18n.setLanguage('de');

type Tab = 'orders' | 'stock' | 'flavors' | 'pfand';
const TABS: { id: Tab; label: string }[] = [
  { id: 'orders', label: 'Bestellungen' },
  { id: 'stock', label: 'Bestand' },
  { id: 'flavors', label: 'Sorten' },
  { id: 'pfand', label: 'Pfand' },
];

const authComponents = {
  Header() {
    return (
      <div className="staff-login__header">
        <p className="hero__brand">Mio Mix</p>
        <h1>Team-Bereich</h1>
      </div>
    );
  },
};

export default function StaffApp() {
  return (
    <div className="staff">
      <Authenticator hideSignUp components={authComponents}>
        <StaffShell />
      </Authenticator>
    </div>
  );
}

function StaffShell() {
  const { user, signOut } = useAuthenticator((ctx) => [ctx.user]);
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('orders');

  useEffect(() => {
    fetchAuthSession()
      .then((session) => {
        const groups = (session.tokens?.accessToken.payload['cognito:groups'] as string[] | undefined) ?? [];
        setIsStaff(groups.includes('staff'));
      })
      .catch(() => setIsStaff(false));
  }, [user]);

  if (isStaff === null) return <p className="status">Wird geladen …</p>;

  if (!isStaff) {
    return (
      <div className="staff-denied">
        <h1>Kein Zugriff</h1>
        <p>Dein Konto ist nicht für den Team-Bereich freigeschaltet.</p>
        <button type="button" className="btn btn--ghost" onClick={signOut}>
          Abmelden
        </button>
      </div>
    );
  }

  return (
    <div className="staff-shell">
      <header className="staff-top">
        <div>
          <p className="hero__brand">Mio Mix</p>
          <p className="staff-top__user">{user?.signInDetails?.loginId}</p>
        </div>
        <button type="button" className="link-btn" onClick={signOut}>
          Abmelden
        </button>
      </header>

      <nav className="staff-tabs" aria-label="Bereiche">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`staff-tabs__btn${tab === t.id ? ' is-active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="staff-main">
        {tab === 'orders' && <OrdersTab />}
        {tab === 'stock' && <StockTab />}
        {tab === 'flavors' && <FlavorsTab />}
        {tab === 'pfand' && <PfandTab />}
      </main>
    </div>
  );
}
