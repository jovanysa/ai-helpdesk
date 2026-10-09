import { GapReason, UnansweredRepository } from './unanswered-questions';

/** What the chat calls to report questions it could not answer. Neither method ever throws. */
export interface GapRecorder {
  recordOffTopic(question: string, reply: string): void;
  recordNoAnswer(question: string, reply: string): void;
}

export class GapLog implements GapRecorder {
  constructor(private readonly questions: UnansweredRepository) {}

  recordOffTopic(question: string, reply: string): void {
    this.record(question, reply, 'off_topic');
  }

  recordNoAnswer(question: string, reply: string): void {
    this.record(question, reply, 'no_answer');
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
