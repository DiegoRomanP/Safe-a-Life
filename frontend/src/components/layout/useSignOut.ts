import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../../features/auth/session/session.js';

// Cerrar sesión borra la sesión del servidor y de memoria y vuelve a /ingresar. La comparten AppLayout y FocusLayout.
export function useSignOut() {
  const navigate = useNavigate();
  const [closing, setClosing] = useState(false);
  const signOut = () => {
    if (closing) return;
    setClosing(true);
    void logout().then(
      () => navigate('/ingresar', { replace: true }),
      () => navigate('/ingresar', { replace: true, state: { logoutFailed: true } }),
    );
  };
  return { closing, signOut };
}
