// Formatos de fecha del producto: absolutos y con zona horaria explícita
// (Penpot: «Fechas absolutas y zona horaria»). Lima no tiene horario de
// verano, así que la etiqueta es fija. Los meses van en minúscula y sin punto,
// como en Penpot («24 sep 2026»).
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const LIMA_ZONE_LABEL = 'Lima, UTC−5';

const limaParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(iso: string) {
  const values = Object.fromEntries(limaParts.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return {
    day: Number(values.day),
    month: MONTHS[Number(values.month) - 1],
    year: values.year,
    time: `${values.hour}:${values.minute}`,
  };
}

/** «24 sep 2026» en hora de Lima. */
export function formatDate(iso: string): string {
  const { day, month, year } = parts(iso);
  return `${day} ${month} ${year}`;
}

/** «24 sep 2026, 18:00» en hora de Lima, sin la zona. */
export function formatDateTimeShort(iso: string): string {
  const { day, month, year, time } = parts(iso);
  return `${day} ${month} ${year}, ${time}`;
}

/** «24 sep 2026, 18:00 · Lima, UTC−5». */
export function formatDateTime(iso: string): string {
  return `${formatDateTimeShort(iso)} · ${LIMA_ZONE_LABEL}`;
}

export type BloodType = 'O_NEG' | 'O_POS' | 'A_NEG' | 'A_POS' | 'B_NEG' | 'B_POS' | 'AB_NEG' | 'AB_POS';

/** Grupo declarado con su símbolo habitual: «A_POS» → «A+». */
export function bloodTypeLabel(value: BloodType): string {
  const [group, sign] = value.split('_');
  return `${group}${sign === 'POS' ? '+' : '−'}`;
}
