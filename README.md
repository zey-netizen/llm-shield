[![npm version](https://img.shields.io/npm/v/@coder12-z/llm-shield.svg)](https://www.npmjs.com/package/@coder12-z/llm-shield)
[![license](https://img.shields.io/npm/l/@coder12-z/llm-shield.svg)](https://www.npmjs.com/package/@coder12-z/llm-shield)

# llm-shield

Zero-dependency error recovery layer for LLM SDKs. Auto-retry transient 400s, truncated streaming responses, and malformed tool call arguments.

## The problem

Your Node.js app crashes with:

- `BadRequestError: 400 could not parse JSON body`
- `SyntaxError: Invalid JSON: EOF while parsing an object`
- `Invalid JSON in tool call arguments`

These are transient SDK / network artifacts. They kill your pipeline.

## Install

```bash
npm install @coder12-z/llm-shield
```

## Use

```javascript
import { shield } from "@coder12-z/llm-shield";
import OpenAI from "openai";

const client = new OpenAI();

const safeCall = shield(async (prompt) =>
  client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  }),
  { maxRetries: 3 }
);

const res = await safeCall("Return JSON with {name: string}");
```

## Convenience wrapper (OpenAI)

```javascript
import OpenAI from "openai";
import { wrapOpenAI } from "@coder12-z/llm-shield";

const client = wrapOpenAI(new OpenAI());
// Now every call is shielded automatically
const res = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hi" }],
});
```

## What it handles

| Error | Detection | Action |
|-------|-----------|--------|
| Transient 400 (`could not parse JSON body`) | `isTransient400` | Retry with exponential backoff + jitter |
| Truncated stream (`EOF while parsing`) | `isTruncatedStream` | Retry |
| Malformed tool call args | `isMalformedToolArgs` | Sanitize inline, no retry |

## What it does NOT do

- It does not repair arbitrary JSON strings — use [`jsonrepair`](https://www.npmjs.com/package/jsonrepair) for that.
- It does not call LLMs for you. It wraps your existing SDK calls.
- No API key. No network. No dependencies.

## API

### `shield(fn, options?)`

Wraps an async function with error classification + retry.

Options:
- `maxRetries` (default `3`)
- `baseDelayMs` (default `500`)
- `maxDelayMs` (default `8000`)
- `onRetry({ attempt, kind, error })`
- `onRecover({ kind, toolCall })`

### `wrapOpenAI(client)`

Returns a cloned client with `chat.completions.create` shielded automatically.

### Helpers

- `isTransient400(err)`
- `isTruncatedStream(err)`
- `isMalformedToolArgs(err)`
- `sanitizeToolArgs(rawStringOrObject)`

## Links

- npm: https://www.npmjs.com/package/@coder12-z/llm-shield
- GitHub: https://github.com/zey-netizen/llm-shield
- Landing: https://zey-netizen.github.io/llm-shield/

## License

MIT