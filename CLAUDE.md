# CLAUDE.md — Article Voice Reader

## 專案資訊

- **名稱**：Article Voice Reader (語音朗讀器)
- **用途**：貼上文章或上傳檔案，用語音朗讀播放，支援中斷續聽
- **Tech Stack**：React 18 / TypeScript / Vite / Tailwind / shadcn/ui
- **部署平台**：Lovable（push to main 自動部署）
- **語系**：中文 + 英文雙語（i18n），所有 UI 文字都要有 zh-TW 和 en

## 關鍵架構

### 頁面
- `src/pages/HomePage.tsx` — 文章列表、匯出/匯入、深色模式切換
- `src/pages/AddArticlePage.tsx` — 新增文章（URL/檔案/OCR/貼文字）
- `src/pages/PlayerPage.tsx` — 播放頁（TTS 控制、摘要、MP3 匯出）
- `src/pages/SettingsPage.tsx` — API Key、Supabase 雲端同步設定

### 核心模組
- `src/lib/tts.ts` — TTS 引擎介面 + WebSpeechTTS 實作 + 文字分段/分句
- `src/hooks/useTTS.ts` — 播放狀態管理、逐句朗讀、進度儲存、語音排序
- `src/lib/storage.ts` — localStorage 存取（文章、設定、API Key）
- `src/lib/i18n.ts` — 翻譯系統，新增 UI 文字時 zh-TW 和 en 都要加
- `src/lib/sync.ts` — Supabase 雙向同步（last-write-wins）
- `src/lib/supabase.ts` — Supabase client + auth

### 輸入解析
- `src/lib/file-parser.ts` — TXT/PDF/DOCX/MD 解析（PDF 用 pdfjs-dist，DOCX 用 mammoth）
- `src/lib/url-parser.ts` — URL 匯入（CORS proxy + @mozilla/readability）
- `src/lib/ocr-parser.ts` — 圖片 OCR（Tesseract.js，動態載入）

### AI 功能
- `src/lib/ai-summary.ts` — AI 摘要（Gemini / OpenAI）
- `src/lib/mp3-export.ts` — MP3 匯出（OpenAI TTS API）

## 開發注意事項

### TTS
- Chrome 的 `speechSynthesis` 播放超過 ~15 秒會自動暫停 → 需要每 10 秒呼叫 `resume()`
- 快速 `cancel()` → `speak()` 會觸發 `"interrupted"` error → 這不是真正的錯誤，要忽略
- 語音列表是異步載入的，要監聽 `voiceschanged` 事件
- 逐句朗讀（不是逐段），避免長文中斷問題

### CORS
- URL 匯入需要 CORS proxy（allorigins.win + corsproxy.io 備援）
- 這些 proxy 可能不穩定，需要 fallback 機制

### Supabase
- Schema 在 `supabase/schema.sql`，用 `supabase db push` 部署
- RLS 已開啟，使用者只能存取自己的文章
- 同步策略：last-write-wins，基於 lastPlayedAt / createdAt 時間戳

### 檔案解析
- pdfjs-dist worker 從 CDN 載入（cdnjs.cloudflare.com）
- Tesseract.js 用動態 import 避免初始 bundle 過大
- OCR 支援繁體中文 + 英文（chi_tra+eng）

## 建置與部署

```bash
npm run build        # 建置
git push             # 推到 main 自動部署
```

## 新增 UI 文字的流程

1. 在 `src/lib/i18n.ts` 的 `translations` 物件中，zh-TW 和 en 都加上新 key
2. 在元件中用 `t('newKey')` 取得翻譯
3. TypeScript 會自動檢查 key 是否存在（TranslationKey type）