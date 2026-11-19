import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { DEFAULT_LANG } from '../shared/lang';
import { LangSwitcher } from './components/LangSwitcher';
import { CUSTOMER_LANG_KEY, CUSTOMER_LANGS, useCustomerI18n } from './i18n/customer';
import { LangProvider } from './i18n/LangContext';
import { LegalPage } from './pages/LegalPage';
import { OrderPage } from './pages/OrderPage';
import { OrderStatusPage } from './pages/OrderStatusPage';

// O painel staff (login, gestão) só é baixado quando alguém abre /staff.
const StaffApp = lazy(() => import('./staff/StaffApp'));

/** Barra superior com o seletor de idioma + título da aba no idioma escolhido. */
function CustomerShell({ children }: { children: ReactNode }) {
  const { lang, setLang, t } = useCustomerI18n();
  useEffect(() => {
    document.title = t.pageTitle;
  }, [t]);
  return (
    <>
      <div className="topbar">
        <LangSwitcher langs={CUSTOMER_LANGS} value={lang} onChange={setLang} label={t.langLabel} />
      </div>
      {children}
    </>
  );
}

function CustomerRoutes({ path }: { path: string }) {
  if (path === '/impressum') return <LegalPage kind="impressum" />;
  if (path === '/datenschutz') return <LegalPage kind="datenschutz" />;
  if (path === '/bestellung') return <OrderStatusPage />;
  return <OrderPage />;
}

/** Rotas simples (sem biblioteca): o Amplify serve index.html para qualquer caminho. */
function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/staff') {
    return (
      <Suspense fallback={<p className="status">…</p>}>
        <StaffApp />
      </Suspense>
    );
  }
  return (
    <LangProvider supported={CUSTOMER_LANGS} fallback={DEFAULT_LANG} storageKey={CUSTOMER_LANG_KEY}>
      <CustomerShell>
        <CustomerRoutes path={path} />
      </CustomerShell>
    </LangProvider>
  );
}

export default App;
