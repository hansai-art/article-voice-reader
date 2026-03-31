-- ============================================================
-- Error Reports table: 收集所有使用者的 TTS 錯誤和裝置資訊
-- 在 Supabase SQL Editor 執行此檔案
-- ============================================================

CREATE TABLE IF NOT EXISTS error_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,        -- tts_error, tts_stall, tts_skip, tts_watchdog, sync_error
  message TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  device_os TEXT,                   -- e.g. "iOS 17.4", "Android 14"
  device_browser TEXT,              -- e.g. "Safari 17.4", "Chrome 122"
  device_mobile BOOLEAN DEFAULT false,
  screen TEXT,                      -- e.g. "390x844"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: anyone can INSERT (including anonymous), only admin can SELECT
ALTER TABLE error_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can report errors (even without login)
CREATE POLICY "Anyone can insert error reports"
  ON error_reports FOR INSERT
  WITH CHECK (true);

-- Users can only read their own reports
CREATE POLICY "Users can read own error reports"
  ON error_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Index for querying by type and time
CREATE INDEX IF NOT EXISTS idx_error_reports_type ON error_reports(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_user ON error_reports(user_id, created_at DESC);
