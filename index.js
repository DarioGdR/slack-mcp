#!/usr/bin/env node

/**
 * Slack MCP Server - Main Entry Point
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getSlackCredentials } from "./credentials.js";
import { TOOLS_DEFINITIONS, executeTool } from "./tools.js";

async function main() {
  console.error("🔄 Loading Slack credentials...");
  let credentials;
  try {
    credentials = getSlackCredentials();
    console.error("✅ Slack credentials loaded successfully.");
  } catch (err) {
    console.error(`❌ Failed to load credentials: ${err.message}`);
    process.exit(1);
  }

  // Create MCP Server
  const server = new Server(
    {
      name: "slack-mcp-node",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register list of tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS_DEFINITIONS,
    };
  });

  // Register execution handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await executeTool(name, args || {}, credentials);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      console.error(`Error executing tool ${name}: ${err.message}`);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${err.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start connection
  console.error("🚀 Starting Slack MCP Server on STDIO...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Slack MCP Server successfully started.");
}

main().catch((err) => {
  console.error(`Fatal error in main: ${err.message}`);
  process.exit(1);
});
