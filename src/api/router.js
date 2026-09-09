import {householdIdentity,handleHouseholds} from './households.js';
import {handleDinner} from './dinner.js';
import { handleFamilies } from './families.js';
import { handlePeople } from './people.js';
import { jsonResponse } from './utils.js';
import { handleHousehold } from './household.js';
import { handleDirectory } from './directory.js';

export function createApiRouter() {
  return async function handleApiRequest(request, env, member) {
    const url = new URL(request.url);

    if (url.pathname === '/api/me' && request.method === 'GET') {
      return jsonResponse({member:await householdIdentity(env,member)});
    }
    const householdRoute=url.pathname.match(/^\/api\/households(?:\/([^/]+))?$/);
    if(householdRoute)return handleHouseholds(request,env,householdRoute[1]);
    const dinner=url.pathname.match(/^\/api\/dinner(?:\/([^/]+))?$/);
    if(dinner)return handleDinner(request,env,member,dinner[1]);
    const directory = url.pathname.match(/^\/api\/directory(?:\/(people|relationships)(?:\/([^/]+))?)?$/);
    if (directory) return handleDirectory(request, env, directory[1], directory[2], member);
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
