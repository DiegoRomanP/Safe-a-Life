import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, ApiError, type AuthSession } from './api/client.js';
import { LoadingState, Notice } from './components/Ui.js';
import { Workspace } from './components/Workspace.js';
import { LandingPage, LoginPage } from './pages/AccessPages.js';

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  async function checkSession() {
    setCheckingSession(true);
    setSessionError(null);
    try {
      setSession(await api.getCurrentSession());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSession(null);
      } else {
        setSessionError('No se pudo comprobar la sesión local.');
      }
    } finally {
      setCheckingSession(false);
    }
  }

  useEffect(() => {
    if (window.location.pathname.startsWith('/app')) {
      void checkSession();
    } else {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    const expireSession = () => setSession(null);
    window.addEventListener('save-a-life:session-expired', expireSession);
    return () => window.removeEventListener('save-a-life:session-expired', expireSession);
  }, []);

  useEffect(() => {
    if (!session?.expiresAt) return;
    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      setSession(null);
      return;
    }
    const timeoutId = window.setTimeout(() => setSession(null), expiresAt - Date.now());
    return () => window.clearTimeout(timeoutId);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let checking = false;
    async function revalidateWhenVisible() {
      if (document.visibilityState !== 'visible' || checking) return;
      checking = true;
      try {
        setSession(await api.getCurrentSession());
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) setSession(null);
      } finally {
        checking = false;
      }
    }
    window.addEventListener('focus', revalidateWhenVisible);
    document.addEventListener('visibilitychange', revalidateWhenVisible);
    return () => {
      window.removeEventListener('focus', revalidateWhenVisible);
      document.removeEventListener('visibilitychange', revalidateWhenVisible);
    };
  }, [session]);

  if (checkingSession) return <LoadingState label="Comprobando la sesión local" />;
  if (sessionError) {
    return (
      <main className="standalone-state">
        <Notice tone="error" title="El servicio local no está disponible">
          <p>{sessionError}</p>
          <button className="button button--secondary" onClick={() => void checkSession()}>
            Reintentar
          </button>
        </Notice>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to="/app" replace /> : <LandingPage />} />
      <Route
        path="/login"
        element={session
          ? <Navigate to="/app" replace />
          : <LoginPage onLogin={async (email, password) => setSession(await api.login(email, password))} />}
      />
      <Route
        path="/app/*"
        element={session ? <Workspace session={session} onLogout={async () => {
          await api.logout();
          setSession(null);
        }} /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={session ? '/app' : '/'} replace />} />
    </Routes>
  );
}
