CREATE TABLE IF NOT EXISTS parse_history (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(64),
    created_at TIMESTAMPTZ,
    filename VARCHAR(255),
    message_count INTEGER,
    duration_s DOUBLE PRECISION,
    total_distance_m DOUBLE PRECISION,
    max_horizontal_speed_mps DOUBLE PRECISION,
    max_vertical_speed_mps DOUBLE PRECISION,
    max_acceleration_mps2 DOUBLE PRECISION,
    max_altitude_gain_m DOUBLE PRECISION,
    analysis_snapshot JSON
);

ALTER TABLE parse_history ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE parse_history ADD COLUMN IF NOT EXISTS analysis_snapshot JSON;

CREATE INDEX IF NOT EXISTS ix_parse_history_user_id ON parse_history (user_id);
CREATE INDEX IF NOT EXISTS ix_parse_history_created_at ON parse_history (created_at);
