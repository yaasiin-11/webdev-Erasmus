CREATE TABLE study_sessions (
  id               SERIAL PRIMARY KEY,
  group_id         INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  created_by       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic            TEXT NOT NULL,
  starts_at        TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  location         TEXT NOT NULL DEFAULT '',
  agenda           TEXT NOT NULL DEFAULT '',
  agenda_source    TEXT NOT NULL DEFAULT 'manual',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX study_sessions_group_start_idx ON study_sessions (group_id, starts_at);
