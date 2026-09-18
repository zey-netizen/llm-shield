const DEFAULTS = { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 8000, onRetry: null, onRecover: null };

export function isTransient400(err) {
  if (!err) return false;
  const status = err.status || err.statusCode || err?.response?.status;
  const msg = String(err.message || err.error?.message || "").toLowerCase();
  if (status !== 400) return false;
  return msg.includes("could not parse json body") || msg.includes("invalid json body") ||
    msg.includes("malformed request") || msg.includes("upstream connect error") ||
    msg.includes("connection reset") || msg.includes("eof");
}

export function isTruncatedStream(err) {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  return msg.includes("eof while parsing") || msg.includes("unexpected end of json") ||
    msg.includes("incomplete json") || msg.includes("stream ended before") ||
    (msg.includes("invalid json") && msg.includes("eof"));
}

export function isMalformedToolArgs(err) {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const type = String(err.type || err.code || "").toLowerCase();
  return (type.includes("tool") && msg.includes("json")) ||
    msg.includes("tool call arguments") ||
    (msg.includes("function arguments") && msg.includes("parse"));
}

export function sanitizeToolArgs(raw) {
  if (typeof raw !== "string") return raw;
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  s = s.replace(/,\s*([}\]])/g, "$1");
  if (!s.includes('"') && s.includes("'")) s = s.replace(/'/g, '"');
  try { return JSON.parse(s); } catch { return raw; }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function backoff(attempt, base, max) {
  const exp = Math.min(base * Math.pow(2, attempt), max);
  return Math.floor(exp + Math.random() * 0.3 * exp);
}

export function shield(fn, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  return async function shielded(...args) {
    let lastErr;
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        const result = await fn(...args);
        if (result && Array.isArray(result.toolCalls)) {
          for (const tc of result.toolCalls) {
            if (tc?.function?.arguments && typeof tc.function.arguments === "string") {
              const fixed = sanitizeToolArgs(tc.function.arguments);
              if (typeof fixed === "object") {
                tc.function.arguments = fixed;
                opts.onRecover?.({ kind: "tool_args_sanitized", toolCall: tc });
              }
            }
          }
        }
        return result;
      } catch (err) {
        lastErr = err;
        const transient400 = isTransient400(err);
        const truncated = isTruncatedStream(err);
        const malformed = isMalformedToolArgs(err);
        if (!transient400 && !truncated && !malformed) throw err;
        if (attempt === opts.maxRetries) throw err;
        const kind = transient400 ? "transient_400" : truncated ? "truncated_stream" : "malformed_tool_args";
        opts.onRetry?.({ attempt: attempt + 1, kind, error: err });
        await sleep(backoff(attempt, opts.baseDelayMs, opts.maxDelayMs));
      }
    }
    throw lastErr;
  };
}

export default shield;

// Convenience wrapper for OpenAI-style clients
export function wrapOpenAI(client) {
  if (!client?.chat?.completions?.create) {
    throw new Error("wrapOpenAI: expected an OpenAI client instance");
  }
  return {
    ...client,
    chat: {
      ...client.chat,
      completions: {
        ...client.chat.completions,
        create: shield(
          client.chat.completions.create.bind(client.chat.completions),
          { maxRetries: 3 }
        ),
      },
    },
  };
}