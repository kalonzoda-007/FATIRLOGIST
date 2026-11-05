-- Required D1 replay protection. UNIQUE PRIMARY KEY rejects concurrent reuse.
CREATE TABLE IF NOT EXISTS workflow_nonce (
  nonce TEXT PRIMARY KEY NOT NULL,
  ts INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS workflow_nonce_created_idx ON workflow_nonce(created_at);
-- Production: export AppDeploy discussion event tables and proposal states before creating
-- a compatible transactional schema. Do not synthesize historical approvals.
