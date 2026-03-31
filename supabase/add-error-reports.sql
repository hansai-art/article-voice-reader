-- ============================================================
-- Error Reports table + Admin RPC functions
-- 在 Supabase SQL Editor 執行此檔案
-- ============================================================

-- 1. Table
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

-- 2. RLS
ALTER TABLE error_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert error reports"
  ON error_reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can read own error reports"
  ON error_reports FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_error_reports_type ON error_reports(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_user ON error_reports(user_id, created_at DESC);

-- 4. Admin function: get all error reports (bypasses RLS)
-- Only allows admin emails to call
CREATE OR REPLACE FUNCTION get_all_error_reports(row_limit INT DEFAULT 500)
RETURNS SETOF error_reports
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_email TEXT;
BEGIN
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF caller_email IS NULL OR caller_email NOT IN ('hanslintw@gmail.com') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN QUERY SELECT * FROM error_reports ORDER BY created_at DESC LIMIT row_limit;
END;
$$;

-- 5. Admin function: delete old error reports
CREATE OR REPLACE FUNCTION delete_old_error_reports(before_date TIMESTAMPTZ)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_email TEXT;
BEGIN
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF caller_email IS NULL OR caller_email NOT IN ('hanslintw@gmail.com') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM error_reports WHERE created_at < before_date;
END;
$$;
