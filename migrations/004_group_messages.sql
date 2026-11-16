CREATE TABLE group_messages (
  id         SERIAL PRIMARY KEY,
  group_id   INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX group_messages_group_idx ON group_messages (group_id, id);
