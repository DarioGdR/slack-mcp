/**
 * Slack MCP Server - Tools and API Handler Module (Upgraded)
 */

import { getSlackCredentials } from './credentials.js';

/**
 * List of tool definitions compliant with the Model Context Protocol schema.
 */
export const TOOLS_DEFINITIONS = [
  {
    name: "search_messages",
    description: "Search messages across accessible Slack channels.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string (e.g. 'database error')" },
        count: { type: "number", description: "Number of search results to return (default: 20)" },
        page: { type: "number", description: "Page number to fetch" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_all",
    description: "Search both messages and files across Slack.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        count: { type: "number", description: "Number of search results to return (default: 20)" },
        page: { type: "number", description: "Page number to fetch" },
        sort: { type: "string", description: "Sort field (e.g. 'timestamp')" },
        sort_dir: { type: "string", description: "Sort direction (e.g. 'desc')" }
      },
      required: ["query"]
    }
  },
  {
    name: "users_list",
    description: "List members of the Slack workspace.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        cursor: { type: "string", description: "Pagination cursor" },
        limit: { type: "number", description: "Maximum number of results to return (default: 100)" },
        include_locale: { type: "boolean", description: "Whether to include the user locale" }
      }
    }
  },
  {
    name: "users_info",
    description: "Get details and profile for a specific Slack user.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "Slack user ID (e.g. 'U123456')" },
        include_locale: { type: "boolean", description: "Whether to include the user locale" }
      },
      required: ["user"]
    }
  },
  {
    name: "get_users_channel_sections_list",
    description: "Get custom sidebar channel sections for the authenticated user.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "conversations_history",
    description: "Get message history from a Slack channel (accepts channel ID or name with or without #).",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel ID or name (e.g. 'C123456' or 'general')" },
        limit: { type: "number", description: "Number of messages to return (default: 100)" },
        cursor: { type: "string", description: "Pagination cursor" },
        latest: { type: "string", description: "End timestamp for time range filter" },
        oldest: { type: "string", description: "Start timestamp for time range filter" },
        inclusive: { type: "boolean", description: "Whether to include boundary timestamps" }
      },
      required: ["channel"]
    }
  },
  {
    name: "conversations_list",
    description: "List available public and private Slack channels in the workspace.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        exclude_archived: { type: "boolean", description: "Exclude archived channels (default: true)" },
        types: { type: "string", description: "Comma-separated channel types (e.g. 'public_channel,private_channel')" },
        limit: { type: "number", description: "Maximum number of results to return (default: 100)" },
        cursor: { type: "string", description: "Pagination cursor" }
      }
    }
  },
  {
    name: "conversations_members",
    description: "List members of a specific Slack channel (accepts channel ID or name).",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Slack channel ID or name." },
        limit: { type: "number", description: "Maximum number of members to return (default: 100)" },
        cursor: { type: "string", description: "Pagination cursor" }
      },
      required: ["channel"]
    }
  },
  {
    name: "conversations_replies",
    description: "Read thread replies for a parent message in Slack (accepts channel ID or name).",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Slack channel ID or name." },
        ts: { type: "string", description: "Parent message timestamp (e.g. '1234567890.123456')" },
        limit: { type: "number", description: "Maximum number of replies to return" },
        cursor: { type: "string", description: "Pagination cursor" },
        latest: { type: "string", description: "End timestamp for filter" },
        oldest: { type: "string", description: "Start timestamp for filter" },
        inclusive: { type: "boolean", description: "Whether to include boundaries" }
      },
      required: ["channel", "ts"]
    }
  },
  {
    name: "conversations_info",
    description: "Get metadata for a Slack conversation or channel (accepts channel ID or name).",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Slack channel ID or name." },
        include_locale: { type: "boolean", description: "Include channel locale" },
        include_num_members: { type: "boolean", description: "Include member count" }
      },
      required: ["channel"]
    }
  },
  {
    name: "get_channel_by_name",
    description: "Find a channel by name and get all relevant information and metadata.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Channel name (e.g. 'general' or 'engineering')" }
      },
      required: ["name"]
    }
  },
  {
    name: "get_message_by_url",
    description: "Get a Slack message or thread directly by pasting its Slack archive link/URL.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Slack message URL (e.g. https://your-workspace.slack.com/archives/C12345678/p1234567890123456)" }
      },
      required: ["url"]
    }
  },
  {
    name: "download_file",
    description: "Download a private Slack file or image using the authenticated session and save it locally.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Slack file download URL (e.g. url_private_download or url_private)" },
        local_path: { type: "string", description: "Local destination path where the file should be saved (e.g. 'image.png')" }
      },
      required: ["url", "local_path"]
    }
  },
];

