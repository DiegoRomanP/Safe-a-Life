// Une clases de Tailwind e ignora los valores vacíos.
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
