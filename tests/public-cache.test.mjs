import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';

import streetsHandler from '../api/streets.js';
import messagesHandler from '../api/messages.js';
import { PUBLIC_DATA_CACHE_SECONDS, resetSingleFlightForTests } from '../api/_public-cache.js';

const STREETS_TABLE = 'tbl4UnzoSzUFAnoKH';
const MESSAGES_TABLE = 'tbl1SroHzPHflp0EJ';
const BASE_ID = 'appsnAjoLIt7DzTzF';

let originalFetch;
let originalKey;
let ipCounter = 0;

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      // Match res.json(): undefined fields are dropped on the wire.
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

function request(method = 'GET', ip) {
  ipCounter += 1;
  return {
    method,
    headers: {
      'x-forwarded-for': ip || `203.0.113.${(ipCounter % 200) + 1}`,
    },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}

function airtablePage(records, offset) {
  return jsonResponse({ records, offset });
}

beforeEach(() => {
  originalFetch = global.fetch;
  originalKey = process.env.AIRTABLE_API_KEY;
  process.env.AIRTABLE_API_KEY = 'test-key';
  resetSingleFlightForTests();
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.AIRTABLE_API_KEY;
  } else {
    process.env.AIRTABLE_API_KEY = originalKey;
  }
  resetSingleFlightForTests();
});

function installFetch(impl) {
  const calls = [];
  global.fetch = async (...args) => {
    calls.push(args);
    return impl(...args, calls.length);
  };
  global.fetch.mock = { calls };
}

test('street reads page through Airtable and cache only the finished list', async () => {
  installFetch(async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, `https://api.airtable.com/v0/${BASE_ID}/${STREETS_TABLE}`);
    assert.equal(parsed.searchParams.get('pageSize'), '100');
    const offset = parsed.searchParams.get('offset');
    if (!offset) {
      return airtablePage(
        [
          {
            id: 'recA',
            fields: {
              'Route Number': '4',
              Street: '  Hilliard Boulevard  ',
              'Date Started': '2026-11-01',
              Status: 'In Progress- 1st Pass',
              'Date Completed': null,
              Notes: 'Crew on the east end',
            },
          },
          { id: 'recBlankFields' },
        ],
        'next-page'
      );
    }
    assert.equal(offset, 'next-page');
    return airtablePage([
      {
        id: 'recB',
        fields: {
          'Route Number': '9',
          Street: 'Detroit Road',
          Status: 'Up Next- 1st Pass',
        },
      },
    ]);
  });

  const res = mockRes();
  await streetsHandler(request(), res);

  assert.equal(global.fetch.mock.calls.length, 2);
  assert.equal(global.fetch.mock.calls[0][1].headers.Authorization, 'Bearer test-key');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.records, [
    {
      id: 'recA',
      routeNumber: '4',
      street: '  Hilliard Boulevard  ',
      dateStarted: '2026-11-01',
      status: 'In Progress- 1st Pass',
      dateCompleted: null,
      notes: 'Crew on the east end',
    },
    {
      id: 'recBlankFields',
      notes: '',
    },
    {
      id: 'recB',
      routeNumber: '9',
      street: 'Detroit Road',
      status: 'Up Next- 1st Pass',
      notes: '',
    },
  ]);
  assert.equal(Number.isNaN(new Date(res.body.fetchedAt).getTime()), false);
  assert.equal(res.headers['cache-control'], 'public, max-age=0, must-revalidate');
  const cdn = res.headers['vercel-cdn-cache-control'];
  assert.equal(cdn, res.headers['cdn-cache-control']);
  assert.match(cdn, new RegExp(`s-maxage=${PUBLIC_DATA_CACHE_SECONDS}\\b`));
  assert.match(cdn, /stale-while-revalidate=60/);
  assert.match(cdn, /stale-if-error=3600/);
  assert.doesNotMatch(res.headers['cache-control'], /no-store|private|no-cache/);
  assert.equal(res.headers['x-ratelimit-limit'], '100');
});

