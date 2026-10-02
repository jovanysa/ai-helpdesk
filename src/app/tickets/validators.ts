import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Same rule as the server: Arabic-Indic and Persian digits to ASCII, spaces removed. */
export function normalizePhone(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s/g, '');
}

export const phoneValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  /^\+?[0-9]{8,15}$/.test(normalizePhone(String(control.value ?? ''))) ? null : { phone: true };

/** Like minLength/maxLength, but ignores spaces at the start and end. */
export function trimmedLength(min: number, max: number): ValidatorFn {
  return (control) => {
    const length = String(control.value ?? '').trim().length;
    return length >= min && length <= max ? null : { trimmedLength: true };
  };
}
