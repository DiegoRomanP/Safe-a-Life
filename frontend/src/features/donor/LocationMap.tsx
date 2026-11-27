import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useId, useRef, useState } from 'react';
import { LIMA_BOUNDS } from '../../lib/mapbox.js';
import { insideLima } from './location.js';

const { minLat, minLon, maxLat, maxLon } = LIMA_BOUNDS;
const LIMA_CENTER: L.LatLngTuple = [-12.05, -77.04];

// Textos por defecto del donante; la sede del hospital usa los suyos.
const DONOR_LABELS = {
  group: 'Mapa de tu ubicación aproximada',
  map: 'Mapa para marcar tu zona',
  marked: 'Ubicación aproximada marcada en el mapa',
  prompt: 'Haz clic en el mapa para marcar tu zona aproximada',
  source: 'El mapa se carga desde OpenStreetMap; guardamos solo una zona aproximada (~110 m)',
};

type Props = {
  latitude: string;
  longitude: string;
  onChange: (latitude: string, longitude: string) => void;
  labels?: typeof DONOR_LABELS;
};

// Zona aproximada del contrato: tres decimales (~110 m) y solo dentro de Lima; fuera (o sin número), null.
export function toApproximate(latitude: number, longitude: number) {
  const rounded = { latitude: latitude.toFixed(3), longitude: longitude.toFixed(3) };
  // Se valida lo que se va a guardar: el punto ya redondeado.
  return insideLima(Number(rounded.latitude), Number(rounded.longitude)) ? rounded : null;
}

// Con Mapbox no hay campos de coordenadas: el mapa se ajusta también con teclado (flechas, zoom y Enter).
// El marcador no recibe foco porque no añade ninguna acción.
export function LocationMap({ latitude, longitude, onChange, labels = DONOR_LABELS }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickRef = useRef<(at: L.LatLng) => L.LatLngExpression | null>(() => null);
  // El rechazo vale para la ubicación vigente al hacer clic: al llegar otra, el aviso se va solo.
  const current = `${latitude},${longitude}`;
  const [rejectedAt, setRejectedAt] = useState<string | null>(null);
  const helpId = useId();
  // La mira del centro es solo para teclado. :focus-visible no sirve: Leaflet enfoca el mapa por código al hacer clic.
  const [keyboard, setKeyboard] = useState(false);
  // Number('') es 0, que queda fuera de Lima: un campo vacío equivale a «sin ubicación».
  const point = toApproximate(Number(latitude), Number(longitude));
  const lat = point?.latitude;
  const lon = point?.longitude;

  useEffect(() => {
    pickRef.current = (at) => {
      const next = toApproximate(at.lat, at.lng);
      setRejectedAt(next ? null : current);
      if (!next) return null;
      onChange(next.latitude, next.longitude);
      return [Number(next.latitude), Number(next.longitude)];
    };
  });

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const map = L.map(element, {
      center: LIMA_CENTER, zoom: 11, maxBounds: [[minLat, minLon], [maxLat, maxLon]], zoomControl: false,
      zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, scrollWheelZoom: false,
      keyboardPanDelta: 25,
    });
    L.control.zoom({ zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    // Sin el prefijo ni navegación en la misma pestaña: un enlace del mapa no debe sacar a nadie del formulario.
    map.attributionControl.setPrefix(false);
    // OSM exige Referer y el sitio usa Referrer-Policy no-referrer: 'origin' envía solo el origen (mismo criterio que lib/mapbox.ts).
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, referrerPolicy: 'origin',
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on('click', (event) => { pickRef.current(event.latlng); });
    // Enter marca el centro solo con el foco en el propio mapa: en el zoom o la atribución conserva su acción.
    const markCenter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.target !== element) return;
      event.preventDefault();
      pickRef.current(map.getCenter());
    };
    element.addEventListener('keydown', markCenter);
    // keyup: al llegar con Tab, la tecla ya se suelta sobre el mapa.
    const showCenter = (event: Event) => { if (event.target === element) setKeyboard(true); };
    const hideCenter = () => setKeyboard(false);
    element.addEventListener('keyup', showCenter);
    element.addEventListener('pointerdown', hideCenter, true);
    element.addEventListener('blur', hideCenter);
    mapRef.current = map;
    return () => {
      element.removeEventListener('keydown', markCenter);
      element.removeEventListener('keyup', showCenter);
      element.removeEventListener('pointerdown', hideCenter, true);
      element.removeEventListener('blur', hideCenter);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat === undefined || lon === undefined) {
      map.setView(LIMA_CENTER, 11);
      return;
    }
    const position: L.LatLngTuple = [Number(lat), Number(lon)];
    map.setView(position, Math.max(map.getZoom(), 15));
    const circle = L.circle(position, { radius: 110, color: '#164e63', weight: 2, fillOpacity: 0.15, interactive: false }).addTo(map);
    // divIcon y no el icono por defecto: son imágenes que el bundler rompe y la CSP no necesita.
    const marker = L.marker(position, {
      draggable: true, keyboard: false,
      icon: L.divIcon({ className: 'rounded-full border-2 border-white bg-petrol shadow', iconSize: [20, 20] }),
    }).addTo(map);
    // Se ajusta al punto redondeado o, si se soltó fuera de Lima, vuelve al anterior.
    marker.on('dragend', () => { marker.setLatLng(pickRef.current(marker.getLatLng()) ?? position); });
    return () => { marker.remove(); circle.remove(); };
  }, [lat, lon]);

  return (
    <div role="group" aria-label={labels.group} className="flex flex-col gap-2">
      <div className="relative">
        <div
          ref={container}
          role="application"
          aria-label={labels.map}
          aria-describedby={helpId}
          className="isolate h-72 w-full overflow-hidden rounded-lg border border-line"
        />
        {/* Mira del centro: el punto que marca Enter. */}
        {keyboard && (
          <span
            data-map-center
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-ink ring-2 ring-white"
          >
            <span className="size-1.5 rounded-full bg-ink ring-1 ring-white" />
          </span>
        )}
      </div>
      <p id={helpId} className="text-sm text-muted">Con teclado: flechas para mover el mapa, + y − para el zoom y Enter para marcar el centro.</p>
      <p aria-live="polite" className="text-sm font-semibold text-ink">
        {rejectedAt === current
          ? 'Elige un punto dentro de Lima'
          : point ? labels.marked : labels.prompt}
      </p>
      <p className="text-sm text-muted">{labels.source}</p>
    </div>
  );
}
