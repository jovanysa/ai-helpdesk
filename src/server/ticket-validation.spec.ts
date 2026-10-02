import { normalizePhone, parseFilters, parseTicketId, validateNewTicket, validateTicketPatch } from './ticket-validation';

const valid = { name: ' منى ', phone: '010 0123 4567', description: '  محتاجة مساعدة  ' };

describe('ticket validation', () => {
  it('accepts and trims a valid form ticket', () => {
    expect(validateNewTicket(valid)).toEqual({
      ok: true,
      value: { name: 'منى', phone: '01001234567', description: 'محتاجة مساعدة', transcript: null },
    });
  });

  it('accepts a chat transcript and strips unknown fields', () => {
    const result = validateNewTicket({ ...valid, transcript: [{ role: 'user', content: 'hi', extra: 1 }] });
    expect(result).toMatchObject({ ok: true, value: { transcript: [{ role: 'user', content: 'hi' }] } });
  });

  it('converts Arabic-Indic and Persian digits in the phone', () => {
    expect(normalizePhone('٠١٠٠١٢٣٤٥٦٧')).toBe('01001234567');
    expect(normalizePhone('+۲۰ ۱۰۰ ۱۲۳ ۴۵۶۷')).toBe('+201001234567');
  });

  it.each([
    ['a one-letter name', { ...valid, name: 'م' }],
    ['a phone of spaces', { ...valid, phone: '          ' }],
    ['a phone with letters', { ...valid, phone: '0100abc4567' }],
    ['a too-short description', { ...valid, description: 'hi' }],
    ['a description over 2000 chars', { ...valid, description: 'a'.repeat(2001) }],
    ['an empty transcript', { ...valid, transcript: [] }],
    ['a transcript with a system message', { ...valid, transcript: [{ role: 'system', content: 'x' }] }],
    ['a transcript over 20 messages', { ...valid, transcript: Array.from({ length: 21 }, () => ({ role: 'user', content: 'x' })) }],
    ['a missing body', undefined],
  ])('rejects %s', (_label, body) => {
    expect(validateNewTicket(body).ok).toBe(false);
  });

  it('validates patches', () => {
    expect(validateTicketPatch({ status: 'resolved' })).toEqual({ ok: true, value: { status: 'resolved' } });
    expect(validateTicketPatch({ category: 'donation', priority: 'high' })).toEqual({
      ok: true,
      value: { category: 'donation', priority: 'high' },
    });
    expect(validateTicketPatch({}).ok).toBe(false);
    expect(validateTicketPatch({ status: 'closed' }).ok).toBe(false);
  });

  it('parses filters and ids', () => {
    expect(parseFilters({ status: 'new', category: 'nope', priority: 'high' })).toEqual({ status: 'new', priority: 'high' });
    expect(parseTicketId('12')).toBe(12);
    expect(parseTicketId('1.5')).toBeUndefined();
    expect(parseTicketId('-3')).toBeUndefined();
    expect(parseTicketId('abc')).toBeUndefined();
  });
});
