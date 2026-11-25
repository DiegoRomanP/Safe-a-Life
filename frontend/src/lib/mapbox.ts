// Búsqueda de direcciones con la Geocoding API v6 de Mapbox. Solo se usa un
// token público (pk.) restringido por URL; sin token la búsqueda se oculta y
// quedan los campos de latitud y longitud.
// En pruebas se ignora el .env local para que los formularios sean deterministas.
const TOKEN: string | undefined = import.meta.env.MODE === 'test' ? undefined : import.meta.env.VITE_MAPBOX_TOKEN || undefined;
export const mapboxEnabled = Boolean(TOKEN);

export type AddressResult = { label: string; latitude: string; longitude: string };

// Rectángulo envolvente del polígono DEMO_ONLY-1: acota el mapa y la búsqueda. La validez de un punto la decide
// el polígono (features/donor/location.ts).
export const LIMA_BOUNDS = { minLon: -77.2, minLat: -12.3, maxLon: -76.85, maxLat: -11.8 };
// Formato de Mapbox: lon mín, lat mín, lon máx, lat máx.
const LIMA_BBOX = [LIMA_BOUNDS.minLon, LIMA_BOUNDS.minLat, LIMA_BOUNDS.maxLon, LIMA_BOUNDS.maxLat].join(',');

type Feature = { properties: { name?: string; full_address?: string; place_formatted?: string; coordinates: { latitude: number; longitude: number } } };

export async function searchAddress(query: string, signal?: AbortSignal, token = TOKEN): Promise<AddressResult[]> {
  const params = new URLSearchParams({ q: query, country: 'pe', bbox: LIMA_BBOX, language: 'es', limit: '5', access_token: token ?? '' });
  // 'origin' envía el Referer que Mapbox necesita para la restricción por URL, aunque el sitio use no-referrer.
  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, { signal, referrerPolicy: 'origin' });
  if (!response.ok) throw new Error(`Mapbox ${response.status}`);
  const { features } = (await response.json()) as { features: Feature[] };
  return features.map(({ properties: p }) => ({
    label: p.full_address ?? [p.name, p.place_formatted].filter(Boolean).join(', '),
    // El contrato admite hasta tres decimales (~110 m): se redondea antes de rellenar el formulario.
    latitude: p.coordinates.latitude.toFixed(3),
    longitude: p.coordinates.longitude.toFixed(3),
  }));
}
