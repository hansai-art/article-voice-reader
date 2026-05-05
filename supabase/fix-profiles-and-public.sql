-- ============================================================
-- 修正：建立 profiles table + 公開文章功能
-- 在 Supabase SQL Editor 執行此檔案
-- ============================================================

-- 1. 建立 profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 加 is_public 欄位（預設 true）
ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- 3. 只回填欄位新增後仍為 NULL 的舊資料；不要覆蓋使用者已設定的 private 文章
UPDATE articles SET is_public = true WHERE is_public IS NULL;

-- 4. RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 5. 修正 articles 的 RLS：加上公開文章存取
-- 先刪除原本只允許 owner 讀取的 policy
DROP POLICY IF EXISTS "Users can read own articles" ON articles;

-- 建立新的：自己的文章 + 公開的文章都能讀
CREATE POLICY "Users can read own or public articles"
  ON articles FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_articles_public ON articles(user_id, is_public) WHERE is_public = true;

-- 7. 自動建立 profile（新使用者註冊時）
-- username 必須 collision-safe，避免不同 domain 的相同 email prefix 撞 UNIQUE。
CREATE OR REPLACE FUNCTION make_profile_username(user_email TEXT, user_id UUID)
RETURNS TEXT AS $$
DECLARE
  base TEXT;
BEGIN
  base := LOWER(SPLIT_PART(COALESCE(user_email, 'user'), '@', 1));
  base := REGEXP_REPLACE(base, '[^a-z0-9_-]+', '-', 'g');
  base := TRIM(BOTH '-' FROM base);

  IF base = '' THEN
    base := 'user';
  END IF;

  RETURN base || '-' || REPLACE(user_id::TEXT, '-', '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    make_profile_username(NEW.email, NEW.id),
    SPLIT_PART(COALESCE(NEW.email, 'User'), '@', 1)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 8. 幫既有使用者建立 profile（如果還沒有的話）
INSERT INTO profiles (id, username, display_name)
SELECT
  id,
  make_profile_username(email, id),
  SPLIT_PART(COALESCE(email, 'User'), '@', 1)
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT DO NOTHING;
