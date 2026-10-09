import { Router } from 'express';
import { ChatDeps, startChatStream, validateChatRequest } from './chat-handler';

export function createChatRouter(deps: ChatDeps): Router {
  const router = Router();

  router.post('/chat', async (req, res) => {
    const parsed = validateChatRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    // Stop generating as soon as the browser disconnects (closed tab or Stop button).
    const controller = new AbortController();
    res.on('close', () => controller.abort());

    const start = await startChatStream(deps, parsed.messages, controller.signal);
    if (!start.ok) {
      if (controller.signal.aborted) return;
      console.error(
        '[chat] AI provider unavailable:',
        start.error instanceof Error ? start.error.message : start.error,
      );
      res.status(503).json({ error: 'AI service unavailable' });
      return;
    }

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.flushHeaders();
    for await (const chunk of start.events) {
      res.write(chunk);
    }
    res.end();
  });

  return router;
}
