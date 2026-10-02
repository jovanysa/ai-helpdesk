/** True when the current message is for the foundation; only clearly unrelated messages are false. */
export type TopicGate = (current: string, previous?: string) => Promise<boolean>;

export interface OllamaTopicGateConfig {
  url: string;
  model: string;
  fetchFn?: typeof fetch;
}

export const TOPIC_GATE_PROMPT = `You protect the customer-support chat of Al-Khair Foundation, a charity in Cairo that helps with donations, volunteering, food boxes, school supplies and medical bills.
Decide whether the CURRENT message is clearly unrelated to the charity: a general-knowledge question (geography, history, science), sports, cooking recipes, news, weather, politics, celebrities, or homework.
Everything else is related: greetings and thanks, questions about the charity, and anyone describing their own problem or need (job loss, hunger, illness, debts, school costs).
If you are not sure, it is related.
The PREVIOUS message is only context for understanding a short CURRENT message; judge only the CURRENT message.

Examples:
CURRENT: "السلام عليكم" -> {"unrelated": false}
CURRENT: "hi" -> {"unrelated": false}
CURRENT: "شكرا" -> {"unrelated": false}
CURRENT: "جوزي تعبان ومش لاقيين نجيب العلاج" -> {"unrelated": false}
CURRENT: "ازاي اتبرع؟" -> {"unrelated": false}
CURRENT: "Which papers should I bring?" -> {"unrelated": false}
CURRENT: "Where are you located?" -> {"unrelated": false}
CURRENT: "مين كسب الماتش امبارح؟" -> {"unrelated": true}
CURRENT: "What is the capital of Italy?" -> {"unrelated": true}
CURRENT: "اعمل مكرونة بشاميل ازاي" -> {"unrelated": true}`;

const GATE_SCHEMA = {
  type: 'object',
  properties: { unrelated: { type: 'boolean' } },
  required: ['unrelated'],
};

const GATE_TIMEOUT_MS = 30_000;

/** The previous message is labelled as context so a topic switch is judged on the current message alone. */
export function gateInput(current: string, previous?: string): string {
  return `${previous ? `PREVIOUS: "${previous}"\n` : ''}CURRENT: "${current}"`;
}

/**
 * A separate, tiny model call. A 3B model writing a whole answer often ignores
 * "refuse off-topic questions"; answering only true/false it is reliable.
 * It is asked "clearly unrelated?" so that greetings and people in need get through.
 */
export function createOllamaTopicGate({ url, model, fetchFn = fetch }: OllamaTopicGateConfig): TopicGate {
  return async (current, previous) => {
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
          { role: 'user', content: gateInput(current, previous) },
        ],
      }),
      signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = (await response.json()) as { message?: { content?: string } };
    const unrelated = (JSON.parse(data.message?.content ?? '') as Record<string, unknown>)['unrelated'];
    if (typeof unrelated !== 'boolean') throw new Error(`Unexpected topic check answer: ${data.message?.content}`);
    return !unrelated;
  };
}
