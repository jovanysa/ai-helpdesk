import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
      providers: [{ provide: ChatService, useValue: fake }],
    }).compileComponents();
    const fixture = TestBed.createComponent(Chat);
    await fixture.whenStable();
    return { fake, element: fixture.nativeElement as HTMLElement };
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
});
