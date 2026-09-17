# llm-shield

Zero-dependency error recovery layer for LLM SDKs.

## The problem

Your Node.js app crashes with:
- BadRequestError: 400 could not parse JSON body
- SyntaxError: Invalid JSON: EOF while parsing an object
- Invalid JSON in tool call arguments

These are transient SDK/network artifacts. They kill your pipeline.

## The fix

    npm install llm-shield

    import { shield } from "llm-shield";
    import OpenAI from "openai";
    const client = new OpenAI();
    const safeCall = shield(async (prompt) =>
      client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      })
    );

## License
MIT
