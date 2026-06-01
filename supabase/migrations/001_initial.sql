-- ═══════════════════════════════════════════════════════════
-- MacroQuest Database Schema
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── profiles ────────────────────────────────────────────────
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT UNIQUE NOT NULL,
  calorie_goal    INTEGER DEFAULT 2000,
  protein_goal    INTEGER DEFAULT 150,
  game_mode       TEXT DEFAULT 'EMPIRE',
  weight          DECIMAL(5,2),
  height          DECIMAL(5,2),
  age             INTEGER,
  gender          TEXT DEFAULT 'male',
  activity_level  TEXT DEFAULT 'moderate',
  onboarded       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── characters ──────────────────────────────────────────────
CREATE TABLE characters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  character_type  TEXT DEFAULT 'warrior',
  avatar          TEXT DEFAULT '⚔️',
  total_xp        INTEGER DEFAULT 0,
  level           INTEGER DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── food_logs ───────────────────────────────────────────────
CREATE TABLE food_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  food_name       TEXT NOT NULL,
  brand           TEXT DEFAULT '',
  serving_size    DECIMAL(8,2) DEFAULT 100,
  meal_type       TEXT DEFAULT 'Lunch',
  log_date        DATE DEFAULT CURRENT_DATE,
  calories        DECIMAL(8,2) DEFAULT 0,
  protein         DECIMAL(8,2) DEFAULT 0,
  carbs           DECIMAL(8,2) DEFAULT 0,
  fat             DECIMAL(8,2) DEFAULT 0,
  fiber           DECIMAL(8,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_food_logs_user_date ON food_logs(user_id, log_date);

-- ─── streaks ─────────────────────────────────────────────────
CREATE TABLE streaks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  logging         INTEGER DEFAULT 0,
  protein         INTEGER DEFAULT 0,
  budget          INTEGER DEFAULT 0,
  last_log_date   DATE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── quest_progress ──────────────────────────────────────────
CREATE TABLE quest_progress (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  quest_id        TEXT NOT NULL,
  quest_date      DATE DEFAULT CURRENT_DATE,
  completed       BOOLEAN DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  UNIQUE(user_id, quest_id, quest_date)
);

-- ─── daily_summaries ─────────────────────────────────────────
CREATE TABLE daily_summaries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  summary_date    DATE NOT NULL,
  total_calories  DECIMAL(8,2) DEFAULT 0,
  total_protein   DECIMAL(8,2) DEFAULT 0,
  total_carbs     DECIMAL(8,2) DEFAULT 0,
  total_fat       DECIMAL(8,2) DEFAULT 0,
  xp_earned       INTEGER DEFAULT 0,
  quests_completed INTEGER DEFAULT 0,
  UNIQUE(user_id, summary_date)
);

-- ═══════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════

ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "own profile"        ON profiles       FOR ALL USING (auth.uid() = id);
CREATE POLICY "own character"      ON characters     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own food logs"      ON food_logs      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own streaks"        ON streaks        FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own quest progress" ON quest_progress FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own summaries"      ON daily_summaries FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
-- Functions
-- ═══════════════════════════════════════════════════════════

-- Add XP to character
CREATE OR REPLACE FUNCTION add_xp(p_user_id UUID, p_xp INTEGER)
RETURNS void AS $$
DECLARE
  current_xp INTEGER;
  new_xp INTEGER;
  new_level INTEGER;
  xp_needed INTEGER;
BEGIN
  SELECT total_xp INTO current_xp FROM characters WHERE user_id = p_user_id;
  new_xp := COALESCE(current_xp, 0) + p_xp;
  -- Simple level calc: level = floor(sqrt(new_xp / 100)) + 1, capped at 100
  new_level := LEAST(FLOOR(SQRT(new_xp::float / 100))::integer + 1, 100);
  UPDATE characters SET total_xp = new_xp, level = new_level, updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get daily summary for a user
CREATE OR REPLACE FUNCTION get_daily_summary(p_user_id UUID, p_date DATE)
RETURNS TABLE(
  total_calories DECIMAL,
  total_protein  DECIMAL,
  total_carbs    DECIMAL,
  total_fat      DECIMAL,
  meal_count     BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(calories), 0),
    COALESCE(SUM(protein),  0),
    COALESCE(SUM(carbs),    0),
    COALESCE(SUM(fat),      0),
    COUNT(*)
  FROM food_logs
  WHERE user_id = p_user_id AND log_date = p_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at   BEFORE UPDATE ON profiles   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER characters_updated_at BEFORE UPDATE ON characters FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER streaks_updated_at    BEFORE UPDATE ON streaks    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
