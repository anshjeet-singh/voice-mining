/**
 * Provider-agnostic LLM layer for report generation.
 *
 * Selected by LLM_PROVIDER:
 *   - "gemini" (default): Google Gemini via its OpenAI-compatible endpoint.
 *     Uses your existing Gemini API key; the free tier covers real usage.
 *   - "anthropic": Anthropic Claude via the official SDK.
 *
 * Both paths honour the same `invokeLLM(params) -> InvokeResult` interface the
 * report generators are written against, and both honour JSON mode
 * (`response_format: {type: "json_object"}`) by instructing the model and
 * stripping any markdown fences from the output.
 *
 * Switching Gemini -> Claude later is a one-variable change: set
 * LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY.
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

/** Strip markdown code fences the model may wrap around JSON output. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function wantsJson(params: InvokeParams): boolean {
  return (params.responseFormat ?? params.response_format)?.type === "json_object";
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (ENV.llmProvider === "anthropic") {
    return invokeAnthropic(params);
  }
  return invokeGemini(params);
}

// ─── Gemini (OpenAI-compatible endpoint) ─────────────────────────────────────

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

async function invokeGemini(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const json = wantsJson(params);

  const messages = params.messages.map((m) => ({ role: m.role, content: m.content }));
  if (json) {
    messages.push({
      role: "system",
      content:
        "Respond with a single valid JSON object and nothing else. No markdown fences, no commentary.",
    });
  }

  const payload: Record<string, unknown> = {
    model: ENV.geminiModel,
    messages,
    max_tokens: params.maxTokens ?? params.max_tokens ?? 32000,
  };
  if (json) {
    payload.response_format = { type: "json_object" };
  }

  const resp = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ENV.geminiApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Gemini request failed (${resp.status} ${resp.statusText}): ${detail.slice(0, 300)}`);
  }

  const data = (await resp.json()) as {
    id?: string;
    model?: string;
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  let text = data.choices?.[0]?.message?.content ?? "";
  if (json) text = stripCodeFences(text);

  return {
    id: data.id ?? "gemini",
    model: data.model ?? ENV.geminiModel,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: data.choices?.[0]?.finish_reason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens: data.usage?.total_tokens ?? 0,
    },
  };
}

// ─── Anthropic (official SDK) ────────────────────────────────────────────────

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });
  }
  return _anthropic;
}

async function invokeAnthropic(params: InvokeParams): Promise<InvokeResult> {
  const client = getAnthropic();
  const json = wantsJson(params);

  const systemParts: string[] = [];
  const messages: Anthropic.MessageParam[] = [];
  for (const message of params.messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else {
      messages.push({ role: message.role, content: message.content });
    }
  }
  if (json) {
    systemParts.push(
      "Respond with a single valid JSON object and nothing else. No markdown fences, no commentary before or after the JSON."
    );
  }
  if (messages.length === 0) {
    messages.push({ role: "user", content: "Proceed." });
  }

  const maxTokens = params.maxTokens ?? params.max_tokens ?? 32000;

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
  if (json) text = stripCodeFences(text);

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
