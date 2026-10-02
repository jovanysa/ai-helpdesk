import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatService } from './chat.service';
import { EscalationForm } from './escalation-form';
import { ChatMessage } from './message.model';

describe('EscalationForm', () => {
  async function setup(messages: ChatMessage[]) {
    await TestBed.configureTestingModule({
      imports: [EscalationForm],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ChatService, useValue: { messages: signal(messages) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EscalationForm);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const type = async (selector: string, value: string) => {
      const input = element.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    await type('[formControlName=name]', 'منى');
    await type('[formControlName=phone]', '01001234567');
    return { fixture, element, type, http: TestBed.inject(HttpTestingController) };
  }

  const conversation: ChatMessage[] = [
    { role: 'user', content: 'عايزة أعرف مواعيد الكشف الطبي' },
    { role: 'assistant', content: 'مش عارف المعلومة دي' },
    { role: 'assistant', content: '  ' },
  ];

  it('sends the chat transcript with the note as description', async () => {
    const { fixture, element, type, http } = await setup(conversation);
    await type('[formControlName=note]', 'محتاجة حد يكلمني النهارده');
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();

    const req = http.expectOne('/api/tickets');
    expect(req.request.body).toEqual({
      name: 'منى',
      phone: '01001234567',
      description: 'محتاجة حد يكلمني النهارده',
      transcript: conversation.slice(0, 2),
    });
    req.flush({ id: 4 });
    await fixture.whenStable();
    expect(element.textContent).toContain('تم تسجيل طلبك رقم #4');
  });

  it('uses the last user message when there is no note', async () => {
    const { element, http } = await setup(conversation);
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    expect(http.expectOne('/api/tickets').request.body.description).toBe('عايزة أعرف مواعيد الكشف الطبي');
  });

  it('falls back to a default text when the last message is too short', async () => {
    const { element, http } = await setup([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'أهلًا' },
    ]);
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    expect(http.expectOne('/api/tickets').request.body.description).toBe('طلب تواصل مع موظف من الشات');
  });

  it('emits closed when cancelled', async () => {
    const { fixture, element } = await setup(conversation);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    element.querySelector<HTMLButtonElement>('.btn--secondary')!.click();
    expect(closed).toHaveBeenCalled();
  });

  it('does not send sources in the transcript', async () => {
    const { element, http } = await setup([
      { role: 'user', content: 'عايزة أعرف مواعيد الكشف الطبي' },
      { role: 'assistant', content: 'معنديش المعلومة دي', sources: [{ title: 'المواعيد', file: 'about.md' }] },
    ]);
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    const { transcript } = http.expectOne('/api/tickets').request.body;
    for (const message of transcript) expect(Object.keys(message).sort()).toEqual(['content', 'role']);
  });
});
