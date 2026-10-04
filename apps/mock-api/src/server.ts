import { createApp } from './app.js';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4011;

if (process.env.NODE_ENV === 'production') {
  throw new Error('El mock local no puede ejecutarse en producción.');
}

const configuredPort = Number(process.env.MOCK_API_PORT ?? DEFAULT_PORT);
if (!Number.isInteger(configuredPort) || configuredPort < 0 || configuredPort > 65535) {
  throw new Error('El puerto del mock local no es válido.');
}

const server = createApp().listen(configuredPort, HOST, () => {
  const address = server.address();
  if (address && typeof address !== 'string') {
    process.stdout.write(`MOCK_API_READY:${address.port}\n`);
  }
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
