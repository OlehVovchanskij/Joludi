export type AuthMode = "login" | "register";

export type AuthUser = {
  id: string;
  email: string;
  display_name?: string | null;
  created_at: string;
  email_verified?: boolean;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
};

export type AuthResponse = {
  user: AuthUser;
  session?: AuthSession | null;
  requires_email_verification?: boolean;
};

export type ApiErrorPayload = {
  detail?: string;
};
