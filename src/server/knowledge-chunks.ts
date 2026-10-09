import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface KnowledgeChunk {
  file: string;
  title: string;
  content: string;
}

/**
 * Every `## Heading` starts a chunk; anything before the first one (e.g. `# File title`) is
 * ignored, and so is a `## ` line inside a ``` code block.
 */
export function parseKnowledgeFile(file: string, markdown: string): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  let current: { title: string; lines: string[] } | null = null;
  const flush = () => {
    if (current) chunks.push({ file, title: current.title, content: current.lines.join('\n').trim() });
  };

  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    // Inside a ``` code block, "## " is example text, not a new section.
    if (/^\s*```/.test(line)) inFence = !inFence;
    const heading = inFence ? null : /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      current = { title: heading[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return chunks;
}

export function loadKnowledgeDir(dir: string): KnowledgeChunk[] {
  if (!existsSync(dir)) {
    console.warn(`[knowledge] folder not found: ${dir}`);
    return [];
  }
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort();
  return files.flatMap((file) => {
    const chunks = parseKnowledgeFile(file, readFileSync(join(dir, file), 'utf8'));
    if (chunks.length === 0) console.warn(`[knowledge] ${file} has no "## " sections; skipped`);
    return chunks;
  });
}
