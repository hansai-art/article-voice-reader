-- Error reports table for TTS diagnostics
CREATE TABLE IF NOT EXISTS error_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  device_os TEXT,
  device_browser TEXT,
  device_mobile BOOLEAN DEFAULT false,
  screen TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE error_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (including anonymous / not logged in)
CREATE POLICY "Anyone can insert error reports"
  ON error_reports FOR INSERT
  WITH CHECK (true);

-- Any authenticated user can read all reports (not sensitive data)
CREATE POLICY "Authenticated users can read all error reports"
  ON error_reports FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admin can delete (any authenticated user for simplicity)
CREATE POLICY "Authenticated users can delete error reports"
  ON error_reports FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_error_reports_type ON error_reports(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_user ON error_reports(user_id, created_at DESC);
