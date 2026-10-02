import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { unauthorizedInterceptor } from './unauthorized.interceptor';

describe('unauthorizedInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  let clear: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    clear = vi.spyOn(TestBed.inject(AuthService), 'clear');
  });

  it('sends the user to the login page on a 401 from the tickets API', () => {
    let failed = false;
    http.get('/api/tickets').subscribe({ error: () => (failed = true) });
    backend.expectOne('/api/tickets').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(failed).toBe(true);
    expect(clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/staff/login']);
  });

  it('does not redirect on a 401 from /api/auth/login', () => {
    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    backend.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores other errors', () => {
    http.get('/api/tickets').subscribe({ error: () => undefined });
    backend.expectOne('/api/tickets').flush({}, { status: 500, statusText: 'Server Error' });
    expect(navigate).not.toHaveBeenCalled();
  });
});
