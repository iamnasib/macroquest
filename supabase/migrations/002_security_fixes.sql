-- ═══════════════════════════════════════════════════════════
-- Migration 002: Security fixes for SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════

-- Fix add_xp: validate that the caller owns the target user_id
-- and align the level formula with the frontend getLevelFromXP
CREATE OR REPLACE FUNCTION add_xp(p_user_id UUID, p_xp INTEGER)
RETURNS void AS $$
DECLARE
  current_xp INTEGER;
  new_xp     INTEGER;
  new_level  INTEGER;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot modify another user''s XP';
  END IF;

  SELECT total_xp INTO current_xp FROM characters WHERE user_id = p_user_id;
  new_xp    := COALESCE(current_xp, 0) + p_xp;
  new_level := LEAST(FLOOR(SQRT(new_xp::float / 100))::integer + 1, 100);

  UPDATE characters
    SET total_xp = new_xp, level = new_level, updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix get_daily_summary: validate caller owns the requested user_id
CREATE OR REPLACE FUNCTION get_daily_summary(p_user_id UUID, p_date DATE)
RETURNS TABLE(
  total_calories DECIMAL,
  total_protein  DECIMAL,
  total_carbs    DECIMAL,
  total_fat      DECIMAL,
  total_fiber    DECIMAL,
  meal_count     BIGINT
) AS $$
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot access another user''s summary';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(calories), 0),
    COALESCE(SUM(protein),  0),
    COALESCE(SUM(carbs),    0),
    COALESCE(SUM(fat),      0),
    COALESCE(SUM(fiber),    0),
    COUNT(*)
  FROM food_logs
  WHERE user_id = p_user_id AND log_date = p_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add missing index on quest_progress for the (user_id, quest_date) query pattern
CREATE INDEX IF NOT EXISTS idx_quest_progress_user_date
  ON quest_progress(user_id, quest_date);

-- Add username length and format constraint
ALTER TABLE profiles
  ADD CONSTRAINT username_format CHECK (
    length(username) >= 3 AND
    length(username) <= 30 AND
    username ~ '^[a-zA-Z0-9_-]+$'
  );
