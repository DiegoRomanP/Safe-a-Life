// Búsqueda de direcciones con la Geocoding API v6 de Mapbox. Solo se usa un
// token público (pk.) restringido por URL; sin token la búsqueda se oculta y
// quedan los campos de latitud y longitud.
const TOKEN: string | undefined = import.meta.env.VITE_MAPBOX_TOKEN || undefined;
export const mapboxEnabled = Boolean(TOKEN);

export type AddressResult = { label: string; latitude: string; longitude: string };

// Mismo rectángulo que el polígono DEMO_ONLY-1 del backend (lon mín, lat mín, lon máx, lat máx).
const LIMA_BBOX = '-77.2,-12.3,-76.85,-11.8';

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
