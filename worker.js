import { createApiRouter } from './src/api/router.js';
import { authenticate, checkOrigin } from './src/api/auth.js';
import { HttpError } from './src/api/errors.js';
import { jsonResponse } from './src/api/utils.js';

const handleApiRequest = createApiRouter();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        const member = await authenticate(request, env);
        checkOrigin(request, env);
        return await handleApiRequest(request, env, member);
      } catch (error) {
        if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status);
        console.error('Household API failed', error instanceof Error ? error.name : 'Unknown error');
        return jsonResponse({ error: 'We could not save or load this information. Please try again.' }, 500);
      }
    }

    const assetResponse = await env.ASSETS.fetch(new Request(url, request));

    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
  },
};
