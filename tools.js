/**
 * Slack MCP Server - Tools and API Handler Module (Upgraded)
 */

/**
 * List of tool definitions compliant with the Model Context Protocol schema.
 */
export const TOOLS_DEFINITIONS = [
  {
    name: "search_messages",
    description: "Buscar mensajes en canales de Slack.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Query de búsqueda (ej. 'error de base de datos')" },
        count: { type: "number", description: "Cantidad de resultados a retornar (por defecto 20)" },
        page: { type: "number", description: "Número de página a buscar" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_all",
    description: "Buscar tanto mensajes como archivos en Slack.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Query de búsqueda" },
        count: { type: "number", description: "Cantidad de resultados a retornar (por defecto 20)" },
        page: { type: "number", description: "Número de página a buscar" },
        sort: { type: "string", description: "Campo de ordenamiento (ej. 'timestamp')" },
        sort_dir: { type: "string", description: "Dirección de orden (ej. 'desc')" }
      },
      required: ["query"]
    }
  },
  {
    name: "users_list",
    description: "Listar miembros del espacio de trabajo.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        cursor: { type: "string", description: "Cursor para paginar" },
        limit: { type: "number", description: "Límite de resultados (por defecto 100)" },
        include_locale: { type: "boolean", description: "Si se debe incluir el locale del usuario" }
      }
    }
  },
  {
    name: "users_info",
    description: "Obtener detalles y perfil de un usuario específico de Slack.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "ID del usuario de Slack (ej. 'U123456')" },
        include_locale: { type: "boolean", description: "Si se debe incluir el locale del usuario" }
      },
      required: ["user"]
    }
  },
  {
    name: "get_users_channel_sections_list",
    description: "Obtener las secciones personalizadas de la barra lateral del usuario actual de Slack.",
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
    description: "Obtener el historial de mensajes de un canal de Slack (acepta ID de canal o nombre con/sin #).",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "ID o nombre del canal (ej. 'C123456' o 'peya-platform-services-daimon')" },
        limit: { type: "number", description: "Límite de mensajes a retornar (por defecto 100)" },
        cursor: { type: "string", description: "Cursor para paginar" },
        latest: { type: "string", description: "End timestamp para el filtro de tiempo" },
        oldest: { type: "string", description: "Start timestamp para el filtro de tiempo" },
        inclusive: { type: "boolean", description: "Si se deben incluir los límites de tiempo" }
      },
      required: ["channel"]
    }
  },
  {
    name: "conversations_list",
    description: "Listar canales públicos y privados disponibles de Slack.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        exclude_archived: { type: "boolean", description: "Excluir canales archivados (por defecto true)" },
        types: { type: "string", description: "Tipos de canales separados por coma (ej. 'public_channel,private_channel')" },
        limit: { type: "number", description: "Límite de resultados (por defecto 100)" },
        cursor: { type: "string", description: "Cursor para paginar" }
      }
    }
  },
  {
    name: "conversations_members",
    description: "Listar miembros de un canal específico de Slack (acepta ID de canal o nombre).",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "ID o nombre del canal de Slack." },
        limit: { type: "number", description: "Límite de miembros a retornar (por defecto 100)" },
        cursor: { type: "string", description: "Cursor para paginar" }
      },
      required: ["channel"]
    }
  },
  {
    name: "conversations_replies",
    description: "Leer el hilo de respuestas de un mensaje padre en Slack (acepta ID de canal o nombre).",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "ID o nombre del canal de Slack." },
        ts: { type: "string", description: "Timestamp del mensaje padre (ej. '1234567890.123456')" },
        limit: { type: "number", description: "Límite de respuestas a retornar" },
        cursor: { type: "string", description: "Cursor para paginar" },
        latest: { type: "string", description: "End timestamp para el filtro" },
        oldest: { type: "string", description: "Start timestamp para el filtro" },
        inclusive: { type: "boolean", description: "Si se deben incluir los límites" }
      },
      required: ["channel", "ts"]
    }
  },
  {
    name: "conversations_info",
    description: "Obtener metadatos de una conversación o canal de Slack (acepta ID de canal o nombre).",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "ID o nombre del canal de Slack." },
        include_locale: { type: "boolean", description: "Incluir locale del canal" },
        include_num_members: { type: "boolean", description: "Incluir cantidad de miembros" }
      },
      required: ["channel"]
    }
  },
  {
    name: "get_channel_by_name",
    description: "Buscar un canal por nombre y obtener toda su información y metadatos relevantes.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del canal, ej. 'peya-platform-services-daimon'" }
      },
      required: ["name"]
    }
  },
  {
    name: "get_message_by_url",
    description: "Obtener un mensaje o hilo de Slack pegando directamente su URL/enlace de Slack archives.",
    annotations: {
      readOnlyHint: true
    },
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL del mensaje de Slack (ej: https://deliveryhero.slack.com/archives/C0BHN4GBMD2/p1786428589673259)" }
      },
      required: ["url"]
    }
  },
  {
    name: "download_file",
    description: "Descargar un archivo o imagen privada de Slack utilizando la sesión autenticada y guardarlo localmente.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL de descarga del archivo en Slack (ej: url_private_download o url_private)" },
        local_path: { type: "string", description: "Ruta local donde guardar el archivo (ej: 'image.png')" }
      },
      required: ["url", "local_path"]
    }
  },
];

