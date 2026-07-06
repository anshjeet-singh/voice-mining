/**
 * LLM layer backed directly by the Anthropic API (official SDK).
 *
 * Keeps the same `invokeLLM(params) -> InvokeResult` interface the report
 * generators were written against, so callers don't change. JSON-mode
 * requests (`response_format: {type: "json_object"}`) are honoured by
 * instructing the model and stripping any markdown fences from the output.
 *
 * Model is configurable via ANTHROPIC_MODEL (default: claude-opus-4-8).
 */
import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

export type ResponseFormat = { type: "text" } | { type: "json_object" };

export type InvokeParams = {
  messages: Message[];
  maxTokens?: number;
  max_tokens?: number;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type InvokeResult = {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: ENV.anthropicApiKey });
  }
  return _client;
}

/** Strip markdown code fences the model may wrap around JSON output. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const client = getClient();

  const wantsJson =
    (params.responseFormat ?? params.response_format)?.type === "json_object";

  // Anthropic separates the system prompt from the message list.
  const systemParts: string[] = [];
  const messages: Anthropic.MessageParam[] = [];
  for (const message of params.messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else {
      messages.push({ role: message.role, content: message.content });
    }
  }
  if (wantsJson) {
    systemParts.push(
      "Respond with a single valid JSON object and nothing else. No markdown fences, no commentary before or after the JSON."
    );
  }
  if (messages.length === 0) {
    messages.push({ role: "user", content: "Proceed." });
  }

  const maxTokens = params.maxTokens ?? params.max_tokens ?? 32000;

  // Stream so large generations don't hit HTTP timeouts, then collect the
  // final message.
  const stream = client.messages.stream({
    model: ENV.anthropicModel,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
    messages,
  });

  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined this request. Try rephrasing the keyword or brand voice content.");
  }

  let text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (wantsJson) {
    text = stripCodeFences(text);
  }

  return {
    id: response.id,
    model: response.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: response.stop_reason,
      },
    ],
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}
