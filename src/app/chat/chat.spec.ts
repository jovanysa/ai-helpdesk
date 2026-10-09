import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Chat } from './chat';
import { ChatService } from './chat.service';
import { ChatMessage } from './message.model';

describe('Chat', () => {
  async function setup(state: { messages?: ChatMessage[]; isStreaming?: boolean; error?: string | null } = {}) {
    const fake = {
      messages: signal(state.messages ?? []),
      isStreaming: signal(state.isStreaming ?? false),
      error: signal(state.error ?? null),
      send: vi.fn(),
      stop: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [Chat],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ChatService, useValue: fake },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Chat);
    await fixture.whenStable();
    return { fake, fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('shows the three suggestions when the chat is empty and sends the clicked one', async () => {
    const { fake, element } = await setup();

    const buttons = element.querySelectorAll<HTMLButtonElement>('.suggestion');
    expect([...buttons].map((b) => b.textContent?.trim())).toEqual(['أتبرع إزاي؟', 'عايز أتطوع', 'محتاج مساعدة']);

    buttons[0].click();
    expect(fake.send).toHaveBeenCalledWith('أتبرع إزاي؟');
  });

  it('hides the suggestions and renders messages once the chat has started', async () => {
    const { element } = await setup({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'أهلًا' },
      ],
    });

    expect(element.querySelector('.suggestion')).toBeNull();
    const bubbles = element.querySelectorAll('.message');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].getAttribute('dir')).toBe('auto');
  });

  it('shows Stop instead of Send while streaming and stops on click', async () => {
    const { fake, element } = await setup({
      messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '' }],
      isStreaming: true,
    });

    const stop = element.querySelector<HTMLButtonElement>('.btn--stop');
    expect(stop).not.toBeNull();
    expect(element.querySelector('button[type=submit]')).toBeNull();
    stop!.click();
    expect(fake.stop).toHaveBeenCalled();
  });

  it('shows the error message', async () => {
    const { element } = await setup({ error: 'خدمة المساعد غير متاحة حاليًا، حاول تاني.' });

    expect(element.querySelector('[role=alert]')?.textContent).toContain('غير متاحة');
  });

  it('shows the escalate button only after an assistant reply and not while streaming', async () => {
    const empty = await setup();
    expect(empty.element.querySelector('.chat__escalate')).toBeNull();
    TestBed.resetTestingModule();

    const answered = await setup({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'أهلًا' }] });
    expect(answered.element.querySelector('.chat__escalate')?.textContent).toContain('حوّل لموظف');

    answered.fake.isStreaming.set(true);
    await answered.fixture.whenStable();
    expect(answered.element.querySelector('.chat__escalate')).toBeNull();
  });

  it('opens the escalation form when the button is clicked', async () => {
    const { fixture, element } = await setup({
      messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'أهلًا' }],
    });
    element.querySelector<HTMLButtonElement>('.chat__escalate button')!.click();
    await fixture.whenStable();
    expect(element.querySelector('app-escalation-form')).not.toBeNull();
    expect(element.querySelector('.chat__escalate')).toBeNull();
  });

  it('links to the support form', async () => {
    const { element } = await setup();
    expect(element.querySelector('a[href="/support/new"]')?.textContent).toContain('قدّم طلب');
  });

  it('shows which knowledge was read under an assistant reply', async () => {
    const { element } = await setup({
      messages: [
        { role: 'user', content: 'ازاي اتبرع؟' },
        {
          role: 'assistant',
          content: 'بفودافون كاش',
          sources: [
            { title: 'طرق التبرع', file: 'donations.md' },
            { title: 'إيصال التبرع', file: 'donations.md' },
          ],
        },
      ],
    });
    const lines = element.querySelectorAll('.message__sources');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent?.trim()).toBe('اتقرا من: طرق التبرع، إيصال التبرع');
  });

  it('shows the ticket number instead of the escalate button once a ticket was created', async () => {
    const { fixture, element } = await setup({
      messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'أهلًا' }],
    });
    element.querySelector<HTMLButtonElement>('.chat__escalate button')!.click();
    await fixture.whenStable();
    const form = fixture.debugElement.query((el) => el.name === 'app-escalation-form');
    form.componentInstance.created.emit(12);
    await fixture.whenStable();
    expect(element.querySelector('.chat__escalate button')).toBeNull();
    expect(element.querySelector('app-escalation-form')).toBeNull();
    expect(element.querySelector('[role=status]')?.textContent).toContain('طلبك رقم #12');
  });

  it('tells screen readers when a reply is being written and hides the cursor from them', async () => {
    const { element } = await setup({
      messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'أه' }],
      isStreaming: true,
    });
    expect(element.querySelector('.chat__messages')?.getAttribute('aria-busy')).toBe('true');
    expect(element.querySelector('.cursor')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows only the first language of bilingual section titles', async () => {
    const { element } = await setup({
      messages: [
        { role: 'user', content: 'ازاي اتبرع؟' },
        { role: 'assistant', content: 'بفودافون كاش', sources: [{ title: 'طرق التبرع / How to donate', file: 'donations.md' }] },
      ],
    });
    expect(element.querySelector('.message__sources')?.textContent?.trim()).toBe('اتقرا من: طرق التبرع');
  });

  describe('auto-scroll', () => {
    /** jsdom has no layout, so give the message list fake sizes. */
    function fakeLayout(list: HTMLElement) {
      const box = { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 };
      Object.defineProperty(list, 'scrollHeight', { get: () => box.scrollHeight });
      Object.defineProperty(list, 'clientHeight', { get: () => box.clientHeight });
      Object.defineProperty(list, 'scrollTop', { get: () => box.scrollTop, set: (v: number) => (box.scrollTop = v) });
      return box;
    }

    it('keeps following a streaming reply, however long it grows', async () => {
      const { fake, fixture, element } = await setup({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '' }], isStreaming: true });
      const box = fakeLayout(element.querySelector<HTMLElement>('.chat__messages')!);
      for (let i = 1; i <= 5; i++) {
        box.scrollHeight += 300; // each token batch grows the list by more than the 120px margin
        fake.messages.set([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'كلام '.repeat(i * 20) }]);
        await fixture.whenStable();
        expect(box.scrollTop).toBe(box.scrollHeight);
      }
    });

    it('leaves the reader alone after they scroll up', async () => {
      const { fake, fixture, element } = await setup({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'a' }], isStreaming: true });
      const list = element.querySelector<HTMLElement>('.chat__messages')!;
      const box = fakeLayout(list);
      box.scrollTop = 100;
      list.dispatchEvent(new Event('scroll'));
      box.scrollHeight += 300;
      fake.messages.set([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'a b c' }]);
      await fixture.whenStable();
      expect(box.scrollTop).toBe(100);
    });
  });
});

