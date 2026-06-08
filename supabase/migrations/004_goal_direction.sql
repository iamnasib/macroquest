-- Persist the user's weight goal direction (was computed at onboarding but
-- never saved). Drives goal-aware coloring of weight trends in Body Forge.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS goal_direction TEXT DEFAULT 'maintain'
  CHECK (goal_direction IN ('cut', 'maintain', 'bulk'));
