import { FormControl } from '@angular/forms';
import { normalizePhone, phoneValidator, trimmedLength } from './validators';

describe('ticket validators', () => {
  it('accepts Arabic digits and spaces in phones', () => {
    expect(normalizePhone('٠١٠ ٠١٢٣ ٤٥٦٧')).toBe('01001234567');
    expect(phoneValidator(new FormControl('٠١٠ ٠١٢٣ ٤٥٦٧'))).toBeNull();
    expect(phoneValidator(new FormControl('+20 100 123 4567'))).toBeNull();
  });

  it('rejects phones of spaces or letters', () => {
    expect(phoneValidator(new FormControl('          '))).toEqual({ phone: true });
    expect(phoneValidator(new FormControl('0100abc4567'))).toEqual({ phone: true });
  });

  it('checks trimmed length', () => {
    expect(trimmedLength(2, 5)(new FormControl('  a  '))).toEqual({ trimmedLength: true });
    expect(trimmedLength(2, 5)(new FormControl(' ab '))).toBeNull();
    expect(trimmedLength(2, 5)(new FormControl('abcdef'))).toEqual({ trimmedLength: true });
  });
});
