import { handleFamilies } from './families.js';
import { handlePeople } from './people.js';
import { jsonResponse } from './utils.js';

export function createApiRouter() {
  return async function handleApiRequest(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/families') {
      return handleFamilies(request, env);
    }

    if (url.pathname === '/api/people') {
      return handlePeople(request, env);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  };
}
