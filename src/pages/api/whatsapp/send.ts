import type { APIContext, APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { userFromToken } from '../../../server/auth';
import { getDb } from '../../../server/context';
import { json } from '../../../server/http';
import { readWahaConfig, WahaClient } from '../../../server/waha';
import { sendWahaText, WahaSendError } from '../../../server/wahaIngest';

// Sends a text through the WAHA engine into an existing WhatsApp conversation
// (the row is persisted first as `queued`, then flipped to `sent`/`failed`).
// Errors carry only safe codes — never a WAHA response body.

export const POST: APIRoute = async (context) => {
  const db = getDb();
  const user = await userFromToken(db, context.request);
  if (!user) return json({ error: 'sessao_invalida' }, 401);

  const config = readWahaConfig(env);
  if (!config) return json({ error: 'waha_nao_configurado' }, 503);

  const parsed = await parseSendBody(context);
  if (!parsed.ok) return parsed.response;

  const client = new WahaClient(config);
  try {
    const message = await sendWahaText(db, client, {
      conversationId: parsed.value.conversationId,
      text: parsed.value.text,
      userId: user.id,
      replyTo: parsed.value.replyTo
    });
    return json({ message }, 201);
  } catch (error) {
    return sendErrorResponse(error);
  }
};

type SendBodyValues = {
  conversationId: string;
  text: string;
  replyTo: string | null;
};

type SendBodyParse =
  | { ok: true; value: SendBodyValues }
  | { ok: false; response: Response };

async function parseSendBody(
  context: APIContext
): Promise<SendBodyParse> {
  let body: { conversationId?: unknown; text?: unknown; replyTo?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  const value = {
    conversationId:
      typeof body.conversationId === 'string' ? body.conversationId : '',
    text: typeof body.text === 'string' ? body.text.trim() : '',
    replyTo:
      typeof body.replyTo === 'string' && body.replyTo.trim().length > 0
        ? body.replyTo.trim()
        : null
  } as SendBodyValues;
  if (!value.conversationId || !value.text) {
    return {
      ok: false,
      response: json({ error: 'validation_failed' }, 422)
    };
  }
  return { ok: true, value };
}

function sendErrorResponse(error: unknown): Response {
  if (error instanceof WahaSendError) {
    if (error.code === 'conversation_not_found') {
      return json({ error: 'conversation_not_found' }, 404);
    }
    if (error.code === 'wrong_channel') {
      return json({ error: 'wrong_channel' }, 422);
    }
    if (error.code === 'missing_phone') {
      return json({ error: 'missing_phone' }, 422);
    }
  }
  const detail =
    error instanceof Error ? error.message.slice(0, 200) : 'waha_unknown';
  return json({ error: detail }, 502);
}