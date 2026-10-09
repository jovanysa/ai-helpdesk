import { GapReason, UnansweredRepository } from './unanswered-questions';

/** True when the reply says the asked-for information is not available. */
export type AnswerCheck = (question: string, reply: string) => Promise<boolean>;

/** What the chat calls to report questions it could not answer. Neither method ever throws. */
export interface GapRecorder {
  recordOffTopic(question: string, reply: string): void;
  reviewReply(question: string, reply: string): Promise<void>;
}

export interface OllamaAnswerCheckConfig {
  url: string;
  model: string;
  fetchFn?: typeof fetch;
}

export const ANSWER_CHECK_PROMPT = `You review replies of a charity's support chat.
Decide whether the REPLY says that the information the customer asked for is not available (for example "I don't have that information", "معنديش المعلومة دي", "call us to ask"), instead of answering it.
A reply that answers, even with "no" (for example "No, we are closed on Friday" or "لأ، الجمعية مبتدفعش إيجار"), is answered.
A greeting reply to a greeting is answered.

Examples:
QUESTION: "عندكم فرع في اسكندرية؟" REPLY: "معنديش المعلومة دي، كلمنا على 0100 000 0000." -> {"missing_information": true}
QUESTION: "انتو فاتحين يوم الجمعة؟" REPLY: "الجمعة مقفول." -> {"missing_information": false}`;

const CHECK_SCHEMA = {
  type: 'object',
  properties: { missing_information: { type: 'boolean' } },
  required: ['missing_information'],
};

const CHECK_TIMEOUT_MS = 30_000;

/**
 * The reply is free text, so code cannot spot "I don't know" reliably.
 * A tiny JSON yes/no call can (28/28 in the spike).
 */
export function createOllamaAnswerCheck({ url, model, fetchFn = fetch }: OllamaAnswerCheckConfig): AnswerCheck {
  return async (question, reply) => {
    const response = await fetchFn(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: CHECK_SCHEMA,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: ANSWER_CHECK_PROMPT },
          { role: 'user', content: `QUESTION: "${question}"\nREPLY: "${reply}"` },
        ],
      }),
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = (await response.json()) as { message?: { content?: string } };
    const missing = (JSON.parse(data.message?.content ?? '') as Record<string, unknown>)['missing_information'];
    if (typeof missing !== 'boolean') throw new Error(`Unexpected answer check: ${data.message?.content}`);
    return missing;
  };
}

export class GapLog implements GapRecorder {
  constructor(
    private readonly questions: UnansweredRepository,
    private readonly isMissingInformation: AnswerCheck,
  ) {}

  recordOffTopic(question: string, reply: string): void {
    this.record(question, reply, 'off_topic');
  }

  async reviewReply(question: string, reply: string): Promise<void> {
    let missing: boolean;
    try {
      missing = await this.isMissingInformation(question, reply);
    } catch (error) {
      console.error('[gaps] answer check failed:', error instanceof Error ? error.message : error);
      return;
    }
    if (missing) this.record(question, reply, 'no_answer');
  }

  // Recording is a side job: a failure here must never reach the customer's chat.
  private record(question: string, reply: string, reason: GapReason): void {
    try {
      this.questions.record(question, reply, reason);
    } catch (error) {
      console.error('[gaps] could not record question:', error instanceof Error ? error.message : error);
    }
  }
}
