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
    element.querySelector<HTMLButtonElement>('.gap button')!.click();
    const req = http.expectOne({ method: 'POST', url: '/api/gaps/resolve' });
    expect(req.request.body).toEqual({ reason: 'no_answer', key: group.key });
    req.flush({ resolved: 3 });
    await fixture.whenStable();
    expect(element.querySelector('.gap')).toBeNull();
    expect(element.textContent).toContain('مفيش أسئلة مفتوحة');
  });
});
