import { handleFamilies } from './families.js';
import { handlePeople } from './people.js';
import { jsonResponse } from './utils.js';
import { handleHousehold } from './household.js';

export function createApiRouter() {
  return async function handleApiRequest(request, env, member) {
    const url = new URL(request.url);

    if (url.pathname === '/api/me' && request.method === 'GET') return jsonResponse({ member });
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
