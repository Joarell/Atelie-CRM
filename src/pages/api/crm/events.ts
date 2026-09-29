import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getDb } from '../../../server/context';
import {
  userFromToken,
  userFromTokenString
} from '../../../server/auth';
import { json } from '../../../server/http';
import type { Database } from '../../../server/db';
import type { User } from '../../../domain/crm';

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 30000;

function createEventSender(controller: ReadableStreamDefaultController) {
  const encoder = new TextEncoder();
  return (eventType: string, data: unknown) => {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(payload));
  };
}

// Stored timestamps are uniform ISO-8601 UTC (`2026-09-25T04:44:16.968Z`,
// written by nowISO()/waTimestampToISO()/the seed SQL), so a plain lexical
// compare against the same-shape anchor is chronological — and unlike
// `datetime(?, 'utc')` (which yields a space-separated string) it never
// mis-sorts same-day values.
async function fetchNewMessages(db: Database, sinceIso: string) {
  return db
    .prepare(
      `SELECT m.*, c.name as contact_name, c.phone as contact_phone
       FROM messages m
       LEFT JOIN contacts c ON m.conversationId = c.id
       WHERE m.createdAt > ?
       ORDER BY m.createdAt ASC`
    )
    .bind(sinceIso)
    .all();
}

async function fetchNewConversations(db: Database, sinceIso: string) {
  return db
    .prepare('SELECT * FROM conversations WHERE createdAt > ?')
    .bind(sinceIso)
    .all();
}

async function fetchUpdatedConversations(
  db: Database, sinceIso: string
) {
  const sql =
    'SELECT * FROM conversations WHERE lastMessageAt > ?';
  return db.prepare(sql).bind(sinceIso).all();
}

function sendPayload(
  sendEvent: (eventType: string, data: unknown) => void,
  type: string,
  data: unknown,
  timestamp: number
): void {
  sendEvent(type, { data, timestamp });
}

async function pollOnce(
  sendEvent: (eventType: string, data: unknown) => void,
  getDb: () => Database,
  sinceIso: string
): Promise<void> {
  try {
    const db = getDb();
    const now = Date.now();

    const messages = await fetchNewMessages(db, sinceIso);
    if (messages.results.length > 0) {
      sendPayload(sendEvent, 'messages', messages.results, now);
    }

    const conversations = await fetchNewConversations(db, sinceIso);
    if (conversations.results.length > 0) {
      sendPayload(sendEvent, 'conversations', conversations.results, now);
    }

    const updated = await fetchUpdatedConversations(db, sinceIso);
    if (updated.results.length > 0) {
      sendPayload(sendEvent, 'conversations_updated', updated.results, now);
    }
  } catch (error) {
    console.error('SSE error:', error);
    sendPayload(sendEvent, 'error', String(error), Date.now());
  }
}

function setupEventLoop(
  sendEvent: (eventType: string, data: unknown) => void,
  getDb: () => Database,
  sinceIso: string
): {
  interval: ReturnType<typeof setInterval>;
  heartbeat: ReturnType<typeof setInterval>;
} {
  const interval = setInterval(() => {
    void pollOnce(sendEvent, getDb, sinceIso);
  }, POLL_INTERVAL_MS);

  const heartbeat = setInterval(() => {
    sendEvent('heartbeat', { timestamp: Date.now() });
  }, HEARTBEAT_INTERVAL_MS);

  return { interval, heartbeat };
}

function createSseStream(
  controller: ReadableStreamDefaultController,
  signal: AbortSignal,
  getDb: () => Database,
  sinceIso: string
): void {
  const sendEvent = createEventSender(controller);
  sendEvent('connected', { timestamp: Date.now() });

  const { interval, heartbeat } = setupEventLoop(sendEvent, getDb, sinceIso);

  signal.addEventListener('abort', () => {
    clearInterval(interval);
    clearInterval(heartbeat);
    controller.close();
  });
}

// An EventSource cannot set an `Authorization` header — only cookies and
// the URL — so the browser passes the session token as `?token=` (the
// localStorage `crm_token`). curl/headless callers may keep using Bearer.
async function resolveSseUser(
  db: Database, request: Request, url: URL
): Promise<User | null> {
  const queryToken = url.searchParams.get('token');
  return queryToken
    ? userFromTokenString(db, queryToken)
    : userFromToken(db, request);
}

function sinceIsoOf(url: URL): string {
  const since = url.searchParams.get('since');
  const last = since ? parseInt(since, 10) : Date.now();
  return new Date(last).toISOString();
}

// SSE endpoint for real-time CRM updates. Clients connect to this endpoint
// to receive push notifications when webhook events (messages, acks, etc.)
// are processed. The server periodically checks D1 for new events and
// pushes them to connected clients.
export const GET: APIRoute = async (context) => {
  const user = await resolveSseUser(
    getDb(), context.request, context.url
  );
  if (!user) return json({ error: 'sessao_invalida' }, 401);

  const sinceIso = sinceIsoOf(context.url);

  const stream = new ReadableStream({
    start(controller) {
      createSseStream(controller, context.request.signal, getDb, sinceIso);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
};