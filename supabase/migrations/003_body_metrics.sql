CREATE TABLE IF NOT EXISTS body_metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  weight_kg   DECIMAL(5,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE body_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own body_metrics"
  ON body_metrics FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS body_metrics_user_date_idx
  ON body_metrics(user_id, date DESC);
