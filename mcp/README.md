# Rascals AI debug server (MCP)

A tiny [Model Context Protocol](https://modelcontextprotocol.io) server that
lets any MCP-capable AI assistant (Claude Desktop, Cursor, Windsurf, …)
diagnose **"why can't I add my friend / why is everyone offline?"** from a
diagnostics report you copy out of Rascals. No dependencies, no network —
it runs locally over stdio.

## The workflow

1. **In Rascals:** Friends panel → **Connection doctor** → **Copy report**.
   That puts a JSON snapshot on your clipboard (relays, peers, settings —
   no messages, no keys).
2. **In your AI chat:** paste the report and ask e.g.
   *"my friend add isn't working, here's my Rascals report: {…}"*
3. The AI calls the `analyze_rascals_connection` tool and answers with a
   verdict (HEALTHY / DEGRADED / BLOCKED) plus ordered fix steps.

## Registering the server

Point your MCP client at this file:

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "rascals-debug": {
      "command": "node",
      "args": ["/absolute/path/to/rascals/mcp/rascals-mcp.mjs"]
    }
  }
}
```

**Cursor / generic stdio client:**
```json
{ "command": "node", "args": ["/absolute/path/to/rascals/mcp/rascals-mcp.mjs"] }
```

Restart the client after editing its config.

## Tools exposed

| Tool | What it does |
|---|---|
| `analyze_rascals_connection` | Takes the pasted report JSON → verdict + findings + fix steps |
| `rascals_connection_guide` | Full failure-mode knowledge base (F1–F6) |
| `parse_rascals_invite` | Validates a `rascal1:…` invite code, extracts the name |

## Testing it by hand

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node mcp/rascals-mcp.mjs
```
