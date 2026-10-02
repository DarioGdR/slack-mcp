import test from 'node:test';
import assert from 'node:assert';
import { executeTool, TOOLS_DEFINITIONS, getActiveCredentials } from './tools.js';
import { getSlackCredentials } from './credentials.js';

test('Tools Schema and Definition Validation', () => {
  assert.equal(TOOLS_DEFINITIONS.length, 13, 'Should contain exactly 13 Slack tools.');
  
  const getByNameTool = TOOLS_DEFINITIONS.find(t => t.name === 'get_channel_by_name');
  assert.ok(getByNameTool, 'Should contain get_channel_by_name tool.');
  assert.equal(getByNameTool.inputSchema.required[0], 'name');
  
  const getByUrlTool = TOOLS_DEFINITIONS.find(t => t.name === 'get_message_by_url');
  assert.ok(getByUrlTool, 'Should contain get_message_by_url tool.');
  assert.equal(getByUrlTool.inputSchema.required[0], 'url');
});

test('Mock executeTool - Name Resolution and URL Extraction', async () => {
  const dummyCredentials = {
    teamToken: 'xoxc-mock-team-token',
    enterpriseToken: 'xoxc-mock-enterprise-token',
    cookieD: 'mock-d',
    cookieDS: 'mock-ds'
  };
  
  // Mock global fetch to intercept requests and simulate Slack API responses
  const originalFetch = globalThis.fetch;
  const requestsMade = [];
  
  globalThis.fetch = async (url, options) => {
    requestsMade.push({ url, options });
    
    // Check which endpoint is being called
    if (url.includes('users.conversations')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          channels: [
            { id: 'C0BHN4GBMD2', name: 'engineering-general', name_normalized: 'engineering-general' }
          ]
        })
      };
    }
    
    if (url.includes('conversations.history') || url.includes('conversations.replies') || url.includes('conversations.info')) {
      return {
        ok: true,
        json: async () => ({ ok: true, mocked: true })
      };
    }
    
    return { ok: false };
  };
  
  try {
    // 1. Test get_channel_by_name tool
    const getByNameResult = await executeTool('get_channel_by_name', {
      name: 'engineering-general'
    }, dummyCredentials);
    
    assert.ok(getByNameResult.mocked);
    assert.ok(requestsMade[0].url.includes('users.conversations'), 'First call should query users.conversations to resolve name');
    assert.ok(requestsMade[1].url.includes('conversations.info'), 'Second call should query info with the resolved ID');
    assert.ok(requestsMade[1].url.includes('channel=C0BHN4GBMD2'), 'Should pass resolved ID');

    requestsMade.length = 0; // Clear requests trace
    
    // 2. Test conversations_history accepts plain channel name and resolves it
    const historyResult = await executeTool('conversations_history', {
      channel: '#engineering-general',
      limit: 10
    }, dummyCredentials);
    
    assert.ok(historyResult.mocked);
    assert.ok(requestsMade[0].url.includes('conversations.history'), 'Should load history');
    assert.ok(requestsMade[0].url.includes('channel=C0BHN4GBMD2'), 'Should use resolved ID even with leading # in name');
    
    requestsMade.length = 0;

    // 3. Test get_message_by_url extracts channel ID and ts correctly
    const linkResult = await executeTool('get_message_by_url', {
      url: 'https://my-company.slack.com/archives/C0BHN4GBMD2/p1786428589673259'
    }, dummyCredentials);
    
    assert.ok(linkResult.mocked);
    assert.ok(requestsMade[0].url.includes('conversations.replies'), 'Should call conversations.replies to load the thread');
    assert.ok(requestsMade[0].url.includes('channel=C0BHN4GBMD2'), 'Should extract channel ID C0BHN4GBMD2');
    assert.ok(requestsMade[0].url.includes('ts=1786428589.673259'), 'Should reconstruct correct ts decimal format: 1786428589.673259');
    
  } finally {
    globalThis.fetch = originalFetch; // Restore global fetch
  }
});

test('getActiveCredentials caching and force refresh', async () => {
  const creds1 = await getActiveCredentials();
  assert.ok(creds1.token, 'Should have active token');
  assert.ok(creds1.cookieD, 'Should have cookieD');

  const creds2 = await getActiveCredentials();
  assert.strictEqual(creds1, creds2, 'Repeated calls should return cached object instance');

  const creds3 = await getActiveCredentials(true);
  assert.ok(creds3.token, 'Refreshed credentials should be present');
});

test('Automatic recovery and single retry on invalid_auth with User-Agent header', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let attemptCount = 0;

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    attemptCount++;
    if (attemptCount === 1) {
      // First attempt fails with invalid_auth
      return {
        ok: true,
        json: async () => ({ ok: false, error: 'invalid_auth' })
      };
    }
    // Second attempt (retry after refresh) succeeds
    return {
      ok: true,
      json: async () => ({ ok: true, channel: { id: 'C0BHN4GBMD2' } })
    };
  };

  try {
    const result = await executeTool('conversations_info', { channel: 'C0BHN4GBMD2' });
    assert.strictEqual(result.ok, true, 'Should successfully complete after auto-refresh retry');
    assert.strictEqual(attemptCount, 2, 'Should have attempted exactly twice (1 failure + 1 retry)');
    
    // Verify browser User-Agent was included
    assert.ok(requests[0].options.headers['User-Agent'], 'User-Agent header must be present');
    assert.match(requests[0].options.headers['User-Agent'], /Mozilla/, 'User-Agent must mimic standard browser');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Slack Desktop live credentials extraction and auth.test connectivity', async () => {
  const creds = getSlackCredentials();
  
  assert.strictEqual(creds.source, 'slack_desktop', 'Credentials must originate primarily from Slack Desktop App');
  assert.ok(creds.token.startsWith('xoxc-') || creds.token.startsWith('xoxp-'), 'Token must be valid xoxc or xoxp format');
  assert.ok(creds.cookieD.startsWith('xoxd-'), 'Cookie d must start with xoxd-');

  // Verify real live connectivity against Slack Web API
  const cookieHeader = creds.cookieDS ? `d=${creds.cookieD}; d-s=${creds.cookieDS}` : `d=${creds.cookieD}`;
  const response = await fetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${creds.token}`,
      'Cookie': cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });

  const body = await response.json();
  assert.strictEqual(body.ok, true, `auth.test failed with error: ${body.error}`);
  assert.ok(body.user, 'auth.test must return authenticated user');
  assert.ok(body.team, 'auth.test must return authenticated team');
});
