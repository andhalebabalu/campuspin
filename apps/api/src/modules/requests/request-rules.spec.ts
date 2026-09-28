import {
  businessCanMove,
  businessMoves,
  studentCanApprove,
  studentCanCancel,
} from './request-rules.js';

describe('request rules', () => {
  it('lets a table request be acknowledged and done, nothing else', () => {
    expect(businessMoves('TABLE', 'NEW')).toEqual(['ACKNOWLEDGED', 'COMPLETED', 'CANCELLED']);
    expect(businessCanMove('TABLE', 'NEW', 'ESTIMATE_AVAILABLE')).toBe(false);
    expect(businessMoves('TABLE', 'COMPLETED')).toEqual([]);
  });

  it('makes a job wait for the student to approve the estimate', () => {
    expect(businessCanMove('GENERAL', 'ACCEPTED', 'ESTIMATE_AVAILABLE')).toBe(true);
    expect(businessCanMove('GENERAL', 'ESTIMATE_AVAILABLE', 'IN_PROGRESS')).toBe(false);
    expect(businessCanMove('GENERAL', 'ESTIMATE_AVAILABLE', 'APPROVED')).toBe(false);
    expect(studentCanApprove('ESTIMATE_AVAILABLE')).toBe(true);
    expect(businessCanMove('GENERAL', 'APPROVED', 'IN_PROGRESS')).toBe(true);
    expect(businessCanMove('GENERAL', 'NEW', 'COMPLETED')).toBe(false);
  });

  it('lets the student cancel only before work starts', () => {
    expect(studentCanCancel('GENERAL', 'ESTIMATE_AVAILABLE')).toBe(true);
    expect(studentCanCancel('GENERAL', 'IN_PROGRESS')).toBe(false);
    expect(studentCanCancel('TABLE', 'ACKNOWLEDGED')).toBe(true);
    expect(studentCanCancel('TABLE', 'COMPLETED')).toBe(false);
  });
});