// Browser User-Agent to avoid Cloudflare/Slack automated bot challenges
const BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// Simple memory cache for resolved channel names to prevent redundant requests
const CHANNEL_NAME_CACHE = {};

// In-memory credentials cache
let cachedCredentials = null;

/**
 * Returns active Slack credentials, caching in memory and allowing forced refresh.
 */
export async function getActiveCredentials(forceRefresh = false) {
  if (!cachedCredentials || forceRefresh) {
    cachedCredentials = getSlackCredentials();
  }
  return cachedCredentials;
}

/**
 * Helper to construct standard authorization and browser headers.
 */
function buildHeaders(creds) {
  const token = creds.teamToken || creds.enterpriseToken || creds.token;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'User-Agent': BROWSER_USER_AGENT
  };
  if (creds.cookieD) {
    headers['Cookie'] = creds.cookieDS
      ? `d=${creds.cookieD}; d-s=${creds.cookieDS}`
      : `d=${creds.cookieD}`;
  }
  return headers;
}

/**
 * Executes a GET request to the Slack Web API.
 * Automatically refreshes credentials and retries once if invalid_auth occurs.
 */
async function slackGet(endpoint, params, credentials, isRetry = false) {
  const creds = credentials || await getActiveCredentials();
  const url = new URL(endpoint);
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      url.searchParams.append(key, String(val));
    }
  }
  
  const headers = buildHeaders(creds);
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: headers
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status} from Slack: ${errorText}`);
  }
  
  const data = await response.json();
  if (!isRetry && data && data.ok === false && data.error === 'invalid_auth') {
    console.error("⚠️ [slackGet] Encountered invalid_auth, forcing credentials refresh and retrying once...");
    try {
      const refreshedCreds = await getActiveCredentials(true);
      return await slackGet(endpoint, params, refreshedCreds, true);
    } catch (refreshErr) {
      console.error(`⚠️ [slackGet] Failed to refresh credentials: ${refreshErr.message}`);
      return data;
    }
  }
  
  return data;
}

/**
 * Executes a POST request to the Slack Web API with urlencoded form data.
 * Automatically refreshes credentials and retries once if invalid_auth occurs.
 */
async function slackPostForm(endpoint, formData, credentials, isRetry = false) {
  const creds = credentials || await getActiveCredentials();
  const url = new URL(endpoint);
  
  const headers = buildHeaders(creds);
  headers['Content-Type'] = 'application/x-www-form-urlencoded';
  
  const body = new URLSearchParams();
  for (const [key, val] of Object.entries(formData)) {
    if (val !== undefined && val !== null) {
      body.append(key, String(val));
    }
  }
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: headers,
    body: body.toString()
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status} from Slack: ${errorText}`);
  }
  
  const data = await response.json();
  if (!isRetry && data && data.ok === false && data.error === 'invalid_auth') {
    console.error("⚠️ [slackPostForm] Encountered invalid_auth, forcing credentials refresh and retrying once...");
    try {
      const refreshedCreds = await getActiveCredentials(true);
      return await slackPostForm(endpoint, formData, refreshedCreds, true);
    } catch (refreshErr) {
      console.error(`⚠️ [slackPostForm] Failed to refresh credentials: ${refreshErr.message}`);
      return data;
    }
  }
  
  return data;
}

