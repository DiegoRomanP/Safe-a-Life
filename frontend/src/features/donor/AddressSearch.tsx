import { useState, type KeyboardEvent } from 'react';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';
import { mapboxEnabled, searchAddress, type AddressResult } from '../../lib/mapbox.js';

type Props = {
  onSelect: (latitude: string, longitude: string) => void;
  // Inyectable para las pruebas.
  search?: typeof searchAddress;
  enabled?: boolean;
};

// Busca una dirección en Perú con Mapbox y rellena latitud y longitud ya
// redondeadas. No es un <form> para no enviar el formulario del perfil con Enter.
export function AddressSearch({ onSelect, search = searchAddress, enabled = mapboxEnabled }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressResult[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;

  async function run() {
    if (query.trim().length < 3 || busy) return setStatus('Escribe al menos 3 caracteres.');
    setBusy(true);
    setStatus('Buscando…');
    try {
      const found = await search(query.trim());
      setResults(found);
      setStatus(found.length ? 'Elige tu zona:' : 'No encontramos esa dirección en Lima. Prueba con el distrito o una calle cercana.');
    } catch {
      setResults([]);
      setStatus('No se pudo buscar. Escribe latitud y longitud a mano.');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void run();
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Buscar dirección" hint="Escribe tu calle o distrito, sin número exacto. Se envía a Mapbox solo para buscar; guardamos coordenadas redondeadas (~110 m).">
        {(control) => (
          <div className="flex gap-3">
            <Input {...control} autoComplete="off" placeholder="Av. Arequipa, Miraflores" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} />
            <Button variant="secondary" aria-disabled={busy} onClick={() => void run()}>Buscar</Button>
          </div>
        )}
      </Field>
      <p aria-live="polite" className="text-sm text-muted">{status}</p>
      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((item) => (
            <li key={`${item.latitude},${item.longitude},${item.label}`}>
              <Button
                variant="ghost"
                fullWidth
                className="justify-start text-left"
                onClick={() => {
                  onSelect(item.latitude, item.longitude);
                  setResults([]);
                  setStatus(`Ubicación elegida: ${item.label} (aprox.)`);
                }}
              >
                {item.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
