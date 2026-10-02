import { SseParser } from './sse-parser';

describe('SseParser', () => {
  it('parses complete events', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"type":"token","text":"hi"}\n\ndata: {"type":"done"}\n\n')).toEqual([
      { type: 'token', text: 'hi' },
      { type: 'done' },
    ]);
  });

  it('waits for the rest of an event split across chunks', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"type":"tok')).toEqual([]);
    expect(parser.push('en","text":"أهلًا"}\n\n')).toEqual([{ type: 'token', text: 'أهلًا' }]);
  });

  it('ignores lines that are not data lines', () => {
    const parser = new SseParser();
    expect(parser.push(': keep-alive\n\ndata: {"type":"done"}\n\n')).toEqual([{ type: 'done' }]);
  });
});
