import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GapGroup } from '../gaps/gaps-api';
import { GapsPage } from './gaps-page';

const group: GapGroup = {
  key: 'عندكم فرع في اسكندريه',
  question: 'عندكم فرع في إسكندرية؟',
  count: 3,
  lastAskedAt: '2026-10-09T10:00:00.000Z',
  lastReply: 'معنديش المعلومة دي.',
};

describe('GapsPage', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [GapsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(GapsPage);
    const http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    return { fixture, http, element: fixture.nativeElement as HTMLElement };
  }

  it('loads unanswered questions by default and shows how often they were asked', async () => {
    const { fixture, http, element } = await setup();
    http.expectOne((r) => r.url === '/api/gaps' && r.params.get('reason') === 'no_answer').flush([group]);
    await fixture.whenStable();
    expect(element.textContent).toContain('عندكم فرع في إسكندرية؟');
    expect(element.querySelector('.gap__count')?.textContent?.trim()).toBe('×3');
    expect(element.querySelector('details')?.textContent).toContain('معنديش المعلومة دي.');
  });

  it('switches to the off-topic tab', async () => {
    const { fixture, http, element } = await setup();
    http.expectOne((r) => r.url === '/api/gaps').flush([]);
    const tab = [...element.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((b) => b.textContent?.includes('برّه الجمعية'))!;
    tab.click();
    await fixture.whenStable();
    http.expectOne((r) => r.url === '/api/gaps' && r.params.get('reason') === 'off_topic').flush([]);
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('marks a question as handled and removes it from the list', async () => {
    const { fixture, http, element } = await setup();
    http.expectOne((r) => r.url === '/api/gaps').flush([group]);
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('.gap__resolve')!.click();
    const req = http.expectOne({ method: 'POST', url: '/api/gaps/resolve' });
    expect(req.request.body).toEqual({ reason: 'no_answer', key: group.key });
    req.flush({ resolved: 3 });
    await fixture.whenStable();
    expect(element.querySelector('.gap')).toBeNull();
    expect(element.textContent).toContain('مفيش أسئلة مفتوحة');
  });

  it('ignores a slow answer for the tab the staff member already left', async () => {
    const { fixture, http, element } = await setup();
    http.expectOne((r) => r.url === '/api/gaps').flush([]);
    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[role=tab]')];

    tabs[1].click();
    const offTopic = http.expectOne((r) => r.params.get('reason') === 'off_topic');
    tabs[0].click();
    const noAnswer = http.expectOne((r) => r.params.get('reason') === 'no_answer');

    expect(offTopic.cancelled).toBe(true);
    noAnswer.flush([group]);
    await fixture.whenStable();
    expect(element.querySelectorAll('.gap')).toHaveLength(1);
    expect(element.textContent).toContain(group.question);
  });

  it('keeps a question on the list when the server resolved nothing', async () => {
    const { fixture, http, element } = await setup();
    http.expectOne((r) => r.url === '/api/gaps').flush([group]);
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('.gap__resolve')!.click();
    http.expectOne({ method: 'POST', url: '/api/gaps/resolve' }).flush({ resolved: 0 });
    // Nothing changed on the server, so the list is reloaded rather than trusted.
    http.expectOne((r) => r.method === 'GET' && r.url === '/api/gaps').flush([group]);
    await fixture.whenStable();
    expect(element.querySelector('.gap')).not.toBeNull();
  });

  describe('answering', () => {
    async function openForm() {
      const ctx = await setup();
      ctx.http.expectOne((r) => r.url === '/api/gaps').flush([group]);
      await ctx.fixture.whenStable();
      ctx.element.querySelector<HTMLButtonElement>('.gap__answer-toggle')!.click();
      await ctx.fixture.whenStable();
      return ctx;
    }

    async function type(ctx: Awaited<ReturnType<typeof openForm>>, selector: string, value: string) {
      const input = ctx.element.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await ctx.fixture.whenStable();
    }

    it('opens a form with the customer question as the title', async () => {
      const { element } = await openForm();
      expect(element.querySelector<HTMLInputElement>('.answer-form input')!.value).toBe(group.question);
    });

    it('saves the answer, removes the question and says the chat now uses it', async () => {
      const ctx = await openForm();
      await type(ctx, '.answer-form textarea', 'أيوه، عندنا فرع في إسكندرية في سموحة.');
      ctx.element.querySelector<HTMLButtonElement>('.answer-form button[type=submit]')!.click();
      const req = ctx.http.expectOne({ method: 'POST', url: '/api/gaps/answer' });
      expect(req.request.body).toEqual({
        reason: 'no_answer',
        key: group.key,
        title: group.question,
        answer: 'أيوه، عندنا فرع في إسكندرية في سموحة.',
      });
      req.flush({ resolved: 3 });
      await ctx.fixture.whenStable();
      expect(ctx.element.querySelector('.gap')).toBeNull();
      expect(ctx.element.querySelector('[role=status]')?.textContent).toContain('الشات هيستخدمها من دلوقتي');
    });

    it('explains when the answer was saved but the index could not be refreshed', async () => {
      const ctx = await openForm();
      await type(ctx, '.answer-form textarea', 'أيوه، عندنا فرع في إسكندرية.');
      ctx.element.querySelector<HTMLButtonElement>('.answer-form button[type=submit]')!.click();
      ctx.http.expectOne({ method: 'POST', url: '/api/gaps/answer' }).flush({}, { status: 503, statusText: 'Unavailable' });
      await ctx.fixture.whenStable();
      expect(ctx.element.querySelector('[role=alert]')?.textContent).toContain('اتحفظت');
      expect(ctx.element.querySelector('.gap')).not.toBeNull();
    });

    it('keeps the save button disabled until the answer is long enough', async () => {
      const ctx = await openForm();
      const save = ctx.element.querySelector<HTMLButtonElement>('.answer-form button[type=submit]')!;
      expect(save.disabled).toBe(true);
      await type(ctx, '.answer-form textarea', 'أيوه، فيه.');
      expect(save.disabled).toBe(false);
    });

    it('also offers answers for questions refused as off-topic', async () => {
      const ctx = await setup();
      ctx.http.expectOne((r) => r.url === '/api/gaps').flush([]);
      ctx.element.querySelectorAll<HTMLButtonElement>('[role=tab]')[1].click();
      await ctx.fixture.whenStable();
      ctx.http.expectOne((r) => r.params.get('reason') === 'off_topic').flush([group]);
      await ctx.fixture.whenStable();
      expect(ctx.element.querySelector('.gap__answer-toggle')).not.toBeNull();
    });

    it('clears the saved notice when switching tabs', async () => {
      const ctx = await openForm();
      await type(ctx, '.answer-form textarea', 'أيوه، عندنا فرع في إسكندرية.');
      ctx.element.querySelector<HTMLButtonElement>('.answer-form button[type=submit]')!.click();
      ctx.http.expectOne({ method: 'POST', url: '/api/gaps/answer' }).flush({ resolved: 1 });
      await ctx.fixture.whenStable();
      ctx.element.querySelectorAll<HTMLButtonElement>('[role=tab]')[1].click();
      await ctx.fixture.whenStable();
      ctx.http.expectOne((r) => r.params.get('reason') === 'off_topic').flush([]);
      await ctx.fixture.whenStable();
      expect(ctx.element.querySelector('[role=status]')).toBeNull();
    });
  });
});
