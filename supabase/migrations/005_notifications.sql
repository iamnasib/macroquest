-- Re-engagement: web push subscriptions + notification/email preferences.

-- ─── Push subscriptions (one row per browser/device) ──────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions(user_id);

-- ─── Notification / email preferences on profile ──────────────────────────────
-- timezone: captured from the browser so reminders fire at the right LOCAL hour
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone              TEXT    DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS push_daily_reminder   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS push_streak_saver     BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS daily_reminder_hour   SMALLINT DEFAULT 12
    CHECK (daily_reminder_hour >= 0 AND daily_reminder_hour <= 23),
  ADD COLUMN IF NOT EXISTS email_digest_enabled  BOOLEAN DEFAULT TRUE,
  -- idempotency markers (last time each channel actually fired)
  ADD COLUMN IF NOT EXISTS last_daily_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_streak_saver_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_email_at          TIMESTAMPTZ;