// Simple memory cache for resolved channel names to prevent redundant requests
const CHANNEL_NAME_CACHE = {};

/**
 * Executes a GET request to the Slack Web API.
 */
async function slackGet(endpoint, params, credentials) {
  const url = new URL(endpoint);
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      url.searchParams.append(key, String(val));
    }
  }
  
  const headers = {
    'Authorization': `Bearer ${credentials.teamToken}`,
    'Cookie': `d=${credentials.cookieD}; d-s=${credentials.cookieDS}`
  };
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: headers
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status} from Slack: ${errorText}`);
  }
  
  return await response.json();
}

/**
 * Executes a POST request to the Slack Web API with urlencoded form data.
 */
async function slackPostForm(endpoint, formData, credentials) {
  const url = new URL(endpoint);
  
  const headers = {
    'Authorization': `Bearer ${credentials.teamToken}`,
    'Cookie': `d=${credentials.cookieD}; d-s=${credentials.cookieDS}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  
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
  
  return await response.json();
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
  switch (name) {
    case "search_messages":
      return await slackGet("https://slack.com/api/search.messages", {
        query: args.query,
        count: args.count,
        page: args.page
      }, credentials);
      
    case "search_all":
      return await slackGet("https://slack.com/api/search.all", {
        query: args.query,
        count: args.count,
        page: args.page,
        sort: args.sort,
        sort_dir: args.sort_dir
      }, credentials);
      
    case "users_list":
      return await slackGet("https://slack.com/api/users.list", {
        cursor: args.cursor,
        limit: args.limit,
        include_locale: args.include_locale
      }, credentials);
      
    case "users_info":
      return await slackGet("https://slack.com/api/users.info", {
        user: args.user,
        include_locale: args.include_locale
      }, credentials);
      
    case "get_users_channel_sections_list":
      return await slackPostForm("https://slack.com/api/users.channelSections.list", {
        token: credentials.enterpriseToken
      }, credentials);
      
    case "conversations_history": {
      const channelId = await resolveChannelId(args.channel, credentials);
      return await slackGet("https://slack.com/api/conversations.history", {
        channel: channelId,
        limit: args.limit,
        cursor: args.cursor,
        latest: args.latest,
        oldest: args.oldest,
        inclusive: args.inclusive
      }, credentials);
    }
      
    case "conversations_list":
      return await slackGet("https://slack.com/api/conversations.list", {
        exclude_archived: args.exclude_archived !== undefined ? args.exclude_archived : true,
        types: args.types || "public_channel,private_channel",
        limit: args.limit,
        cursor: args.cursor
      }, credentials);
      
    case "conversations_members": {
      const channelId = await resolveChannelId(args.channel, credentials);
      return await slackGet("https://slack.com/api/conversations.members", {
        channel: channelId,
        limit: args.limit,
        cursor: args.cursor
      }, credentials);
    }
      
    case "conversations_replies": {
      const channelId = await resolveChannelId(args.channel, credentials);
      return await slackGet("https://slack.com/api/conversations.replies", {
        channel: channelId,
        ts: args.ts,
        limit: args.limit,
        cursor: args.cursor,
        latest: args.latest,
        oldest: args.oldest,
        inclusive: args.inclusive
      }, credentials);
    }
      
    case "conversations_info": {
      const channelId = await resolveChannelId(args.channel, credentials);
      return await slackGet("https://slack.com/api/conversations.info", {
        channel: channelId,
        include_locale: args.include_locale,
        include_num_members: args.include_num_members
      }, credentials);
    }
    
    case "get_channel_by_name": {
      const channelId = await resolveChannelId(args.name, credentials);
      return await slackGet("https://slack.com/api/conversations.info", {
        channel: channelId,
        include_num_members: true
      }, credentials);
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
      }, credentials);
    }
      
    case "download_file": {
      if (!args.url || !args.local_path) {
        throw new Error("Missing required arguments: url and local_path");
      }
      const token = credentials.enterpriseToken || credentials.teamToken;
      const headers = {
        "Authorization": `Bearer ${token}`
      };
      if (credentials.cookieD) {
        headers["Cookie"] = `d=${credentials.cookieD}` + (credentials.cookieDS ? `; d-s=${credentials.cookieDS}` : "");
      }
      const res = await fetch(args.url, { headers });
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
