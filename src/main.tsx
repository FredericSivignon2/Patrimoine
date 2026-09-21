import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { FinancialProvider } from './context/FinancialContext';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable.');

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <FinancialProvider>
          <App />
        </FinancialProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);
