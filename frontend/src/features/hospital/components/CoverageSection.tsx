import { lazy, Suspense, useCallback } from 'react';
import { QueryView } from '../../../components/states/QueryView.js';
import { useDemoQuery } from '../../../lib/useDemoQuery.js';
import { fetchCoverage } from '../api.js';

// Leaflet pesa ~40 kB comprimido y solo lo necesita esta sección: se descarga cuando se abre una necesidad.
const CoverageMap = lazy(() => import('./CoverageMap.js').then((module) => ({ default: module.CoverageMap })));

// Cobertura agregada de donantes compatibles (getNeedCoverage). `version` cambia cuando cambia la necesidad (p. ej. al publicar)
// para volver a pedirla: tras un lote, los invitados dejan de ser candidatos.
export function CoverageSection({ needId, version }: { needId: string; version: string }) {
  const load = useCallback(() => fetchCoverage(needId), [needId, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const query = useDemoQuery(load, `coverage:${needId}`);
  return (
    <QueryView query={query} loadingMessage="Calculando la cobertura…" backTo="/hospital/necesidades" backLabel="Ir a necesidades">
      {(coverage) => (
        <Suspense fallback={<p className="text-muted">Cargando el mapa…</p>}>
          <CoverageMap coverage={coverage} />
        </Suspense>
      )}
    </QueryView>
  );
}
