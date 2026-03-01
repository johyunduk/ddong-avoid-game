-- SKOR 시스템 테이블
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기

-- 1. 유저 SKOR 잔액 테이블
CREATE TABLE IF NOT EXISTS user_skor (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC(10, 1) DEFAULT 0 CHECK (balance >= 0),
  weekly_earned NUMERIC(10, 1) DEFAULT 0,
  week_start DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 누적 퀘스트 진행도 테이블
CREATE TABLE IF NOT EXISTS quest_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gold_total INTEGER DEFAULT 0,
  diamond_total INTEGER DEFAULT 0,
  topaz_total INTEGER DEFAULT 0,
  rainbow_total INTEGER DEFAULT 0
);

-- RLS 활성화
ALTER TABLE user_skor ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_progress ENABLE ROW LEVEL SECURITY;

-- 본인 데이터만 조회 가능 (Edge Function은 service role로 우회)
CREATE POLICY "users can read own skor"
  ON user_skor FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can read own quest progress"
  ON quest_progress FOR SELECT
  USING (auth.uid() = user_id);

-- 3. 보유 캐릭터 테이블
CREATE TABLE IF NOT EXISTS user_characters (
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  obtained_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, character_id)
);

ALTER TABLE user_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own characters"
  ON user_characters FOR SELECT
  USING (auth.uid() = user_id);
