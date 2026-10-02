import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TicketsApi } from './tickets-api';

describe('TicketsApi', () => {
  let api: TicketsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(TicketsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists with only the filters that are set', () => {
    api.list({ status: 'new', category: undefined }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/tickets');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual(['status']);
    expect(req.request.params.get('status')).toBe('new');
    req.flush([]);
  });

  it('posts new tickets', () => {
    const ticket = { name: 'منى', phone: '01001234567', description: 'عايزة أتطوع' };
    let id = 0;
    api.create(ticket).subscribe((res) => (id = res.id));
    const req = http.expectOne('/api/tickets');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(ticket);
    req.flush({ id: 5 });
    expect(id).toBe(5);
  });

  it('gets, patches and reclassifies a ticket', () => {
    api.get(3).subscribe();
    http.expectOne({ method: 'GET', url: '/api/tickets/3' }).flush({});
    api.update(3, { status: 'resolved' }).subscribe();
    const patch = http.expectOne({ method: 'PATCH', url: '/api/tickets/3' });
    expect(patch.request.body).toEqual({ status: 'resolved' });
    patch.flush({});
    api.reclassify(3).subscribe();
    http.expectOne({ method: 'POST', url: '/api/tickets/3/classify' }).flush({});
  });
});