test('a failed Airtable page is not cached and does not publish a partial list', async () => {
  installFetch(async (url) => {
    const offset = new URL(url).searchParams.get('offset');
    if (!offset) {
      return airtablePage([{ id: 'recA', fields: { Street: 'Hilliard Boulevard', Status: 'Not Started' } }], 'next');
    }
    return jsonResponse({ error: { message: 'upstream blew up' } }, 503);
  });

  const res = mockRes();
  await streetsHandler(request(), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Failed to fetch street data' });
  assert.equal(res.body.records, undefined);
  assert.match(res.headers['cache-control'], /no-store/);
  assert.match(res.headers['vercel-cdn-cache-control'], /no-store/);
  assert.doesNotMatch(res.headers['vercel-cdn-cache-control'], /s-maxage/);
  assert.equal(JSON.stringify(res.body).includes('upstream blew up'), false);

  const retry = mockRes();
  await streetsHandler(request(), retry);
  assert.equal(retry.statusCode, 500);
  assert.equal(global.fetch.mock.calls.length, 4);
});

test('missing API key never calls Airtable and is not cached', async () => {
  delete process.env.AIRTABLE_API_KEY;
  installFetch(async () => {
    throw new Error('Airtable should not be called');
  });

  const res = mockRes();
  await streetsHandler(request(), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Server misconfiguration' });
  assert.equal(global.fetch.mock.calls.length, 0);
  assert.match(res.headers['cache-control'], /no-store/);
});

test('non-GET street requests are rejected and not cached', async () => {
  installFetch(async () => {
    throw new Error('Airtable should not be called');
  });

  const res = mockRes();
  await streetsHandler(request('POST'), res);

  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: 'Method not allowed' });
  assert.equal(global.fetch.mock.calls.length, 0);
  assert.match(res.headers['cache-control'], /no-store/);
});

test('overlapping street reads share one Airtable walk', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    markStarted();
    await gate;
    return airtablePage([
      { id: 'recA', fields: { Street: 'Hilliard Boulevard', Status: 'In Progress- 1st Pass', 'Route Number': '4' } },
    ]);
  };

  const first = mockRes();
  const second = mockRes();
  const pending = Promise.all([
    streetsHandler(request(), first),
    streetsHandler(request(), second),
  ]);

  await started;
  assert.equal(calls, 1);
  release();
  await pending;

  assert.equal(calls, 1);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.body.fetchedAt, second.body.fetchedAt);
  assert.equal(first.body.records[0].street, 'Hilliard Boulevard');
  assert.equal(second.body.records.length, 1);
});

test('message reads keep the same filtering and are cacheable', async () => {
  installFetch(async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, `https://api.airtable.com/v0/${BASE_ID}/${MESSAGES_TABLE}`);
    return airtablePage([
      { id: 'msg1', fields: { Message: 'Crews are out on the west side.', 'Date Created': '2026-11-19', Active: true } },
      { id: 'msg2', fields: { Message: 'Ignore me', Active: false } },
      { id: 'msg3', fields: { Message: '   ', Active: true } },
      { id: 'msg4', fields: { Message: 'No active flag still shows.' } },
      { id: 'msg5' },
    ]);
  });

  const res = mockRes();
  await messagesHandler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    messages: [
      { id: 'msg1', message: 'Crews are out on the west side.', dateCreated: '2026-11-19' },
      // Whitespace is still returned; the page trims it when deciding what to show.
      { id: 'msg3', message: '   ', dateCreated: null },
      { id: 'msg4', message: 'No active flag still shows.', dateCreated: null },
    ],
  });
  assert.match(res.headers['vercel-cdn-cache-control'], /s-maxage=300/);
  assert.equal(res.headers['cache-control'], 'public, max-age=0, must-revalidate');
});

