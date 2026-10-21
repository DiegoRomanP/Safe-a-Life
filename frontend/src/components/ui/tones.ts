export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

// Fondo suave y texto con contraste suficiente para cada tono.
export const toneClass: Record<Tone, string> = {
  info: 'bg-soft-blue text-petrol',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-neutral-soft text-muted',
};
