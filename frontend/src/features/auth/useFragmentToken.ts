import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Los correos enlazan a `/<ruta>#<token>` (ADR-005): el fragmento no viaja al
// servidor ni al Referer. Al montar, el token se guarda solo en memoria y se
// borra de la dirección para que no quede en el historial ni se comparta por
// error (RNF-SEC-13). Nunca se registra ni se muestra.
// Mismo mínimo que ActionToken y RecoveryToken en docs/openapi.json.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43,256}$/;

export type FragmentToken = { token: string | null; malformed: boolean };

export function useFragmentToken(): FragmentToken {
  const location = useLocation();
  const navigate = useNavigate();
  const [value] = useState<FragmentToken>(() => {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return { token: null, malformed: false };
    return TOKEN_SHAPE.test(raw) ? { token: raw, malformed: false } : { token: null, malformed: true };
  });

  useEffect(() => {
    if (location.hash) navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  return value;
}
