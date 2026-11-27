# Connecting AI tools and automations to HeroArc

Outside tools act for **one HeroArc user**. They use the same tools as Coach:
- reading what you've logged
- logging meals, weigh-ins, moods, habits and training
- proposing changes

Every connection follows the same rules:

- **New entries apply at once.** You can undo them in HeroArc (Settings → Agent activity).
- **Edits and deletions only propose.** This covers records, goals, habits, the training plan and the dashboard. They wait in Settings → Agent activity until you choose **Apply** or **Cancel**. A badge on the Settings button shows how many are waiting.
- **Oura data is never shared:** sleep, readiness, HRV, heart rate, steps and calories burned. Oura's API terms only allow AI tools to use it through Oura's own MCP server. Agents see a note saying so.

Below, `https://api.example.com` stands for your API address (`API_URL`). Settings → Connections shows the real one.

## Two ways to authenticate

| | Use for | How |
|---|---|---|
| **Sign in (OAuth)** | Claude (claude.ai, Desktop, Cowork), ChatGPT, other apps with "custom connectors" | Add `https://api.example.com/mcp`, then sign in to HeroArc and choose **Allow**. No key. Remove it under Settings → Connections → **Disconnect**. |
| **API key** | n8n, Hermes, Claude Code, Cursor, scripts | Settings → Connections → **Create key**. It's shown once, so copy it then. Send it as `Authorization: Bearer hak_…`. Remove it with **Revoke**. |

Each key or app shows up by name in Agent activity, so you can see who did what. Each key is limited to 120 requests a minute.

## Claude (claude.ai, Claude Desktop, Cowork)

1. In Claude, open Settings → Connectors → **Add custom connector**.
2. URL: `https://api.example.com/mcp`.
3. Claude opens HeroArc. Sign in if you need to, check what it's asking for, and choose **Allow**.

This needs HeroArc running on HTTPS at its real domain.

## ChatGPT

Add a connector (an "app" in developer mode) with the MCP server URL `https://api.example.com/mcp` and OAuth authentication. Then sign in to HeroArc and **Allow**, as with Claude.

## n8n

**MCP (recommended):** add an **MCP Client Tool** node to your AI Agent.
- Server Transport: **HTTP Streamable**
- Endpoint: `https://api.example.com/mcp`
- Authentication: **Bearer Auth**, using your HeroArc key

**REST:** use HTTP Request nodes.
- Import `https://api.example.com/api/agent/v1/openapi.json` (one operation per tool), or
- call a tool directly: `POST https://api.example.com/api/agent/v1/tools/<tool>`, with the tool's input as the JSON body.

## Hermes

**MCP:** add this to `config.yaml`:

```yaml
mcp_servers:
  heroarc:
    url: https://api.example.com/mcp
    headers:
      Authorization: "Bearer ${HEROARC_KEY}"
```

**The original API:** it still works. Change the base URL to `https://api.example.com` and the key to a HeroArc key. The routes and JSON are unchanged:

| Route | Change from before |
|---|---|
| `GET /today` | Oura fields are `null` |
| `POST /food` | none |
| `POST /weight` | none |
| `POST /training` | Calls for the same workout on the same day add up |
| `POST /sync` | Returns 503 until Oura sync is connected |

## Claude Code

```sh
claude mcp add --transport http heroarc https://api.example.com/mcp \
  --header "Authorization: Bearer hak_…"
```

## Scripts (curl)

```sh
curl -X POST https://api.example.com/api/agent/v1/tools/log_weight \
  -H "Authorization: Bearer hak_…" -H "Content-Type: application/json" \
  -d '{"lb": 150.2}'
```

`GET /api/agent/v1/tools` lists every tool with its input schema.

The reply is `{ ok, result, receipt? }`:
- `receipt.status` is `applied` for something that's done (undo it in HeroArc).
- `receipt.status` is `pending` for a proposal waiting for your OK.

## For whoever deploys HeroArc

- `APP_URL` and `API_URL` must be the public HTTPS addresses, e.g. `https://app.<domain>` and `https://api.<domain>`.
  - OAuth tokens are bound to `API_URL` + `/mcp`.
  - The sign-in server's issuer is `APP_URL` + `/api/auth`.
- Discovery documents that MCP clients find on their own:
  - `https://api.<domain>/.well-known/oauth-protected-resource/mcp`
  - `https://app.<domain>/.well-known/oauth-authorization-server/api/auth`
- `BETTER_AUTH_SECRET` signs sessions and encrypts the token-signing keys. Changing it signs everyone out and disconnects every app.
