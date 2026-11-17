import { LegalPage } from './pages/LegalPage';
import { OrderPage } from './pages/OrderPage';

/** Rotas simples (sem biblioteca): o Amplify serve index.html para qualquer caminho. */
function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/impressum') return <LegalPage title="Impressum" />;
  if (path === '/datenschutz') return <LegalPage title="Datenschutz" />;
  return <OrderPage />;
}

export default App;
