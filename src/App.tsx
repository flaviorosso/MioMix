import { lazy, Suspense } from 'react';
import { LegalPage } from './pages/LegalPage';
import { OrderPage } from './pages/OrderPage';

// O painel staff (login, gestão) só é baixado quando alguém abre /staff.
const StaffApp = lazy(() => import('./staff/StaffApp'));

/** Rotas simples (sem biblioteca): o Amplify serve index.html para qualquer caminho. */
function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/impressum') return <LegalPage title="Impressum" />;
  if (path === '/datenschutz') return <LegalPage title="Datenschutz" />;
  if (path === '/staff') {
    return (
      <Suspense fallback={<p className="status">Wird geladen …</p>}>
        <StaffApp />
      </Suspense>
    );
  }
  return <OrderPage />;
}

export default App;
