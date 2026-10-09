import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { TicketSummary } from '../tickets/ticket.model';
import { TicketList } from './ticket-list';

const ticket: TicketSummary = {
  id: 1,
  name: 'منى',
  phone: '01001234567',
  description: 'الموظف كان قليل الذوق',
  source: 'form',
  status: 'new',
  category: 'complaint',
  priority: 'high',
  classificationStatus: 'done',
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
};

describe('TicketList', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [TicketList],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user: signal({ id: 1, email: 'a@x.example', name: 'مدير' }), logout: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TicketList);
    const http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    return { fixture, http, element: fixture.nativeElement as HTMLElement };
  }

  it('loads tickets and shows their Arabic labels', async () => {
    const { fixture, http, element } = await setup();
    http.expectOne('/api/tickets').flush([ticket]);
    await fixture.whenStable();
    const text = element.textContent ?? '';
    for (const expected of ['#1', 'منى', 'شكوى', 'عالية', 'جديدة']) expect(text).toContain(expected);
    expect(element.querySelector('a[href="/staff/tickets/1"]')).not.toBeNull();
  });

  it('reloads with the chosen filter', async () => {
    const { fixture, http, element } = await setup();
    http.expectOne('/api/tickets').flush([ticket]);
    const select = element.querySelector<HTMLSelectElement>('select[data-filter=status]')!;
    select.value = 'resolved';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === '/api/tickets' && r.params.get('status') === 'resolved');
    req.flush([]);
    await fixture.whenStable();
    expect(element.textContent).toContain('مفيش تذاكر');
  });

  it('shows the classification state when not done', async () => {
    const { fixture, http, element } = await setup();
    http.expectOne('/api/tickets').flush([
      { ...ticket, classificationStatus: 'failed', category: null, priority: null },
      { ...ticket, id: 2, classificationStatus: 'pending', category: null, priority: null },
    ]);
    await fixture.whenStable();
    expect(element.textContent).toContain('فشل التصنيف');
    expect(element.textContent).toContain('جاري التصنيف…');
  });

  it('ignores a slow answer for a filter that was already changed', async () => {
    const { fixture, http, element } = await setup();
    http.expectOne('/api/tickets').flush([]);
    const select = element.querySelector<HTMLSelectElement>('select[data-filter=status]')!;
    select.value = 'resolved';
    select.dispatchEvent(new Event('change'));
    const slow = http.expectOne((r) => r.params.get('status') === 'resolved');
    select.value = 'new';
    select.dispatchEvent(new Event('change'));
    const fresh = http.expectOne((r) => r.params.get('status') === 'new');
    expect(slow.cancelled).toBe(true);
    fresh.flush([ticket]);
    await fixture.whenStable();
    expect(element.querySelectorAll('.ticket')).toHaveLength(1);
  });
});
