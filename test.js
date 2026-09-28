import test from 'node:test';
import assert from 'node:assert';
import { executeTool, TOOLS_DEFINITIONS } from './tools.js';

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
