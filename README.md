# dsh-qsearch

Native **Gemini / OpenAI / Grok** web search for DeepSeek Harness (`ctx.web`).

The built-in `web_search` tool stays the same. While this plugin is mounted, a fiber effect routes `ctx.web.search` through `qsearch`. Unloading the fiber restores the official provider (`deepseek-official`) — the bundle patch never rewrites `web.searchProvider`, so uninstall has no leftover composition side effect. Search is an auxiliary native-API call — it does **not** go through `ctx.llm` and does **not** scrape URLs out of model prose.

## Why rewrite the base URL

Models-page routes are usually **OpenAI-compatible** (`…/v1` or `…/v1beta/openai`) so chat works. Native search is a different surface:

| Protocol | Conversation base (typical) | Search request |
|---|---|---|
| Gemini | `…/v1` or `…/v1beta/openai` | `POST {base}/v1beta/models/{model}:generateContent` + `tools: [{ google_search: {} }]` |
| OpenAI | `…/v1` | `POST {base}/responses` + `tools: [{ type: "web_search" }]` |
| Grok | `…/v1` | `POST {base}/chat/completions` + `search_parameters: { mode: "on" }` |

Credentials reuse the selected `llm-pi-ai` route: the profile’s `apiKeyEnv`, or `<ROUTE>_API_KEY` when the profile has none.

## Install

```sh
dsh plugin --profile web add /absolute/path/to/dsh-qsearch
```

Or from a git remote after publish. Restart / reload the profile so the bundle patch applies.

The patch only inserts this plugin:

```yaml
- insert:
    - id: qsearch
      name: dsh-qsearch
```

Removing the bundle drops that row. The official `web` pin is unchanged, so search falls back to DeepSeek with no extra patch cleanup.

## Settings

**Settings → QSearch** (own left-nav page)

- **Search protocol** — `auto` or Gemini / OpenAI / Grok native. Independent of the LLM chat `api`.
- **Configured route** — a live Models-page provider. Key + conversation `baseURL` come from this route.
- **Search model** — required. Id on that route, used for the auxiliary search turn.
- Preview shows the rewritten native search URL.

`auto` infers the protocol from the search model id (`gemini*` / `gpt*` / `grok*` …). It does not probe keys.

## Config (Host)

Namespace `qsearch` (flat fields):

| Key | Default | Meaning |
|---|---|---|
| `backend` | `auto` | `auto` \| `gemini` \| `openai` \| `grok` |
| `route` | (required) | `llm-pi-ai` route key (`google` / `openai` / `xai` / a gateway) |
| `model` | (required) | Search model id |
| `maxTokens` | `2048` | Output cap on the auxiliary request |

## Failures

| Situation | Code |
|---|---|
| No key | `WEB_PROVIDER_CREDENTIAL_MISSING` |
| Cancelled | `WEB_ABORTED` |
| No grounding / citations / web_search sources | `WEB_PROVIDER_ERROR` |
| HTTP / rewrite / network | `WEB_PROVIDER_ERROR` |

## Develop

```sh
npm install
npm test
npm run build
```
