# 🚀 Ultra-Lightweight Slack MCP Server (Node.js)

This project is a modern, ultra-lightweight, and lightning-fast Model Context Protocol (MCP) server for Slack, written in Node.js (ES Modules).

It provides full Slack search, conversation reading, and user metadata capabilities to LLM assistants (such as Claude Desktop and Gemini CLI) without requiring you to create an official Slack Bot, submit OAuth applications, or request administrative app installation approvals.

---

### Key Advantages
* **Instant Startup:** Bootstraps in ~10–20 milliseconds (unlike heavy JVM runtimes).
* **Pure JavaScript (Zero Native Compilations):** Uses the macOS-native /usr/bin/sqlite3 binary directly under the hood to query cookies, avoiding brittle C++ native node-gyp bindings.
* **Zero-Config Local Authentication:** Automatically extracts and decrypts active session cookies and tokens, prioritizing the **Slack Desktop App (Electron)** on macOS with full fallback to **Google Chrome**.
* **Self-Healing Session Recovery:** Dynamically resolves credentials and automatically reloads tokens upon `invalid_auth` errors without requiring server restarts.

---

## 🔑 Authentication Mechanism (Zero-Config)

To query Slack channels and messages seamlessly as your authenticated user:
1. **Slack Desktop (Primary):** Authenticates directly from your macOS Slack Desktop App session (`Slack.app`), extracting `d` cookies from the Slack container SQLite database and tokens from Slack LevelDB.
2. **Google Chrome (Fallback):** If Slack Desktop credentials are not found, falls back completely to Google Chrome (cookies + tokens from Chrome Local Storage).
3. **Session Coherence:** Cookies and tokens are strictly kept in sync from the same application source to eliminate `invalid_auth` session mismatches.
4. **Auto-Recovery:** If a token expires or rotates, requests encountering `invalid_auth` automatically trigger an in-memory hot reload and single retry before reporting an error.

*Note: Due to Keychain secure decryption and path configurations, this zero-config extraction is currently optimized for macOS.*

---

## ⚙️ Configuration in Gemini CLI (settings.json)

To register this lightweight Node.js Slack MCP server in your Gemini CLI, add it to your mcpServers configuration block (typically under ~/.gemini/settings.json):

```json
{
  "mcpServers": {
    "slack-mcp": {
      "command": "node",
      "args": [
        "/path/to/mcp-slack/index.js"
      ],
      "env": {
        "SLACK_WORKSPACE_URL": "https://your-workspace.slack.com/"
      }
    }
  }
}
```

> 💡 **Default Workspace URL:** If omitted, SLACK_WORKSPACE_URL falls back to https://deliveryhero.slack.com/.

---

## 🛠️ Exposed MCP Tools

This server exposes 13 tools compliant with the Model Context Protocol:

* **Search**:
  * search_messages: Search messages across accessible Slack channels.
  * search_all: Search both messages and files across Slack.
* **Users**:
  * users_list: List workspace members.
  * users_info: Get details and profile information for a specific Slack user.
  * get_users_channel_sections_list: Get custom sidebar channel sections for the authenticated user.
* **Conversations**:
  * conversations_list: List public and private Slack channels available in the workspace.
  * conversations_history: Get message history from a channel (accepts channel ID or plain name with or without #).
  * conversations_replies: Read thread replies for a parent message.
  * conversations_members: List members of a specific Slack channel.
  * conversations_info: Get metadata for a conversation or channel.
  * get_channel_by_name: Find a channel by name and retrieve its full metadata.
  * get_message_by_url: Fetch a Slack message or thread directly from its archive URL.
* **Files**:
  * download_file: Download a private Slack file or image using the authenticated session and save it locally.

---

## 🧪 Running Tests

To run the unit test suite and verify routing and mock interceptors:
```bash
node test.js
```
