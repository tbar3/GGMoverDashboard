-- Single-row store for the QuickBooks Online OAuth connection. Tokens are secrets;
-- they live here (same private Neon DB), never in code. The id = 1 check keeps it
-- to exactly one company connection.
CREATE TABLE IF NOT EXISTS quickbooks_connection (
  id                 INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  realm_id           TEXT,                -- QuickBooks company id
  access_token       TEXT,
  refresh_token      TEXT,
  access_expires_at  TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  connected_at       TIMESTAMPTZ,
  connected_by       UUID REFERENCES employees(id),
  last_sync_at       TIMESTAMPTZ
);
