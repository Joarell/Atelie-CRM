// Tiny, single-purpose helper: every API route returns JSON the same way.
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function notFound(message = 'Not found'): Response {
  return json({ error: message }, 404);
}
