import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SupportPage } from './support-page';

describe('SupportPage', () => {
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [SupportPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(SupportPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const type = async (selector: string, value: string) => {
      const input = element.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const submit = () => element.querySelector<HTMLButtonElement>('button[type=submit]')!;
    return { fixture, element, type, submit, http: TestBed.inject(HttpTestingController) };
  }

  async function fillValid(type: (s: string, v: string) => Promise<void>) {
    await type('[formControlName=name]', 'منى');
    await type('[formControlName=phone]', '٠١٠٠١٢٣٤٥٦٧');
    await type('[formControlName=description]', 'محتاجة مساعدة في مصاريف المدرسة');
  }

  it('keeps submit disabled until the form is valid', async () => {
    const { type, submit } = await setup();
    expect(submit().disabled).toBe(true);
    await fillValid(type);
    expect(submit().disabled).toBe(false);
  });

  it('creates the ticket and shows its number', async () => {
    const { fixture, element, type, submit, http } = await setup();
    await fillValid(type);
    submit().click();

    const req = http.expectOne('/api/tickets');
    expect(req.request.body).toEqual({
      name: 'منى',
      phone: '٠١٠٠١٢٣٤٥٦٧',
      description: 'محتاجة مساعدة في مصاريف المدرسة',
    });
    req.flush({ id: 12 });
    await fixture.whenStable();

    expect(element.textContent).toContain('تم تسجيل طلبك رقم #12، هيتواصل معاك موظف قريب.');
  });

  it('shows an error and keeps the values when the request fails', async () => {
    const { fixture, element, type, submit, http } = await setup();
    await fillValid(type);
    submit().click();
    http.expectOne('/api/tickets').flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(element.querySelector('[role=alert]')?.textContent).toContain('حصل خطأ، حاول تاني.');
    expect(element.querySelector<HTMLInputElement>('[formControlName=name]')!.value).toBe('منى');
  });
});
