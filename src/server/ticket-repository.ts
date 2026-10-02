import type { DatabaseSync } from 'node:sqlite';
import { Classification, NewTicket, Ticket, TicketFilters, TicketPatch, TicketSummary } from './ticket-types';

interface TicketRow {
  id: number;
  name: string;
  phone: string;
  description: string;
  source: Ticket['source'];
  transcript?: string | null;
  status: Ticket['status'];
  category: Ticket['category'];
  priority: Ticket['priority'];
  classification_status: Ticket['classificationStatus'];
  created_at: string;
  updated_at: string;
}

// The only columns that may be filtered or patched. Column names come from this
// fixed list, never from the request; values always go through `?` placeholders.
const EDITABLE_COLUMNS = ['status', 'category', 'priority'] as const;

const SUMMARY_COLUMNS =
  'id, name, phone, description, source, status, category, priority, classification_status, created_at, updated_at';

export class TicketRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(ticket: NewTicket): Ticket {
    const at = this.now().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO tickets (name, phone, description, source, transcript, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ticket.name,
        ticket.phone,
        ticket.description,
        ticket.transcript ? 'chat' : 'form',
        ticket.transcript ? JSON.stringify(ticket.transcript) : null,
        at,
        at,
      );
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): Ticket | undefined {
    const row = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as unknown as TicketRow | undefined;
    return row ? toTicket(row) : undefined;
  }

  /** Newest first, without transcripts. */
  list(filters: TicketFilters = {}): TicketSummary[] {
    const conditions: string[] = [];
    const params: string[] = [];
    for (const column of EDITABLE_COLUMNS) {
      const value = filters[column];
      if (value) {
        conditions.push(`${column} = ?`);
        params.push(value);
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT ${SUMMARY_COLUMNS} FROM tickets ${where} ORDER BY id DESC`)
      .all(...params) as unknown as TicketRow[];
    return rows.map(toSummary);
  }

  /** A staff change of category or priority counts as a finished classification. */
  update(id: number, patch: TicketPatch): Ticket | undefined {
    const assignments: string[] = [];
    const params: string[] = [];
    for (const column of EDITABLE_COLUMNS) {
      const value = patch[column];
      if (value !== undefined) {
        assignments.push(`${column} = ?`);
        params.push(value);
      }
    }
    if (patch.category !== undefined || patch.priority !== undefined) {
      assignments.push("classification_status = 'done'");
    }
    assignments.push('updated_at = ?');
    params.push(this.now().toISOString());

    this.db.prepare(`UPDATE tickets SET ${assignments.join(', ')} WHERE id = ?`).run(...params, id);
    return this.get(id);
  }

  markClassificationPending(id: number): void {
    this.db
      .prepare("UPDATE tickets SET classification_status = 'pending', updated_at = ? WHERE id = ?")
      .run(this.now().toISOString(), id);
  }

  /** Only applies while still pending, so it never overwrites a staff member's choice. */
  applyClassification(id: number, { category, priority }: Classification): void {
    this.db
      .prepare(
        `UPDATE tickets SET category = ?, priority = ?, classification_status = 'done', updated_at = ?
         WHERE id = ? AND classification_status = 'pending'`,
      )
      .run(category, priority, this.now().toISOString(), id);
  }

  markClassificationFailed(id: number): void {
    this.db
      .prepare(
        `UPDATE tickets SET classification_status = 'failed', updated_at = ?
         WHERE id = ? AND classification_status = 'pending'`,
      )
      .run(this.now().toISOString(), id);
  }
}

function toSummary(row: TicketRow): TicketSummary {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    description: row.description,
    source: row.source,
    status: row.status,
    category: row.category,
    priority: row.priority,
    classificationStatus: row.classification_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTicket(row: TicketRow): Ticket {
  return { ...toSummary(row), transcript: row.transcript ? JSON.parse(row.transcript) : null };
}
