export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetResponse = await env.ASSETS.fetch(new Request(url, request));

    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
  },
};
