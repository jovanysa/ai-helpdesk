import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, OllamaProvider } from './server/ai-provider';
import { createChatRouter } from './server/chat-route';
import { apiErrorHandler, createApiRouter } from './server/api-router';
import { openDatabase } from './server/db';
import { DEFAULT_EMBED_MODEL, createOllamaEmbedder } from './server/embedder';
import { KnowledgeBase } from './server/knowledge-base';
import { loadKnowledgeDir } from './server/knowledge-chunks';
import { SessionStore } from './server/sessions';
import { StaffRepository } from './server/staff-repository';
import { TicketClassifier, createOllamaClassifier } from './server/ticket-classifier';
import { TicketRepository } from './server/ticket-repository';
import { createOllamaTopicGate } from './server/topic-gate';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

const ollamaConfig = {
  url: process.env['OLLAMA_URL'] ?? DEFAULT_OLLAMA_URL,
  model: process.env['OLLAMA_MODEL'] ?? DEFAULT_OLLAMA_MODEL,
};

const db = openDatabase(process.env['DB_PATH'] ?? join(process.cwd(), 'data', 'helpdesk.db'));
const staff = new StaffRepository(db);
const sessions = new SessionStore(db);
const tickets = new TicketRepository(db);
const classifier = new TicketClassifier(tickets, createOllamaClassifier(ollamaConfig));

// RAG: the chat answers from the markdown files in knowledge/, searched by meaning.
const embedModel = process.env['OLLAMA_EMBED_MODEL'] ?? DEFAULT_EMBED_MODEL;
const knowledgeDir = process.env['KNOWLEDGE_DIR'] ?? join(process.cwd(), 'knowledge');
const knowledge = new KnowledgeBase(
  db,
  createOllamaEmbedder({ url: ollamaConfig.url, model: embedModel }),
  () => loadKnowledgeDir(knowledgeDir),
  embedModel,
);

// The first staff account comes from the environment; an existing one is left unchanged.
const staffEmail = process.env['STAFF_EMAIL'];
const staffPassword = process.env['STAFF_PASSWORD'];
if (staffEmail && staffPassword) {
  staff.ensure(staffEmail, process.env['STAFF_NAME'] ?? 'Staff', staffPassword);
}

/**
 * API: chat streaming (Server-Sent Events), tickets and staff login.
 */
app.use(
  '/api',
  express.json(),
  createChatRouter(new OllamaProvider(ollamaConfig), knowledge, createOllamaTopicGate(ollamaConfig)),
  createApiRouter({ staff, sessions, tickets, classifier }),
  apiErrorHandler,
);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
