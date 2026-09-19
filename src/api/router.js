import {handleCozi} from './calendar/cozi.js';
import {householdIdentity} from './shared/identity.js';
import {handleHouseholds} from './households/handler.js';
import {handleDinner} from './dinner/handler.js';
import { handleFamilies } from './legacy/families.js';
import { handlePeople } from './legacy/people.js';
import { jsonResponse } from './shared/utils.js';
import {handleGroceries} from './groceries/handler.js';
import {handleChat} from './chat/handler.js';
import {handleLocalEvents} from './calendar/localEvents.js';
import { handleDirectory } from './directory/handler.js';

export function createApiRouter() {
  return async function handleApiRequest(request, env, member) {
    const url = new URL(request.url);

    if (url.pathname === '/api/me' && request.method === 'GET') {
      return jsonResponse({member:await householdIdentity(env,member)});
    }
    if(url.pathname === '/api/cozi-calendar') return handleCozi(request,env);
    const householdRoute=url.pathname.match(/^\/api\/households(?:\/([^/]+))?$/);
    if(householdRoute)return handleHouseholds(request,env,householdRoute[1],member);
    const dinner=url.pathname.match(/^\/api\/dinner(?:\/([^/]+))?$/);
    if(dinner)return handleDinner(request,env,member,dinner[1]);
    const directory = url.pathname.match(/^\/api\/directory(?:\/(people|relationships)(?:\/([^/]+))?)?$/);
    if (directory) return handleDirectory(request, env, directory[1], directory[2], member);
    const household = url.pathname.match(/^\/api\/(groceries|news|events)(?:\/([^/]+))?$/);
    if (household) return {groceries:handleGroceries,news:handleChat,events:handleLocalEvents}[household[1]](request, env, member, household[2]);

    if (url.pathname === '/api/families') {
      return handleFamilies(request, env);
    }

    if (url.pathname === '/api/people') {
      return handlePeople(request, env);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  };
}
