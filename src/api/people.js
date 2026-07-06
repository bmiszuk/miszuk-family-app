import { jsonResponse, readJsonBody, validateRequiredString } from './utils.js';

export async function handlePeople(request, env) {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const familyId = url.searchParams.get('familyId');

    if (familyId && familyId.trim() === '') {
      return jsonResponse({ error: 'familyId must not be empty' }, 400);
    }

    let query = 'SELECT id, family_id, first_name, last_name, nickname, birth_date, notes, created_at, updated_at FROM people';
    const params = [];

    if (familyId) {
      query += ' WHERE family_id = ?';
      params.push(familyId);
    }

    query += ' ORDER BY created_at DESC';

    const statement = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);

    try {
      const { results } = await statement.all();
      return jsonResponse({ people: results });
    } catch {
      return jsonResponse({ error: 'Failed to load people' }, 500);
    }
  }

  if (request.method === 'POST') {
    let body;

    try {
      body = await readJsonBody(request);
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const firstNameError = validateRequiredString(body?.first_name, 'first_name');
    const familyIdError = validateRequiredString(body?.family_id, 'family_id');

    if (firstNameError) {
      return jsonResponse({ error: firstNameError }, 400);
    }

    if (familyIdError) {
      return jsonResponse({ error: familyIdError }, 400);
    }

    const personId = crypto.randomUUID();

    try {
      const statement = env.DB.prepare(
        'INSERT INTO people (id, family_id, first_name, last_name, nickname, birth_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      await statement
        .bind(
          personId,
          body.family_id.trim(),
          body.first_name.trim(),
          body.last_name?.trim() ?? null,
          body.nickname?.trim() ?? null,
          body.birth_date?.trim() ?? null,
          body.notes?.trim() ?? null
        )
        .run();

      return jsonResponse(
        {
          person: {
            id: personId,
            family_id: body.family_id.trim(),
            first_name: body.first_name.trim(),
            last_name: body.last_name?.trim() ?? null,
            nickname: body.nickname?.trim() ?? null,
            birth_date: body.birth_date?.trim() ?? null,
            notes: body.notes?.trim() ?? null,
          },
        },
        201
      );
    } catch (error) {
      return jsonResponse({ error: 'Failed to create person' }, 500);
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}
