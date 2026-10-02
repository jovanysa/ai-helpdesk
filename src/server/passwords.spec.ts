import { hashPassword, verifyPassword } from './passwords';

describe('passwords', () => {
  it('verifies the right password and rejects a wrong one', () => {
    const stored = hashPassword('s3cret');
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(verifyPassword('s3cret', stored)).toBe(true);
    expect(verifyPassword('S3cret', stored)).toBe(false);
  });

  it('uses a different salt each time', () => {
    expect(hashPassword('a')).not.toBe(hashPassword('a'));
  });

  it('returns false for a malformed stored value', () => {
    expect(verifyPassword('a', 'nonsense')).toBe(false);
    expect(verifyPassword('a', 'scrypt$zz$zz')).toBe(false);
  });
});
