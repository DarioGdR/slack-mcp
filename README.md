# 🚀 Ultra-Lightweight Slack MCP Server (Node.js)

This project is a modern, ultra-lightweight, and lightning-fast **Model Context Protocol (MCP)** server for Slack, written in Node.js (ES Modules). It is a direct, optimized port of the Kotlin `pedidosya/slack-mcp` server. 

### Why is this Node.js version superior?
* **Instant Startup:** Bootstraps in ~10–20 milliseconds compared to several seconds for the JVM/Kotlin JAR.
* **Pure JavaScript (Zero Native Compilations):** Uses the macOS-native `/usr/bin/sqlite3` binary directly under the hood to query cookies. This avoids having to compile heavy C++ SQLite bindings (which fail to build across Node versions).
* **Zero-Config local authentication:** Identical to the original Kotlin version, it automatically extracts and decrypts active session cookies and tokens from Google Chrome and the Slack Desktop app. No Slack Bot/App creation or admin approvals are required!

---

## 🔑 Authentication Mechanism (Zero-Config)

To access Slack channels and messages as *your* active user:
1. **Google Chrome:** Make sure you are logged into Slack on Google Chrome on the same macOS machine where you run this MCP server.
2. **Cookies (`d`, `d-s`)**: Cookies are queried from Chrome's SQLite cookie database and decrypted using your Google Chrome Safe Storage password from the macOS Keychain.
3. **Tokens (`xoxc-`, `xoxp-`)**: Client tokens are extracted from Chrome Local Storage or Slack Desktop's local database.

*Note: Due to Keychain secure decryption and path configurations, this zero-config extraction is optimized specifically for **macOS**.*

---

## ⚙️ Configuration in Gemini CLI (`settings.json`)

To register this lightweight Node.js Slack MCP server in your **Gemini CLI**, add it to your `"mcpServers"` configuration block (typically under `~/.gemini/settings.json` or project-local `.gemini/settings.json`):

```json
{
  "mcpServers": {
    "slack-mcp": {
      "command": "node",
      "args": [
        "/Users/dario.garcia/dev/gemini/peya-tmp-users-auth/index.js"
      ]
    }
  }
}
```

> 💡 **Custom Workspace URL:** If you want to use a different Slack workspace domain (other than the default `https://deliveryhero.slack.com/`), you can set the `SLACK_WORKSPACE_URL` environment variable:
> ```json
>       "env": {
>         "SLACK_WORKSPACE_URL": "https://your-workspace.slack.com/"
>       }
> ```

---

## 🛠️ Herramientas Expuestas (Tools)

This server exposes exactly the same 10 tools as the original Kotlin implementation:

* **Búsquedas (Search)**:
  * `search_messages`: Buscar mensajes en canales de Slack.
  * `search_all`: Buscar tanto mensajes como archivos.
* **Usuarios (Users)**:
  * `users_list`: Listar miembros del espacio de trabajo.
  * `users_info`: Obtener detalles y perfil de un usuario específico.
  * `get_users_channel_sections_list`: Obtener las secciones personalizadas de la barra lateral del usuario actual (utilizando el token Grid Enterprise).
* **Conversaciones (Conversations)**:
  * `conversations_list`: Listar canales públicos y privados disponibles.
  * `conversations_history`: Obtener el historial de mensajes de un canal.
  * `conversations_replies`: Leer el hilo de respuestas de un mensaje padre.
  * `conversations_members`: Listar miembros de un canal específico.
  * `conversations_info`: Obtener metadatos de una conversación.

---

## 🧪 Running Tests

To run the unit test suite and verify that the routing and HTTP mocks are working perfectly:
```bash
node test.js
```
All tests complete in a few milliseconds!
