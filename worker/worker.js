/**
 * PICO Search - Cloudflare Worker CORS Proxy
 *
 * Gemini API (generativelanguage.googleapis.com) へのリクエストを中継し
 * CORS ヘッダーを付与するパススルー型プロキシ。
 * APIキーはリクエストのクエリパラメータとして通過するだけで保存しない。
 *
 * デプロイ: worker/README.md を参照
 */

export default {
  async fetch(request) {
    /* ── Preflight ── */
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
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
      body: request.body,
    });

    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
