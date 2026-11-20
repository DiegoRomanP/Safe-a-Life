import { useState, type KeyboardEvent, type Ref } from 'react';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';
import { mapboxEnabled, searchAddress, type AddressResult } from '../../lib/mapbox.js';

type Props = {
  onSelect: (latitude: string, longitude: string) => void;
  // Inyectable para las pruebas.
  search?: typeof searchAddress;
  enabled?: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  // Hay una ubicación guardada: se avisa sin mostrar sus coordenadas.
  hasLocation?: boolean;
};

// Busca una dirección en Perú con Mapbox y rellena latitud y longitud ya
// redondeadas. No es un <form> para no enviar el formulario del perfil con Enter.
export function AddressSearch({ onSelect, search = searchAddress, enabled = mapboxEnabled, error, inputRef, hasLocation = false }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressResult[]>([]);
  const [status, setStatus] = useState(hasLocation ? 'Ya tienes una ubicación guardada. Busca otra dirección para cambiarla.' : '');
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
      <Field label="Tu dirección" required={!hasLocation} error={error} hint="Escribe tu calle o distrito, sin número exacto, y elige una opción. Se envía a Mapbox solo para buscar; guardamos una ubicación aproximada (~110 m), no tu dirección.">
        {(control) => (
          <div className="flex gap-3">
            <Input {...control} ref={inputRef} autoComplete="off" placeholder="Av. Arequipa, Miraflores" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} />
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
