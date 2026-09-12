CREATE TABLE learning_runs (
  id text PRIMARY KEY,
  owner_hash text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  request jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','PARTIAL_SUCCESS','FAILED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  retry_of text REFERENCES learning_runs(id) ON DELETE SET NULL,
  UNIQUE(owner_hash, idempotency_key)
);
CREATE INDEX learning_runs_expiry ON learning_runs(expires_at);
CREATE TABLE learning_items (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES learning_runs(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 19),
  payload jsonb NOT NULL,
  attempt integer NOT NULL DEFAULT 0,
  lease_token text,
  lease_until timestamptz,
  UNIQUE(run_id, position)
);
CREATE TABLE processing_attempts (
  item_id text NOT NULL REFERENCES learning_items(id) ON DELETE CASCADE,
  attempt integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('RUNNING','SUCCEEDED','FAILED','CANCELLED','LEASE_EXPIRED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY(item_id, attempt)
);
CREATE TABLE outbox_events (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES learning_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;
CREATE TABLE run_events (
  run_id text NOT NULL REFERENCES learning_runs(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id, sequence)
);
