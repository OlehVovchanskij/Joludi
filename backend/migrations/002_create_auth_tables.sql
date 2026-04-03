CREATE TABLE IF NOT EXISTS auth_users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(320) NOT NULL UNIQUE,
    display_name VARCHAR(120),
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verification_token_hash VARCHAR(64),
    email_verification_expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_auth_users_email ON auth_users (email);
CREATE INDEX IF NOT EXISTS ix_auth_users_created_at ON auth_users (created_at);
CREATE INDEX IF NOT EXISTS ix_auth_users_email_verification_token_hash ON auth_users (email_verification_token_hash);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    access_token VARCHAR(128) NOT NULL UNIQUE,
    refresh_token VARCHAR(128) NOT NULL UNIQUE,
    access_expires_at TIMESTAMPTZ NOT NULL,
    refresh_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_access_token ON auth_sessions (access_token);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_refresh_token ON auth_sessions (refresh_token);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_access_expires_at ON auth_sessions (access_expires_at);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_refresh_expires_at ON auth_sessions (refresh_expires_at);