test('message failures are not cached', async () => {
  installFetch(async () => jsonResponse('nope', 500));

  const res = mockRes();
  await messagesHandler(request(), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Failed to fetch messages' });
  assert.match(res.headers['cache-control'], /no-store/);
  assert.doesNotMatch(res.headers['vercel-cdn-cache-control'], /s-maxage/);
});

test('rate limit responses are not cacheable', async () => {
  installFetch(async () => airtablePage([]));
  const ip = '198.51.100.10';

  let blocked;
  for (let i = 0; i < 101; i += 1) {
    const res = mockRes();
    await streetsHandler(request('GET', ip), res);
    if (i < 100) {
      assert.equal(res.statusCode, 200);
    } else {
      blocked = res;
    }
  }

  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.error, 'Rate limit exceeded');
  assert.match(blocked.headers['cache-control'], /no-store/);
  assert.doesNotMatch(blocked.headers['vercel-cdn-cache-control'], /s-maxage/);
  assert.equal(global.fetch.mock.calls.length, 100);
});

test('the page shows the time Airtable was read, not the time the copy arrived', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /payload\.fetchedAt/);
  assert.match(html, /PUBLIC_DATA_CACHE_SECONDS/);
  assert.match(html, /REFRESH_INTERVAL_MS = 5 \* 60 \* 1000/);
});

test('write endpoints are not given the public read cache', async () => {
  const files = [
    'subscribe.js',
    'subscribe-sms.js',
    'unsubscribe.js',
    'check-subscription.js',
    'notify-status-change.js',
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../api/${file}`, import.meta.url), 'utf8');
    assert.equal(source.includes('setPublicReadCache'), false, file);
  }
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function finish(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/**
 * A stand-in for the Vercel CDN rules we depend on: only a successful GET
 * with a positive s-maxage, and no no-store/private/no-cache, is reused.
 */
function createCachingServer(handler) {
  const cache = new Map();
  let originCalls = 0;

  const server = http.createServer((nodeReq, nodeRes) => {
    const key = `${nodeReq.method} ${nodeReq.url}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      nodeRes.writeHead(200, { ...cached.headers, 'x-vercel-cache': 'HIT' });
      nodeRes.end(cached.body);
      return;
    }

    originCalls += 1;
    const chunks = [];
    nodeReq.on('data', (chunk) => chunks.push(chunk));
    nodeReq.on('end', () => {
      const headerBag = {};
      let statusCode = 200;
      let settled = false;
      const res = {
        setHeader(name, value) {
          headerBag[name.toLowerCase()] = String(value);
        },
        status(code) {
          statusCode = code;
          return this;
        },
        json(payload) {
          if (settled) return;
          settled = true;
          const body = JSON.stringify(payload);
          const cacheControl = headerBag['cache-control'] || '';
          const cdnControl = headerBag['vercel-cdn-cache-control'] || '';
          const blocked = /no-store|private|no-cache/.test(cacheControl);
          const maxAge = Number((cdnControl.match(/s-maxage=(\d+)/) || [])[1]);
          if (nodeReq.method === 'GET' && statusCode === 200 && !blocked && maxAge > 0) {
            cache.set(key, {
              body,
              headers: { ...headerBag, 'content-type': 'application/json' },
              expiresAt: Date.now() + maxAge * 1000,
            });
          }
          nodeRes.writeHead(statusCode, {
            ...headerBag,
            'content-type': 'application/json',
            'x-vercel-cache': 'MISS',
          });
          nodeRes.end(body);
        },
      };

      Promise.resolve(handler({
        method: nodeReq.method,
        headers: nodeReq.headers,
      }, res)).catch((error) => {
        if (settled) return;
        settled = true;
        nodeRes.writeHead(500, { 'content-type': 'application/json' });
        nodeRes.end(JSON.stringify({ error: error.message }));
      });
    });
  });

  return {
    server,
    get originCalls() {
      return originCalls;
    },
  };
}

