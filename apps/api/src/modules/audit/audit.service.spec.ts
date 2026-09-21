import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import { buildAuthKit } from '../../../test/support/auth-unit.js';
import { AUDIT_ACTIONS } from './audit-actions.js';

describe('AuditService', () => {
  it('records who, what, on which entity, and from where', async () => {
    const { audit, fake } = buildAuthKit();

    await audit.record({
      action: 'LOGIN_SUCCESS',
      actorId: 'user-1',
      entityType: 'User',
      entityId: 'user-1',
      metadata: { sessionId: 'sid-1' },
      client: { ipAddress: '203.0.113.7', userAgent: 'agent', requestId: 'req-12345678' },
    });

    expect(fake.auditLog.rows).toEqual([
      expect.objectContaining({
        action: 'LOGIN_SUCCESS',
        actorId: 'user-1',
        entityType: 'User',
        entityId: 'user-1',
        metadata: { sessionId: 'sid-1' },
        ipAddress: '203.0.113.7',
        userAgent: 'agent',
        requestId: 'req-12345678',
      }),
    ]);
  });

  it('stores explicit nulls for anonymous events with no client details', async () => {
    const { audit, fake } = buildAuthKit();

    await audit.record({ action: 'LOGIN_FAILED', entityType: 'User' });

    expect(fake.auditLog.rows[0]).toMatchObject({
      actorId: null,
      entityId: null,
      ipAddress: null,
      userAgent: null,
      requestId: null,
    });
    expect(fake.auditLog.rows[0]).not.toHaveProperty('metadata');
  });

  it('logs and swallows a failed write when not in a transaction (audit must not break a login)', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { audit, fake } = buildAuthKit();
    vi.spyOn(fake.auditLog, 'create').mockRejectedValue(new Error('disk full'));

    await expect(
      audit.record({ action: 'LOGOUT', entityType: 'User', entityId: 'u1' }),
    ).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('LOGOUT'));
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('disk full'));
    errorLog.mockRestore();
  });

  it('writes through the given transaction and lets its failure roll the change back', async () => {
    const { audit, fake } = buildAuthKit();
    const tx = { auditLog: { create: vi.fn().mockRejectedValue(new Error('constraint')) } };

    await expect(
      audit.record({ action: 'EMAIL_VERIFIED', entityType: 'User' }, tx as never),
    ).rejects.toThrow('constraint');

    expect(fake.auditLog.rows).toHaveLength(0); // it did not fall back to the non-transactional client
  });

  it('has a closed list of actions covering everything Phase 3 records', () => {
    expect(AUDIT_ACTIONS).toEqual(
      expect.arrayContaining([
        'REGISTER',
        'LOGIN_SUCCESS',
        'LOGIN_FAILED',
        'LOGOUT',
        'LOGOUT_ALL',
        'EMAIL_VERIFIED',
        'PASSWORD_RESET_REQUESTED',
        'PASSWORD_RESET_COMPLETED',
        'REFRESH_TOKEN_ROTATED',
        'ACCOUNT_SUSPENDED',
      ]),
    );
  });
});
