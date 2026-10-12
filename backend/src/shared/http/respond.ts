import type { Response } from 'express';

export function sendData(res: Response, status: number, data: unknown): void {
  res.status(status).type('application/json').json({ data });
}

export function sendNoContent(res: Response): void {
  res.status(204).end();
}