test('a second visitor is served the stored street list without another Airtable read', async () => {
  let airtableCalls = 0;
  global.fetch = async (url) => {
    airtableCalls += 1;
    const table = String(url).includes(MESSAGES_TABLE) ? 'messages' : 'streets';
    if (table === 'messages') {
      return airtablePage([
        { id: 'msg1', fields: { Message: 'Leaf crews are working today.', Active: true, 'Date Created': '2026-11-19' } },
      ]);
    }
    const offset = new URL(url).searchParams.get('offset');
    if (!offset) {
      return airtablePage([
        { id: 'rec1', fields: { Street: 'Hilliard Boulevard', 'Route Number': '4', Status: 'In Progress- 1st Pass', Notes: '' } },
        { id: 'rec2', fields: { Street: 'Detroit Road', 'Route Number': '9', Status: 'Up Next- 1st Pass' } },
      ], 'page-2');
    }
    return airtablePage([
      { id: 'rec3', fields: { Street: 'Center Ridge Road', 'Route Number': '4', Status: 'Not Started' } },
    ]);
  };

  const streets = createCachingServer(streetsHandler);
  const messages = createCachingServer(messagesHandler);
  const streetsPort = await listen(streets.server);
  const messagesPort = await listen(messages.server);

  try {
    const firstStreets = await originalFetch(`http://127.0.0.1:${streetsPort}/api/streets`);
    const firstMessages = await originalFetch(`http://127.0.0.1:${messagesPort}/api/messages`);
    assert.equal(firstStreets.headers.get('x-vercel-cache'), 'MISS');
    assert.equal(firstMessages.headers.get('x-vercel-cache'), 'MISS');
    assert.equal(firstStreets.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    const firstBody = await firstStreets.json();
    const firstMessagesBody = await firstMessages.json();
    assert.equal(airtableCalls, 3);
    assert.deepEqual(firstBody.records.map((record) => record.street), [
      'Hilliard Boulevard',
      'Detroit Road',
      'Center Ridge Road',
    ]);
    assert.equal(firstMessagesBody.messages[0].message, 'Leaf crews are working today.');

    const secondStreets = await originalFetch(`http://127.0.0.1:${streetsPort}/api/streets`);
    const secondMessages = await originalFetch(`http://127.0.0.1:${messagesPort}/api/messages`);
    assert.equal(secondStreets.headers.get('x-vercel-cache'), 'HIT');
    assert.equal(secondMessages.headers.get('x-vercel-cache'), 'HIT');
    assert.deepEqual(await secondStreets.json(), firstBody);
    assert.deepEqual(await secondMessages.json(), firstMessagesBody);
    assert.equal(airtableCalls, 3);
    assert.equal(streets.originCalls, 1);
    assert.equal(messages.originCalls, 1);
  } finally {
    await Promise.all([finish(streets.server), finish(messages.server)]);
  }
});

test('an error response is not reused for the next visitor', async () => {
  let attempts = 0;
  global.fetch = async () => {
    attempts += 1;
    if (attempts === 1) return jsonResponse('down', 503);
    return airtablePage([
      { id: 'rec1', fields: { Street: 'Hilliard Boulevard', Status: 'In Progress- 1st Pass', 'Route Number': '4' } },
    ]);
  };

  const streets = createCachingServer(streetsHandler);
  const port = await listen(streets.server);
  try {
    const failed = await originalFetch(`http://127.0.0.1:${port}/api/streets`);
    assert.equal(failed.status, 500);
    assert.equal(failed.headers.get('x-vercel-cache'), 'MISS');
    assert.match(failed.headers.get('cache-control'), /no-store/);

    const recovered = await originalFetch(`http://127.0.0.1:${port}/api/streets`);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.headers.get('x-vercel-cache'), 'MISS');
    const body = await recovered.json();
    assert.equal(body.records[0].street, 'Hilliard Boulevard');
    assert.equal(attempts, 2);
    assert.equal(streets.originCalls, 2);
  } finally {
    await finish(streets.server);
  }
});
