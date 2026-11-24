import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { NeedCoverage } from '../types.js';

const km = (value: number) => value.toLocaleString('es-PE', { maximumFractionDigits: 2 });
// Los conteos son cubos hacia abajo (0, 5, 10, 25): se dicen como «al menos N», nunca como una cifra exacta.
const atLeast = (count: number) => (count === 0 ? '0' : `Al menos ${count}`);
const donors = (count: number | null) => (count === null ? 'Menos de 5 donantes compatibles sin invitar' : `${atLeast(count)} ${count === 1 ? 'donante compatible sin invitar' : 'donantes compatibles sin invitar'}`);

// Zoom que deja el radio dentro del mapa (~420 px de alto); fijo y sin fitBounds para no depender del tamaño del contenedor.
const zoomFor = (radiusKm: number) => Math.min(14, Math.max(8, Math.round(14 - Math.log2(radiusKm))));
const CELL_RADIUS_M = 550; // la rejilla es de 0,01° (~1,1 km): cada celda se dibuja como un círculo de ese tamaño
const COLOR = '#164e63'; // --color-petrol

// Solo agregados (RF-VIS-01/02): la sede, el radio y las celdas con al menos 3 donantes. Ninguna posición individual llega aquí.
// El mapa no es el único canal: la tabla de anillos dice lo mismo para quien no puede usarlo.
export function CoverageMap({ coverage }: { coverage: NeedCoverage }) {
  const container = useRef<HTMLDivElement>(null);
  const { site, radiusKm, cells } = coverage;

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const center: L.LatLngTuple = [site.latitude, site.longitude];
    const map = L.map(element, {
      center, zoom: zoomFor(radiusKm), zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, scrollWheelZoom: false,
    });
    // OSM exige Referer y el sitio usa Referrer-Policy no-referrer: 'origin' envía solo el origen (mismo criterio que lib/mapbox.ts).
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', referrerPolicy: 'origin',
    }).addTo(map);
    L.circle(center, { radius: radiusKm * 1000, color: COLOR, weight: 2, fillOpacity: 0.04, interactive: false }).addTo(map);
    const peak = Math.max(1, ...cells.map((cell) => cell.count));
    for (const cell of cells) {
      L.circle([cell.latitude, cell.longitude], {
        radius: CELL_RADIUS_M, stroke: false, fillColor: COLOR, fillOpacity: 0.25 + 0.5 * (cell.count / peak), interactive: false,
      }).addTo(map);
    }
    // circleMarker y no L.marker: el icono por defecto son imágenes que el bundler rompe y la CSP no necesita.
    L.circleMarker(center, { radius: 7, color: '#ffffff', weight: 2, fillColor: COLOR, fillOpacity: 1, interactive: false }).addTo(map);
    return () => { map.remove(); };
  }, [site.latitude, site.longitude, radiusKm, cells]);

  return (
    <section aria-labelledby="cobertura-titulo" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 id="cobertura-titulo" className="text-xl font-semibold text-ink">Cobertura de donantes compatibles</h2>
        <p className="text-muted">
          {`${donors(coverage.compatibleCount)} dentro de ${km(radiusKm)} km.${coverage.nextBatchCount === null ? '' : ` Un lote invitaría hoy a ${atLeast(coverage.nextBatchCount).toLowerCase()} ${coverage.nextBatchCount === 1 ? 'persona' : 'personas'}.`}`}
        </p>
      </div>
      <div
        ref={container}
        role="img"
        aria-label={`Mapa con la sede y el radio de ${km(radiusKm)} km; las zonas más oscuras tienen más donantes compatibles sin invitar. La tabla siguiente dice lo mismo.`}
        className="h-[420px] w-full overflow-hidden rounded-lg border border-line"
      />
      <table className="w-full text-left">
        <caption className="pb-2 text-left text-sm font-semibold text-muted">Donantes compatibles sin invitar, por distancia a la sede</caption>
        <thead>
          <tr className="border-b border-line text-sm text-muted">
            <th scope="col" className="py-2 pr-4 font-semibold">Distancia</th>
            <th scope="col" className="py-2 font-semibold">Donantes</th>
          </tr>
        </thead>
        <tbody>
          {coverage.rings.map((ring) => (
            <tr key={`${ring.fromKm}-${ring.toKm}`} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 pr-4 font-normal text-ink">{`${km(ring.fromKm)}–${km(ring.toKm)} km`}</th>
              <td className="py-2 text-ink">{ring.count === null ? 'Menos de 5' : atLeast(ring.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-muted">
        Solo se muestran conteos agregados; nunca la ubicación de una persona. Los conteos son aproximados («al menos»); las zonas y las distancias con menos de 5 donantes no se detallan. Es una preselección por grupo declarado: el hospital verifica identidad, grupo y elegibilidad.
      </p>
    </section>
  );
}
