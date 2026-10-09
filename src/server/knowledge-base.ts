import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { EmbedFn } from './embedder';
import { KnowledgeChunk } from './knowledge-chunks';
import { cosine, fromBlob, toBlob } from './vectors';

export interface KnowledgeSource {
  file: string;
  title: string;
  content: string;
  score: number;
}

export type KnowledgeSearch = Pick<KnowledgeBase, 'search'>;

interface ChunkRow {
  file: string;
  title: string;
  content: string;
  content_hash: string;
  embedding: Uint8Array;
}

interface CachedChunk {
  file: string;
  title: string;
  content: string;
  vector: Float32Array;
}

export class KnowledgeBase {
  private indexing: Promise<void> | null = null;
  /** Decoded vectors, filled after indexing so a search does not re-read and re-decode the table. */
  private cache: CachedChunk[] | null = null;

  constructor(
    private readonly db: DatabaseSync,
    private readonly embed: EmbedFn,
    private readonly loadChunks: () => KnowledgeChunk[],
    private readonly model: string,
  ) {}

  /** The k chunks whose meaning is closest to the query, best first. */
  async search(query: string, k = 3): Promise<KnowledgeSource[]> {
    await this.ensureIndexed();
    const chunks = this.loadCache();
    if (chunks.length === 0) return [];

    const [queryVector] = await this.embed([query]);
    return chunks
      .map(({ file, title, content, vector }) => ({ file, title, content, score: cosine(queryVector, vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /** Re-reads the knowledge files now (only new or changed sections are embedded). */
  async refresh(): Promise<void> {
    this.indexing = null;
    await this.ensureIndexed();
  }

  /** Builds the index and loads the embedding model at startup, so the first customer does not wait. */
  async warmUp(): Promise<void> {
    try {
      await this.ensureIndexed();
      await this.embed(['warm up']);
    } catch (error) {
      console.warn('[knowledge] warm-up failed:', error instanceof Error ? error.message : error);
    }
  }

  private loadCache(): CachedChunk[] {
    this.cache ??= (
      this.db.prepare('SELECT file, title, content, embedding FROM knowledge_chunks').all() as unknown as ChunkRow[]
    ).map((row) => ({ file: row.file, title: row.title, content: row.content, vector: fromBlob(row.embedding) }));
    return this.cache;
  }

  /** Embeds only new or changed chunks and deletes chunks that no longer exist in the files. */
  async reindex(): Promise<void> {
    const chunks = this.uniqueChunks();
    const existing = new Set(
      this.db
        .prepare('SELECT content_hash FROM knowledge_chunks')
        .all()
        .map((row) => row['content_hash'] as string),
    );
    const fresh = chunks.filter((chunk) => !existing.has(chunk.hash));
    const vectors = fresh.length > 0 ? await this.embed(fresh.map(embeddingText)) : [];

    const keep = new Set(chunks.map((chunk) => chunk.hash));
    const insert = this.db.prepare(
      // OR IGNORE: two overlapping refreshes may both embed the same new section.
      'INSERT OR IGNORE INTO knowledge_chunks (file, title, content, content_hash, embedding) VALUES (?, ?, ?, ?, ?)',
    );
    const remove = this.db.prepare('DELETE FROM knowledge_chunks WHERE content_hash = ?');

    this.db.exec('BEGIN');
    try {
      for (const hash of existing) if (!keep.has(hash)) remove.run(hash);
      fresh.forEach((chunk, i) => insert.run(chunk.file, chunk.title, chunk.content, chunk.hash, toBlob(vectors[i])));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.cache = null;
    console.log(`[knowledge] indexed ${chunks.length} chunks (${fresh.length} new)`);
  }

  /** A section pasted twice would break the UNIQUE hash; keep the first one and warn. */
  private uniqueChunks(): (KnowledgeChunk & { hash: string })[] {
    const seen = new Set<string>();
    const chunks: (KnowledgeChunk & { hash: string })[] = [];
    for (const chunk of this.loadChunks()) {
      const hash = this.hash(chunk);
      if (seen.has(hash)) {
        console.warn(`[knowledge] duplicate section "${chunk.title}" in ${chunk.file}; skipped`);
        continue;
      }
      seen.add(hash);
      chunks.push({ ...chunk, hash });
    }
    return chunks;
  }

  /** Indexes once; if that fails, the next search tries again (e.g. after `ollama pull`). */
  private ensureIndexed(): Promise<void> {
    if (!this.indexing) {
      const run: Promise<void> = this.reindex().catch((error: unknown) => {
        // Only forget this run if a newer refresh has not replaced it already.
        if (this.indexing === run) this.indexing = null;
        throw error;
      });
      this.indexing = run;
    }
    return this.indexing;
  }

  // The model is part of the hash: vectors from different models cannot be compared.
  private hash(chunk: KnowledgeChunk): string {
    return createHash('sha256').update(`${this.model}\n${embeddingText(chunk)}`).digest('hex');
  }
}

function embeddingText(chunk: KnowledgeChunk): string {
  return `${chunk.title}\n${chunk.content}`;
}