/**
 * Smart resolver to turn a plain channel name or ID into a verified channel ID.
 */
async function resolveChannelId(input, credentials) {
  if (!input) return null;
  const cleanInput = input.trim().replace(/^#/, '');
  
  // 1. Check if it's already a valid Slack ID pattern (C/G/D/etc followed by alphanumeric)
  if (/^[CGD][A-Z0-9]{8,11}$/.test(cleanInput)) {
    return cleanInput;
  }
  
  // 2. Check local memory cache
  if (CHANNEL_NAME_CACHE[cleanInput]) {
    return CHANNEL_NAME_CACHE[cleanInput];
  }
  
  // 3. Search joined channels using users.conversations (highly efficient and has your private channels!)
  try {
    let cursor = undefined;
    while (true) {
      const params = { types: "public_channel,private_channel", limit: 100 };
      if (cursor) params.cursor = cursor;
      
      const data = await slackGet("https://slack.com/api/users.conversations", params, credentials);
      if (data.ok) {
        const found = data.channels.find(c => c.name === cleanInput || c.name_normalized === cleanInput);
        if (found) {
          CHANNEL_NAME_CACHE[cleanInput] = found.id;
          return found.id;
        }
        cursor = data.response_metadata?.next_cursor;
        if (!cursor) break;
      } else {
        break;
      }
    }
  } catch (err) {
    // Suppress error and fallback to public listing
  }
  
  // 4. Search public workspace channels list as final fallback (paginated, max 3 pages to avoid rate limits)
  try {
    let cursor = undefined;
    let page = 0;
    while (page < 3) {
      page++;
      const params = { types: "public_channel", limit: 100 };
      if (cursor) params.cursor = cursor;
      
      const data = await slackGet("https://slack.com/api/conversations.list", params, credentials);
      if (data.ok) {
        const found = data.channels.find(c => c.name === cleanInput || c.name_normalized === cleanInput);
        if (found) {
          CHANNEL_NAME_CACHE[cleanInput] = found.id;
          return found.id;
        }
        cursor = data.response_metadata?.next_cursor;
        if (!cursor) break;
      } else {
        break;
      }
    }
  } catch (err) {
    // Ignore fallback errors
  }
  
  throw new Error(`Could not find channel named '#${cleanInput}'. Ensure you have joined the channel if it is private.`);
}

/**
 * Tool execution router. Maps MCP tool calls to actual Slack HTTP endpoints.
 */
export async function executeTool(name, args, credentials) {
  const creds = credentials || await getActiveCredentials();
  
  switch (name) {
    case "search_messages":
      return await slackGet("https://slack.com/api/search.messages", {
        query: args.query,
        count: args.count,
        page: args.page
      }, creds);
      
    case "search_all":
      return await slackGet("https://slack.com/api/search.all", {
        query: args.query,
        count: args.count,
        page: args.page,
        sort: args.sort,
        sort_dir: args.sort_dir
      }, creds);
      
    case "users_list":
      return await slackGet("https://slack.com/api/users.list", {
        cursor: args.cursor,
        limit: args.limit,
        include_locale: args.include_locale
      }, creds);
      
    case "users_info":
      return await slackGet("https://slack.com/api/users.info", {
        user: args.user,
        include_locale: args.include_locale,
        token: creds.enterpriseToken || creds.token
      }, creds);
      
    case "get_users_channel_sections_list":
      return await slackPostForm("https://slack.com/api/users.channelSections.list", {
        token: creds.enterpriseToken || creds.token
      }, creds);
      
    case "conversations_history": {
      const channelId = await resolveChannelId(args.channel, creds);
      return await slackGet("https://slack.com/api/conversations.history", {
        channel: channelId,
        limit: args.limit,
        cursor: args.cursor,
        latest: args.latest,
        oldest: args.oldest,
        inclusive: args.inclusive
      }, creds);
    }
      
    case "conversations_list":
      return await slackGet("https://slack.com/api/conversations.list", {
        exclude_archived: args.exclude_archived !== undefined ? args.exclude_archived : true,
        types: args.types || "public_channel,private_channel",
        limit: args.limit,
        cursor: args.cursor
      }, creds);
      
    case "conversations_members": {
      const channelId = await resolveChannelId(args.channel, creds);
      return await slackGet("https://slack.com/api/conversations.members", {
        channel: channelId,
        limit: args.limit,
        cursor: args.cursor
      }, creds);
    }
      
    case "conversations_replies": {
      const channelId = await resolveChannelId(args.channel, creds);
      return await slackGet("https://slack.com/api/conversations.replies", {
        channel: channelId,
        ts: args.ts,
        limit: args.limit,
        cursor: args.cursor,
        latest: args.latest,
        oldest: args.oldest,
        inclusive: args.inclusive
      }, creds);
    }
      
    case "conversations_info": {
      const channelId = await resolveChannelId(args.channel, creds);
      return await slackGet("https://slack.com/api/conversations.info", {
        channel: channelId,
        include_locale: args.include_locale,
        include_num_members: args.include_num_members
      }, creds);
    }
    
    case "get_channel_by_name": {
      const channelId = await resolveChannelId(args.name, creds);
      return await slackGet("https://slack.com/api/conversations.info", {
        channel: channelId,
        include_num_members: true
      }, creds);
    }
    
    case "get_message_by_url": {
      const match = args.url.match(/archives\/([A-Z0-9]+)\/p(\d+)/);
      if (!match) {
        throw new Error("Invalid Slack URL format. Expected: https://<workspace>.slack.com/archives/<channelId>/p<ts>");
      }
      
      const channelId = match[1];
      const rawTs = match[2];
      
      // Slack message links contain the timestamp as an integer without the dot.
      // E.g. p1786428589673259 represents timestamp 1786428589.673259.
      // We reconstruct the dot-separated string timestamp required by the API.
      const ts = rawTs.substring(0, rawTs.length - 6) + "." + rawTs.substring(rawTs.length - 6);
      
      // Call conversations.replies to load the message thread or parent context.
      // This is extremely powerful because if the message is part of a thread,
      // it returns all replies. If it's a stand-alone message, it returns the message itself!
      return await slackGet("https://slack.com/api/conversations.replies", {
        channel: channelId,
        ts: ts,
        limit: 100
      }, creds);
    }
      
    case "download_file": {
      if (!args.url || !args.local_path) {
        throw new Error("Missing required arguments: url and local_path");
      }
      let downloadCreds = creds;
      let headers = buildHeaders(downloadCreds);
      let res = await fetch(args.url, { headers });
      if ((res.status === 401 || res.status === 403) && !args._retried) {
        console.error("⚠️ [download_file] Encountered auth error, attempting auto-refresh of credentials...");
        try {
          downloadCreds = await getActiveCredentials(true);
          headers = buildHeaders(downloadCreds);
          res = await fetch(args.url, { headers });
        } catch (refreshErr) {
          console.error(`Failed to refresh credentials for download: ${refreshErr.message}`);
        }
      }
      if (!res.ok) {
        throw new Error(`Failed to download Slack file: HTTP ${res.status} ${res.statusText}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fsModule = await import("fs");
      const pathModule = await import("path");
      const fullPath = pathModule.resolve(args.local_path);
      const dir = pathModule.dirname(fullPath);
      if (!fsModule.existsSync(dir)) {
        fsModule.mkdirSync(dir, { recursive: true });
      }
      fsModule.writeFileSync(fullPath, buffer);
      return {
        ok: true,
        path: fullPath,
        size_bytes: buffer.length,
        content_type: res.headers.get("content-type")
      };
    }
      
    default:
      throw new Error(`Tool ${name} not found.`);
  }
}
