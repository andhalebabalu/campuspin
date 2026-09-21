import type { ExecutionContext, Type } from '@nestjs/common';

/**
 * A minimal HTTP `ExecutionContext` for guard unit tests. `controller` should be a class whose
 * method carries the real decorators (`@Public()`, `@Roles(...)`), so guards read genuine metadata
 * through Nest's `Reflector`.
 */
export function httpContext(
  controller: Type<object>,
  method: string,
  request: object = {},
  type = 'http',
): ExecutionContext {
  const handler = (controller.prototype as Record<string, () => void>)[method];
  return {
    getType: () => type,
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
