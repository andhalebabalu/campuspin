import {
  authUserSchema,
  loginResponseSchema,
  refreshResponseSchema,
  registerResponseSchema,
  verifyEmailResponseSchema,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResendVerificationRequest,
  type ResetPasswordRequest,
  type VerifyEmailRequest,
} from '@platform/contracts';
import { apiClient } from '@/lib/api/client';

export const authService = {
  register: (body: RegisterRequest) =>
    apiClient.post('/auth/register', { body, schema: registerResponseSchema }),

  login: (body: LoginRequest) =>
    apiClient.post('/auth/login', { body, schema: loginResponseSchema }),

  refresh: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { body: { refreshToken }, schema: refreshResponseSchema }),

  logout: () => apiClient.post('/auth/logout'),

  me: () => apiClient.get('/auth/me', { schema: authUserSchema }),

  verifyEmail: (body: VerifyEmailRequest) =>
    apiClient.post('/auth/verify-email', { body, schema: verifyEmailResponseSchema }),

  resendVerification: (body: ResendVerificationRequest) =>
    apiClient.post('/auth/resend-verification', { body }),

  forgotPassword: (body: ForgotPasswordRequest) =>
    apiClient.post('/auth/forgot-password', { body }),

  resetPassword: (body: ResetPasswordRequest) => apiClient.post('/auth/reset-password', { body }),
};
