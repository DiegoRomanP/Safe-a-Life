// Solo desarrollo: con EMAIL_PROVIDER=dev-mailbox los correos se leen en el buzón local (`npm run dev:mailbox`).
export function DevMailboxLink() {
  if (!import.meta.env.DEV) return null;
  return (
    <a
      href={import.meta.env.VITE_DEV_MAILBOX_URL ?? 'http://127.0.0.1:4025'}
      target="_blank"
      rel="noreferrer"
      className="self-start rounded font-semibold text-petrol underline underline-offset-4"
    >
      Abrir buzón de desarrollo
    </a>
  );
}
