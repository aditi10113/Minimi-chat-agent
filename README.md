# Minimi — memory-aware web research chat agent

A small Node.js chat agent built for the Minimi hiring challenge. It has one tool: the OpenAI Responses API's hosted `web_search` tool. It also keeps a durable, timestamped record of the conversation so follow-up questions can refer to earlier discussions.

## 1. Run locally

### Requirements
- Node.js 20 or newer
- npm
- An OpenAI API key with access to the Responses API and a model that supports hosted web search

### Setup
```bash
npm install
```

Copy `.env.example` to `.env` and add your API key:
```env
OPENAI_API_KEY=your_real_key
OPENAI_MODEL=gpt-6-astra
PORT=3000
```

If `gpt-6-astra` is not enabled for your API account, set `OPENAI_MODEL` to a Responses API model available to you that supports web search.

Start the app:
```bash
npm start
```

Open http://localhost:3000.

For auto-restart during development:
```bash
npm run dev
```

Check syntax:
```bash
npm run check
```

## 2. API keys

Only one key is required:
- `OPENAI_API_KEY` — authenticates model requests and the built-in web-search tool.

No separate search-provider key is needed. The model decides when to invoke `web_search`; the server does not expose any other tools.

## 3. How it works

1. The browser creates a random conversation ID and sends it with each message.
2. Express validates the request and stores user/assistant turns in `data/conversations.json`, including UTC timestamps.
3. Before each model call, the server builds a compact context from recent turns. If the message mentions a weekday, yesterday/today, or a date such as "3 November", it resolves that reference in the browser's IANA timezone and retrieves matching older turns from the full archive.
4. The server calls the Responses API with one tool: `{ type: "web_search" }`. Search context is medium and tool choice is automatic, so stable questions can be answered without paying the search cost while current/change questions can search.
5. The model receives explicit instructions to recover the baseline, verify changing claims against current sources, prefer primary sources, and distinguish "unchanged" from "not verified".
6. The server saves the answer and extracts URL citations from response annotations. The UI renders the answer and source links.

## 4. Why this architecture

- **One search tool, one key:** hosted web search avoids a second provider, custom crawling, and a brittle search-result-to-answer pipeline.
- **Application-owned memory:** history is stored independently of the model provider. That makes "what did I ask on a date?" deterministic and portable; it also avoids depending on an opaque model conversation state.
- **Temporal retrieval before generation:** exact-day retrieval means old turns remain findable even after the recent context window moves on. The model is given the user's timezone and the resolved date.
- **Search on demand:** `tool_choice: "auto"` lets the model skip search for stable questions. For freshness or change detection, instructions tell it to search and compare.
- **Citations from response annotations:** links come from the API's citation metadata, not guessed URLs.
- **Small operational surface:** one server, one static UI, one JSON archive, no vector database, queue, or separate search service.

## 5. What I considered and rejected

- **A second search API (Tavily/SerpAPI):** rejected for the first version because it adds another key, another failure mode, and a second source-normalization layer. I would revisit it if independent search-provider evaluation or custom ranking became a requirement.
- **Vector database for memory:** rejected because this challenge's examples are primarily chronological and exact-entity recall. A timestamped archive plus deterministic date retrieval is simpler and more auditable. Semantic retrieval can be added when histories become large or users ask fuzzy questions across many months.
- **Only using the model's previous-response ID:** rejected because it makes historical retrieval and auditability harder, and can couple memory to provider-side state.
- **Always forcing web search:** rejected because it increases latency and cost for stable facts. Automatic tool choice is a better default; freshness prompts should trigger search.
- **A full agent framework:** rejected because there is only one tool and one orchestration step. Direct Responses API calls make the control flow easy to inspect.

## 6. Known limitations / production hardening

- JSON-file persistence is appropriate for a single-process take-home demo, not multi-instance production. Replace it with SQLite/Postgres and transactional writes before horizontal scaling.
- The app has no authentication. Do not expose it publicly with private conversations until auth, per-user authorization, CSRF/origin protections, and retention controls are added.
- Weekday/date resolution handles common English references but is intentionally not a full natural-language date parser. Add tests and a date parser for multilingual or ambiguous phrases.
- History is scoped to one browser's local session ID. There is no cross-device identity or account system.
- The API response is non-streaming for simpler citation extraction. Add streaming once the UI can safely reconcile partial text and final citation annotations.
- Rate limiting is per server process/IP and should be tuned for deployment.

## 7. What I would do with another week

1. Add a test suite for date resolution, exact-day retrieval, history truncation, citation extraction, and the three sample benchmark prompts.
2. Move storage to SQLite/Postgres with a schema for conversations, turns, source snapshots, and timestamps.
3. Add a compact per-conversation research ledger: entities, decisions, cited claims, baseline dates, and unresolved questions. Retrieve ledger entries before raw turns.
4. Build a benchmark harness with adversarial cases: daylight-saving transitions, ambiguous weekdays, no matching history, conflicting pricing pages, stale changelogs, and a product rename.
5. Add streaming, request cancellation, retries with bounded backoff, structured logs, and latency/token/search telemetry.
6. Evaluate search quality and answer faithfulness on a fixed test set before changing models or adding another search provider.

## 8. Suggested demo script

1. Ask: "Compare CRM tools for a 20-person sales team. Include current pricing and sources."
2. Later ask: "On Monday we shortlisted those tools. Has any pricing changed or has anything big shipped since?"
3. Ask: "What did I ask you on 3 November? Is your answer still correct today?"
4. Ask a stable question that should not need search, then ask a current question that should.

The app will only recall dates that are present in this browser session's saved history. It will say so rather than invent missing conversations.
