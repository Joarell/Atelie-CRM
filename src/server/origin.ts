import { json } from './http';

const FORBIDDEN = json({ error: 'origem_nao_permitida' }, 403);

// Same-origin guard for the session endpoints. Browsers attach an `Origin`
// header to these requests; when it does not match the request's own URL,
// reject — a cross-origin page must not be able to log in, log out or
// change passwords with a session it never held. Non-browser clients (no
// Origin header) pass through: the WAHA engine calls webhooks server-side.
export function assertSameOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const requestOrigin = new URL(request.url).origin;
  try {
    const received = new URL(origin).origin;
    return received === requestOrigin ? null : FORBIDDEN;
  } catch {
    return FORBIDDEN;
  }
}