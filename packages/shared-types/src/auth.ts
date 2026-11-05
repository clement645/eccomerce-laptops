import type { Permission } from './access-control.js';

/** The signed-in customer, as returned by auth and account endpoints. */
export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  marketingOptIn: boolean;
  emailVerified: boolean;
}

export interface AuthResponse {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: SessionUser;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: Permission[];
}

export interface AdminAuthResponse {
  accessToken: string;
  expiresIn: number;
  user: AdminUser;
}

/** First step of staff login: a password check that must be followed by two-factor. */
export interface AdminLoginChallenge {
  stage: 'mfa_setup' | 'mfa_verify';
  challengeToken: string;
  expiresIn: number;
}

export interface MfaSetupResponse {
  /** otpauth:// URI for the authenticator app QR code. */
  otpauthUrl: string;
  /** Base32 secret for manual entry. */
  secret: string;
}

export interface AddressDto {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  county: string;
  town: string;
  street: string;
  building: string | null;
  landmark: string | null;
  isDefault: boolean;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  current: boolean;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; email: string } | null;
  ip: string | null;
  createdAt: string;
}

/** Generic acknowledgement that never reveals whether an account exists. */
export interface MessageResponse {
  message: string;
}
