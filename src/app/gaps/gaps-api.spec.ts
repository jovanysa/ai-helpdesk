import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { GapsApi } from './gaps-api';

describe('GapsApi', () => {
  let api: GapsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(GapsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the open questions for a reason', () => {
    api.list('off_topic').subscribe();
    const req = http.expectOne((r) => r.url === '/api/gaps');
    expect(req.request.params.get('reason')).toBe('off_topic');
    req.flush([]);
  });

  it('resolves a group', () => {
    api.resolve('no_answer', 'فيه ركنه').subscribe();
    const req = http.expectOne({ method: 'POST', url: '/api/gaps/resolve' });
    expect(req.request.body).toEqual({ reason: 'no_answer', key: 'فيه ركنه' });
    req.flush({ resolved: 2 });
  });

  it('sends a staff answer', () => {
    api.answer('no_answer', 'فيه ركنه', 'فيه ركنة؟', 'أيوه، فيه جراج.').subscribe();
    const req = http.expectOne({ method: 'POST', url: '/api/gaps/answer' });
    expect(req.request.body).toEqual({ reason: 'no_answer', key: 'فيه ركنه', title: 'فيه ركنة؟', answer: 'أيوه، فيه جراج.' });
    req.flush({ resolved: 1 });
  });
});
