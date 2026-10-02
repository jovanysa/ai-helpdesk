import { TicketRepository } from './ticket-repository';
import {
  Classification,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TranscriptMessage,
  isOneOf,
} from './ticket-types';

export type ClassifyFn = (description: string, transcript: TranscriptMessage[] | null) => Promise<Classification>;

export interface OllamaClassifierConfig {
  url: string;
  model: string;
  fetchFn?: typeof fetch;
}

export const CLASSIFIER_PROMPT = `You classify support tickets for "Al-Khair Foundation", a charity in Cairo. Tickets may be in Arabic or English.

category:
- donation: giving money or goods, donation receipts
- volunteering: wanting to volunteer
- help_request: asking the charity for help (money, food, medical bills, school supplies)
- complaint: unhappy with staff, service or a past experience
- other: anything else

priority:
- high: urgent need (health, food, safety) or a very upset person
- medium: complaints and normal help requests
- low: general questions

Examples:
"ازاي اتبرع بفودافون كاش؟" -> {"category":"donation","priority":"low"}
"الموظف كان قليل الذوق معايا في المقر" -> {"category":"complaint","priority":"medium"}
"ابني تعبان ومحتاجين فلوس للعملية النهارده" -> {"category":"help_request","priority":"high"}
"I want to teach kids on weekends" -> {"category":"volunteering","priority":"low"}

Reply with JSON only.`;

// Ollama constrains the model's output to this JSON schema.
const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: [...TICKET_CATEGORIES] },
    priority: { type: 'string', enum: [...TICKET_PRIORITIES] },
  },
  required: ['category', 'priority'],
};

const CLASSIFY_TIMEOUT_MS = 60_000;

export function createOllamaClassifier({ url, model, fetchFn = fetch }: OllamaClassifierConfig): ClassifyFn {
  return async (description, transcript) => {
    const response = await fetchFn(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: CLASSIFICATION_SCHEMA,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: CLASSIFIER_PROMPT },
          { role: 'user', content: ticketText(description, transcript) },
        ],
      }),
      signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = (await response.json()) as { message?: { content?: string } };
    return parseClassification(data.message?.content ?? '');
  };
}

/** Throws unless the text is JSON with an allowed category and priority. */
export function parseClassification(text: string): Classification {
  const value = JSON.parse(text) as Record<string, unknown>;
  const { category, priority } = value;
  if (!isOneOf(TICKET_CATEGORIES, category) || !isOneOf(TICKET_PRIORITIES, priority)) {
    throw new Error(`Unexpected classification: ${text}`);
  }
  return { category, priority };
}

/** Only the customer's own chat messages help classification; the AI's replies would add noise. */
function ticketText(description: string, transcript: TranscriptMessage[] | null): string {
  const customerLines = (transcript ?? []).filter((m) => m.role === 'user').map((m) => `- ${m.content}`);
  if (customerLines.length === 0) return description;
  return `${description}\n\nCustomer messages from the chat:\n${customerLines.join('\n')}`;
}

export class TicketClassifier {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly classify: ClassifyFn,
  ) {}

  /** Classifies a ticket without the caller waiting for the model. Never rejects. */
  async classifyInBackground(id: number): Promise<void> {
    const ticket = this.tickets.get(id);
    if (!ticket) return;
    try {
      const result = await this.classify(ticket.description, ticket.transcript);
      this.tickets.applyClassification(id, result);
    } catch (error) {
      console.error(`[tickets] classification of #${id} failed:`, error instanceof Error ? error.message : error);
      this.tickets.markClassificationFailed(id);
    }
  }
}
