/**
 * PICO Search - Cloudflare Worker CORS Proxy
 *
 * Gemini API (generativelanguage.googleapis.com) へのリクエストを中継し
 * CORS ヘッダーを付与するパススルー型プロキシ。
 * APIキーはリクエストのクエリパラメータとして通過するだけで保存しない。
 *
 * デプロイ: worker/README.md を参照
 */

const ALLOWED_ORIGIN = 'https://mizuking796.github.io';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  // Allow the deployed origin and localhost for development
  const allowed = origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGIN,
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request) {
    const cors = corsHeaders(request);

    /* ── Preflight ── */
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    /* ── Method restriction (SEC-1) ── */
    if (request.method !== 'GET' && request.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { ...cors, 'Allow': 'GET, POST, OPTIONS' },
      });
    }

    /* ── Forward ── */
    const url = new URL(request.url);
    const target =
      'https://generativelanguage.googleapis.com' +
      url.pathname +
      url.search;

    const res = await fetch(target, {
      method: request.method,
      headers: { 'Content-Type': 'application/json' },
      body: request.method === 'POST' ? request.body : undefined,
    });

    /* ── Pass through rate-limit headers (BUG-3) ── */
    const responseHeaders = {
      'Content-Type': 'application/json',
      ...cors,
    };
    const rateLimitKeys = [
      'x-ratelimit-remaining-requests',
      'x-ratelimit-remaining',
      'ratelimit-remaining',
    ];
    for (const key of rateLimitKeys) {
      const val = res.headers.get(key);
      if (val !== null) {
        responseHeaders[key] = val;
        // Expose to browser JS via CORS
        responseHeaders['Access-Control-Expose-Headers'] =
          (responseHeaders['Access-Control-Expose-Headers'] || '') +
          (responseHeaders['Access-Control-Expose-Headers'] ? ', ' : '') + key;
      }
    }

    /* ── Stream response body (PERF-6) ── */
    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  },
};
