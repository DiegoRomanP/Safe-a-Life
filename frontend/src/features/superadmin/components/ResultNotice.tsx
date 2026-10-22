import { useEffect, useRef } from 'react';
import { SuccessNotice } from '../../../components/states/SuccessNotice.js';

export type Notice = { id: number; message: string; detail?: string };

// Región aria-live persistente con el resultado de la última acción. El aviso
// recibe el foco al cambiar, porque el control que se pulsó puede desaparecer.
export function ResultNotice({ notice }: { notice: Notice | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notice) ref.current?.focus();
  }, [notice]);

  return (
    <div aria-live="polite">
      {notice && (
        <div ref={ref} tabIndex={-1} className="rounded-xl focus-visible:outline-focus">
          <SuccessNotice announce={false} message={notice.message} detail={notice.detail} />
        </div>
      )}
    </div>
  );
}
