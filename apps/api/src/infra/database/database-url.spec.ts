import { parseDatabaseUrl } from './database-url.js';

describe('parseDatabaseUrl', () => {
  it('parses the XAMPP default (root, empty password)', () => {
    expect(parseDatabaseUrl('mysql://root:@localhost:3306/link_platform')).toEqual({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'link_platform',
    });
  });

  it('parses a root user WITH a password and decodes percent-encoding', () => {
    expect(parseDatabaseUrl('mysql://root:p%40ss%3Aw%2Ford@127.0.0.1:3307/link_platform')).toEqual({
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: 'p@ss:w/ord',
      database: 'link_platform',
    });
  });

  it('defaults the port to 3306', () => {
    expect(parseDatabaseUrl('mysql://root:@localhost/link_platform').port).toBe(3306);
  });

  it('rejects malformed URLs, other protocols and a missing database name', () => {
    expect(() => parseDatabaseUrl('not a url')).toThrow(/valid URL/);
    expect(() => parseDatabaseUrl('postgres://u:p@localhost/db')).toThrow(/mysql:\/\//);
    expect(() => parseDatabaseUrl('mysql://root:@localhost:3306')).toThrow(/name a database/);
  });
});
