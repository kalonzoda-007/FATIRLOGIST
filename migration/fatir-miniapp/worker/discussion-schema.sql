-- FATIR staged discussion storage. No destructive migration; do not enable writes
-- until legacy AppDeploy records have been reconciled and verified.
CREATE TABLE IF NOT EXISTS fatir_discussion_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  event_kind TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  event_json TEXT NOT NULL,
  source TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fatir_discussion_events_order
  ON fatir_discussion_events(order_id,created_at,event_id);
CREATE TABLE IF NOT EXISTS fatir_discussion_proposals (
  proposal_id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  author_id TEXT NOT NULL,
  status TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  details_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fatir_discussion_proposals_order
  ON fatir_discussion_proposals(order_id,status);
CREATE TABLE IF NOT EXISTS fatir_legacy_discussion_guard (
  order_id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  migration_status TEXT NOT NULL CHECK(migration_status IN
    ('REQUIRES_SOURCE_EXPORT','RECONCILING','VERIFIED')),
  discovered_at TEXT NOT NULL,
  verified_at TEXT,
  notes TEXT NOT NULL DEFAULT ''
);
