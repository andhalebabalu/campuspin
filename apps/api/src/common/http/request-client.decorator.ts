import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/** Where a request came from. Recorded on sessions and audit rows; never used for authorisation. */
export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

// Column widths in the database (`ipAddress` VARCHAR(45) fits IPv6, `userAgent` VARCHAR(255)).
const MAX_IP_LENGTH = 45;
const MAX_USER_AGENT_LENGTH = 255;

export function readClientContext(request: Request): ClientContext {
  const userAgent = request.headers['user-agent'];
  // pino-http sets `request.id` (see LoggingModule); it is a string or number for us.
  const id: unknown = request.id;
  const requestId = typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
  return {
    ...(request.ip ? { ipAddress: request.ip.slice(0, MAX_IP_LENGTH) } : {}),
    ...(userAgent ? { userAgent: userAgent.slice(0, MAX_USER_AGENT_LENGTH) } : {}),
    ...(requestId ? { requestId: requestId.slice(0, 64) } : {}),
  };
}

/**
 * Injects the caller's IP address, user agent and request id. `request.ip` honours `TRUST_PROXY`,
 * so behind a load balancer it is the real client address, not the proxy's.
 */
export const RequestClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClientContext =>
    readClientContext(context.switchToHttp().getRequest<Request>()),
);
