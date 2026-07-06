import { jsonResponse, readJsonBody, validateRequiredString } from './utils.js';

export async function handleFamilies(request, env) {
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        'SELECT id, name, description, created_at, updated_at FROM families ORDER BY created_at DESC'
      ).all();

      return jsonResponse({ families: results });
    } catch {
      return jsonResponse({ error: 'Failed to load families' }, 500);
    }
  }

  if (request.method === 'POST') {
    let body;

    try {
      body = await readJsonBody(request);
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const nameError = validateRequiredString(body?.name, 'name');
    if (nameError) {
      return jsonResponse({ error: nameError }, 400);
    }

    const familyId = crypto.randomUUID();

    try {
      const statement = env.DB.prepare(
        'INSERT INTO families (id, name, description) VALUES (?, ?, ?)'
      );
      await statement.bind(familyId, body.name.trim(), body.description?.trim() ?? null).run();

      return jsonResponse(
        {
          family: {
            id: familyId,
            name: body.name.trim(),
            description: body.description?.trim() ?? null,
          },
        },
        201
      );
    } catch (error) {
      return jsonResponse({ error: 'Failed to create family' }, 500);
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}
