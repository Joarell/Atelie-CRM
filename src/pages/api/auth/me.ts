import type { APIRoute } from 'astro';
import { getDb } from '../../../server/context';
import { userFromToken, publicUser } from '../../../server/auth';
import { assertSameOrigin } from '../../../server/origin';
import { json, notFound } from '../../../server/http';

export const GET: APIRoute = async (context) => {
	const blocked = assertSameOrigin(context.request);
	if (blocked) return blocked;
	const user = await userFromToken(getDb(), context.request);
	return user ? json(publicUser(user)) : notFound('sessao_invalida');
};