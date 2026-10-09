import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { StaffLogin } from './staff-login';

describe('StaffLogin', () => {
  async function setup(login: () => Promise<void>, returnUrl?: string) {
    await TestBed.configureTestingModule({
      imports: [StaffLogin],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { login: vi.fn(login) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) } } },
      ],
    }).compileComponents();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(StaffLogin);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    for (const [name, value] of [['email', ' Admin@AlKhair.example '], ['password', 'pw123456']]) {
      const input = element.querySelector<HTMLInputElement>(`[formControlName=${name}]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
    return { fixture, element, navigate, navigateByUrl, auth: TestBed.inject(AuthService) };
  }

  it('navigates to /staff after a successful login', async () => {
    const { fixture, element, navigate, auth } = await setup(async () => undefined);
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    expect(auth.login).toHaveBeenCalledWith('Admin@AlKhair.example', 'pw123456');
    expect(navigate).toHaveBeenCalledWith(['/staff']);
  });

  it('shows the credentials error on 401', async () => {
    const { fixture, element, navigate } = await setup(async () => {
      throw new HttpErrorResponse({ status: 401 });
    });
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('البريد أو كلمة المرور غير صحيحة');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the generic error for other failures', async () => {
    const { fixture, element } = await setup(async () => {
      throw new HttpErrorResponse({ status: 500 });
    });
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('حصل خطأ، حاول تاني.');
  });

  it('goes back to the page the staff member was on', async () => {
    const { fixture, element, navigateByUrl } = await setup(async () => undefined, '/staff/tickets/7');
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    expect(navigateByUrl).toHaveBeenCalledWith('/staff/tickets/7');
  });

  it('ignores a return address outside the staff pages', async () => {
    const { fixture, element, navigate, navigateByUrl } = await setup(async () => undefined, 'https://evil.example/');
    element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/staff']);
  });
});

