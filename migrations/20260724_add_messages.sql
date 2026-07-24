-- Company message board.
--
-- Back office posts announcements (requireBackOffice); every employee reads them
-- (requireEmployee) on their dashboard. One-way for now. author_name is
-- denormalized so a message survives its author's employee row being removed.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id   UUID REFERENCES employees(id),
  author_name TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(pinned) WHERE pinned = TRUE;
