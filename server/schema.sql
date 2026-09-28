CREATE TABLE IF NOT EXISTS vibe_marks (
 device_id text PRIMARY KEY,
 vibe text NOT NULL CHECK (vibe IN ('joy','move','chill','blue','chaos','alone')),
 cell_lng double precision NOT NULL,
 cell_lat double precision NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vibe_marks_updated_at_idx ON vibe_marks(updated_at);
