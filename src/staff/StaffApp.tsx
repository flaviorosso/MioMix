import { useEffect, useState } from 'react';
import { Authenticator, translations, useAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { fetchAuthSession } from 'aws-amplify/auth';
import { I18n } from 'aws-amplify/utils';
import { BrandLogo } from '../components/BrandLogo';
import { LangSwitcher } from '../components/LangSwitcher';
import { LangProvider } from '../i18n/LangContext';
import { STAFF_LANG_KEY, STAFF_LANGS, useStaffI18n } from '../i18n/staff';
import { FlavorsTab } from './FlavorsTab';
import { OrdersTab } from './OrdersTab';
import { PfandTab } from './PfandTab';
import { PickupPointsTab } from './PickupPointsTab';
import { StockTab } from './StockTab';
import './staff.css';

I18n.putVocabularies(translations);

type Tab = 'orders' | 'stock' | 'flavors' | 'pfand' | 'points';
const TAB_IDS: Tab[] = ['orders', 'stock', 'flavors', 'pfand', 'points'];

function StaffLangSwitcher() {
  const { lang, setLang, t } = useStaffI18n();
  return <LangSwitcher langs={STAFF_LANGS} value={lang} onChange={setLang} label={t.langLabel} />;
}

function LoginHeader() {
  const { t } = useStaffI18n();
  return (
    <div className="staff-login__header">
      <StaffLangSwitcher />
      <BrandLogo size={88} className="staff-login__logo" />
      <h1>{t.shell.teamArea}</h1>
    </div>
  );
}

const authComponents = { Header: LoginHeader };

export default function StaffApp() {
  return (
    <LangProvider supported={STAFF_LANGS} fallback="de" storageKey={STAFF_LANG_KEY}>
      <StaffRoot />
    </LangProvider>
  );
}

function StaffRoot() {
  const { lang } = useStaffI18n();
  // Textos da tela de login (Amplify) no idioma do painel.
  I18n.setLanguage(lang);
  useEffect(() => {
    document.title = 'Ciao Ciao – Team';
  }, []);
  return (
    <div className="staff">
      <Authenticator key={lang} hideSignUp components={authComponents}>
        <StaffShell />
      </Authenticator>
    </div>
  );
}

function StaffShell() {
  const { t } = useStaffI18n();
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

  if (isStaff === null) return <p className="status">{t.loading}</p>;

  if (!isStaff) {
    return (
      <div className="staff-denied">
        <h1>{t.shell.noAccessTitle}</h1>
        <p>{t.shell.noAccessText}</p>
        <button type="button" className="btn btn--ghost" onClick={signOut}>
          {t.shell.signOut}
        </button>
      </div>
    );
  }

  return (
    <div className="staff-shell">
      <header className="staff-top">
        <div className="staff-top__brand">
          <BrandLogo size={48} />
          <p className="staff-top__user">{user?.signInDetails?.loginId}</p>
        </div>
        <div className="staff-top__actions">
          <StaffLangSwitcher />
          <button type="button" className="link-btn" onClick={signOut}>
            {t.shell.signOut}
          </button>
        </div>
      </header>

      <nav className="staff-tabs" aria-label={t.shell.areas}>
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`staff-tabs__btn${tab === id ? ' is-active' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            {t.shell.tabs[id]}
          </button>
        ))}
      </nav>

      <main className="staff-main">
        {tab === 'orders' && <OrdersTab />}
        {tab === 'stock' && <StockTab />}
        {tab === 'flavors' && <FlavorsTab />}
        {tab === 'pfand' && <PfandTab />}
        {tab === 'points' && <PickupPointsTab />}
      </main>
    </div>
  );
}
