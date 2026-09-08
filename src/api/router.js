import { handleFamilies } from './families.js';
import { handlePeople } from './people.js';
import { jsonResponse } from './utils.js';
import { handleHousehold } from './household.js';
import { handleDirectory } from './directory.js';

export function createApiRouter() {
  return async function handleApiRequest(request, env, member) {
    const url = new URL(request.url);

    if (url.pathname === '/api/me' && request.method === 'GET') {
      const person = await env.DB.prepare('SELECT id, first_name, last_name FROM people WHERE lower(trim(login_email))=? AND deleted_at IS NULL').bind(member.email.trim().toLowerCase()).first();
      return jsonResponse({ member: { ...member, person: person || null } });
    }
    const directory = url.pathname.match(/^\/api\/directory(?:\/(people|relationships)(?:\/([^/]+))?)?$/);
    if (directory) return handleDirectory(request, env, directory[1], directory[2]);
    const household = url.pathname.match(/^\/api\/(groceries|news|events)(?:\/([^/]+))?$/);
    if (household) return handleHousehold(request, env, member, household[1], household[2]);

    if (url.pathname === '/api/families') {
      return handleFamilies(request, env);
    }

    if (url.pathname === '/api/people') {
      return handlePeople(request, env);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  };
}
