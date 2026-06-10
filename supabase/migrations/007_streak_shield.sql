-- Streak Shield: auto-protects one missed day per 30 days for streaks >= 3.
-- NULL shield_used_at means the shield has never been consumed (ready).
ALTER TABLE streaks ADD COLUMN IF NOT EXISTS shield_used_at DATE;
