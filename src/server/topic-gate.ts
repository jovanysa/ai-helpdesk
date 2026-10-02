/** Answers one yes/no question: is this message for the foundation at all? */
export type TopicGate = (question: string) => Promise<boolean>;

export interface OllamaTopicGateConfig {
  url: string;
  model: string;
  fetchFn?: typeof fetch;
}

export const TOPIC_GATE_PROMPT = `Decide whether the user's message is a question for Al-Khair Foundation, a charity in Cairo.
Topics of the foundation: donating money or goods, donation receipts, volunteering, asking the charity for help (food, school supplies, medical bills, documents), the address, opening days and hours, contacting the charity.
Anything else (general knowledge, geography, sports, cooking, news, weather, politics, celebrities) is NOT about the foundation.

Examples:
"ازاي اتبرع؟" -> {"about_foundation": true}
"انتو فاتحين امتى؟" -> {"about_foundation": true}
"What documents do I need?" -> {"about_foundation": true}
"مين كسب الماتش امبارح؟" -> {"about_foundation": false}
"What is the capital of Italy?" -> {"about_foundation": false}`;

const GATE_SCHEMA = {
  type: 'object',
  properties: { about_foundation: { type: 'boolean' } },
  required: ['about_foundation'],
};

const GATE_TIMEOUT_MS = 30_000;

/**
 * A separate, tiny model call. A 3B model writing a whole answer often ignores
 * "refuse off-topic questions"; answering only true/false it is reliable.
 */
export function createOllamaTopicGate({ url, model, fetchFn = fetch }: OllamaTopicGateConfig): TopicGate {
  return async (question) => {
    const response = await fetchFn(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: GATE_SCHEMA,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: TOPIC_GATE_PROMPT },
          { role: 'user', content: question },
        ],
      }),
      signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = (await response.json()) as { message?: { content?: string } };
    const value = (JSON.parse(data.message?.content ?? '') as Record<string, unknown>)['about_foundation'];
    if (typeof value !== 'boolean') throw new Error(`Unexpected topic check answer: ${data.message?.content}`);
    return value;
  };
}
