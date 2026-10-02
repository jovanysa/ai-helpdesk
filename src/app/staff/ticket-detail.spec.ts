import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Ticket } from '../tickets/ticket.model';
import { TicketDetail } from './ticket-detail';

const ticket: Ticket = {
  id: 7,
  name: 'منى',
  phone: '01001234567',
  description: 'عايزة أعرف مواعيد الكشف',
  source: 'chat',
  status: 'new',
  category: 'other',
  priority: 'low',
  classificationStatus: 'done',
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
  transcript: [
    { role: 'user', content: 'مواعيد الكشف امتى؟' },
    { role: 'assistant', content: 'مش عارف' },
  ],
};

describe('TicketDetail', () => {
  async function setup(response: Ticket | null) {
    await TestBed.configureTestingModule({
      imports: [TicketDetail],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(TicketDetail);
    fixture.componentRef.setInput('id', '7');
    const http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    const req = http.expectOne({ method: 'GET', url: '/api/tickets/7' });
    if (response) req.flush(response);
    else req.flush({ error: 'ticket not found' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    return { fixture, http, element: fixture.nativeElement as HTMLElement };
  }

  it('loads the ticket from the route id and shows the transcript', async () => {
    const { element } = await setup(ticket);
    expect(element.textContent).toContain('تذكرة #7');
    expect(element.textContent).toContain('مواعيد الكشف امتى؟');
    expect(element.querySelector('a[href="tel:01001234567"]')).not.toBeNull();
  });

  it('patches the status when the select changes', async () => {
    const { fixture, http, element } = await setup(ticket);
    const select = element.querySelector<HTMLSelectElement>('select[data-field=status]')!;
    expect(select.value).toBe('new');
    select.value = 'resolved';
    select.dispatchEvent(new Event('change'));
    const req = http.expectOne({ method: 'PATCH', url: '/api/tickets/7' });
    expect(req.request.body).toEqual({ status: 'resolved' });
    req.flush({ ...ticket, status: 'resolved' });
    await fixture.whenStable();
    expect(element.querySelector<HTMLSelectElement>('select[data-field=status]')!.value).toBe('resolved');
  });

  it('offers reclassification only when it failed or is pending', async () => {
    const done = await setup(ticket);
    expect(done.element.textContent).not.toContain('إعادة التصنيف');
    TestBed.resetTestingModule();

    const { fixture, http, element } = await setup({ ...ticket, classificationStatus: 'failed' });
    const button = [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('إعادة التصنيف'))!;
    button.click();
    http.expectOne({ method: 'POST', url: '/api/tickets/7/classify' }).flush({ ...ticket, classificationStatus: 'pending' });
    await fixture.whenStable();
    expect(element.textContent).toContain('جاري التصنيف…');
  });

  it('shows not found on 404', async () => {
    const { element } = await setup(null);
    expect(element.textContent).toContain('التذكرة غير موجودة');
  });
});
