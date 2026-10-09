import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './db';
import { verifyPassword } from './passwords';
import { StaffRepository } from './staff-repository';

describe('StaffRepository', () => {
  let db: DatabaseSync;
  let staff: StaffRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    staff = new StaffRepository(db);
  });

  it('authenticates regardless of email case and surrounding spaces', () => {
    staff.create('Admin@AlKhair.example', 'مدير', 'pw123456');
    expect(staff.authenticate('  admin@alkhair.EXAMPLE ', 'pw123456')).toEqual({
      id: 1,
      email: 'admin@alkhair.example',
      name: 'مدير',
    });
  });

  it('rejects a wrong password and an unknown email', () => {
    staff.create('a@x.example', 'A', 'pw123456');
    expect(staff.authenticate('a@x.example', 'wrong')).toBeUndefined();
    expect(staff.authenticate('b@x.example', 'pw123456')).toBeUndefined();
  });

  it('finds users by id and email', () => {
    const user = staff.create('a@x.example', 'A', 'pw123456');
    expect(staff.findById(user.id)).toEqual(user);
    expect(staff.findByEmail('A@X.example')).toEqual(user);
    expect(staff.findById(99)).toBeUndefined();
  });

  it('ensure does not duplicate or change an existing account', () => {
    staff.ensure('a@x.example', 'A', 'first-pass');
    staff.ensure('a@x.example', 'B', 'second-pass');
    expect(staff.authenticate('a@x.example', 'first-pass')?.name).toBe('A');
    expect(db.prepare('SELECT COUNT(*) AS n FROM staff_users').get()?.['n']).toBe(1);
  });

  it('runs the password check for an unknown email too, so timing reveals nothing', () => {
    const verify = vi.fn(verifyPassword);
    const repo = new StaffRepository(db, undefined, verify);
    repo.create('a@x.example', 'A', 'pw123456');
    expect(repo.authenticate('nobody@x.example', 'pw123456')).toBeUndefined();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][1]).toMatch(/^scrypt\$/);
  });
});
