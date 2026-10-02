import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

const user = { id: 1, email: 'admin@x.example', name: 'Admin' };

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks the server only once whether the user is logged in', async () => {
    const first = auth.isLoggedIn();
    http.expectOne('/api/auth/me').flush(user);
    expect(await first).toBe(true);
    expect(auth.user()).toEqual(user);
    expect(await auth.isLoggedIn()).toBe(true);
    http.expectNone('/api/auth/me');
  });

  it('treats a 401 from /me as logged out', async () => {
    const result = auth.isLoggedIn();
    http.expectOne('/api/auth/me').flush({ error: 'login required' }, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe(false);
    expect(auth.user()).toBeNull();
  });

  it('login stores the user and rejects on bad credentials', async () => {
    const ok = auth.login('admin@x.example', 'pw');
    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ email: 'admin@x.example', password: 'pw' });
    req.flush(user);
    await ok;
    expect(auth.user()).toEqual(user);

    const bad = auth.login('admin@x.example', 'nope');
    http.expectOne('/api/auth/login').flush({ error: 'invalid credentials' }, { status: 401, statusText: 'Unauthorized' });
    await expect(bad).rejects.toMatchObject({ status: 401 });
  });

  it('logout clears the user even if the request fails', async () => {
    const login = auth.login('admin@x.example', 'pw');
    http.expectOne('/api/auth/login').flush(user);
    await login;

    const out = auth.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 500, statusText: 'Server Error' });
    await out.catch(() => undefined);
    expect(auth.user()).toBeNull();
  });
});
