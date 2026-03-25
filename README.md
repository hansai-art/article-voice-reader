# 語音朗讀器 Article Voice Reader

> 將任何文章轉為語音，隨時隨地聆聽學習。

🔗 **線上體驗**：[twavr.lovable.app](https://twavr.lovable.app)

---

## 目錄

- [專案簡介](#專案簡介)
- [功能總覽](#功能總覽)
- [技術棧](#技術棧)
- [快速開始](#快速開始)
- [專案結構](#專案結構)
- [功能詳細說明](#功能詳細說明)
- [設定與配置](#設定與配置)
- [瀏覽器擴充功能](#瀏覽器擴充功能)
- [PWA 安裝](#pwa-安裝)
- [授權](#授權)

---

## 專案簡介

Article Voice Reader 是一款基於瀏覽器的文章語音朗讀應用，讓你可以把任何文章轉成語音來聆聽。不管是通勤、運動還是做家事，都能邊聽邊學。

支援多種匯入方式（貼上文字、上傳檔案、網址擷取、OCR 圖片辨識），搭配瀏覽器語音或 OpenAI AI 語音，提供完整的閱讀管理功能。

---

## 功能總覽

| 分類 | 功能 | 說明 |
|------|------|------|
| **匯入** | 貼上文字 | 直接貼上任何文章內容，自動偵測剪貼簿 |
| | 上傳檔案 | 支援 TXT / PDF / DOCX / MD 格式，拖放上傳 |
| | 網址擷取 | 輸入文章 URL 自動擷取內文（基於 Readability） |
| | OCR 辨識 | 上傳圖片或截圖，透過 Tesseract.js 辨識文字 |
| **朗讀** | 瀏覽器語音 | 使用裝置內建 TTS，免費無需設定 |
| | AI 語音 | OpenAI TTS 高品質語音，自然流暢 |
| | 語速調整 | 0.5x ~ 5x，11 段速度選擇 |
| | 段落追蹤 | 自動高亮當前朗讀段落，點擊任意段落跳轉 |
| **閱讀** | 沉浸模式 | 隱藏 UI 元素，專注閱讀 |
| | 速讀模式 | RSVP 一次顯示一句，高效閱讀 |
| | Bionic 閱讀 | 加粗字首幫助快速瀏覽 |
| | 閱讀主題 | 預設 / 復古 / 奶油 / 深色 / 純黑 五種主題 |
| | 字體大小 | 14px ~ 24px 自由調整 |
| **管理** | 書籤 | 標記重要段落，快速跳轉 |
| | 筆記 | 在任意段落添加筆記 |
| | 標籤分類 | 自訂標籤整理文章 |
| | 進度追蹤 | 自動記錄閱讀進度，下次繼續 |
| | 搜尋排序 | 關鍵字搜尋 + 多種排序（最近播放/建立/進度/標題） |
| | 目錄導航 | 自動偵測標題結構，快速跳轉章節 |
| **進階** | AI 摘要 | 一鍵生成文章重點摘要（OpenAI / Google Gemini） |
| | MP3 匯出 | 整篇文章轉為 MP3 音檔下載（OpenAI TTS） |
| | 匯出匯入 | JSON 格式備份與還原所有文章 |
| | 睡眠計時器 | 15 / 30 / 45 / 60 / 90 分鐘後自動停止 |
| | 自動播放 | 播完一篇自動接續下一篇 |
| **同步** | 雲端同步 | 透過 Supabase 跨裝置同步文章 |
| | 帳號系統 | 註冊 / 登入，管理個人資料 |
| | 公開主頁 | 設定公開文章，分享閱讀清單 |
| **其他** | 中英雙語 | 完整繁體中文 + 英文介面 |
| | 深色模式 | 支援亮色 / 深色 / 跟隨系統 |
| | PWA | 可安裝至手機桌面，離線使用 |
| | 螢幕常亮 | 朗讀時自動保持螢幕開啟 |
| | 快捷鍵 | 空白鍵播放暫停、方向鍵跳段 |
| | 新手引導 | 首次使用自動顯示功能導覽 |

---

## 技術棧

| 類別 | 技術 |
|------|------|
| 框架 | React 18 + TypeScript |
| 建置 | Vite 8 |
| 樣式 | Tailwind CSS 3 + shadcn/ui |
| 動畫 | Framer Motion |
| 路由 | React Router v6 |
| 語音 | Web Speech API + OpenAI TTS API |
| OCR | Tesseract.js |
| PDF | pdfjs-dist |
| DOCX | mammoth |
| 網頁擷取 | @mozilla/readability |
| 後端/同步 | Supabase (PostgreSQL + Auth) |
| 部署 | Lovable (auto-deploy on push) |

---

## 快速開始

### 環境需求

- Node.js 18+
- npm 或 bun

### 安裝與啟動

```bash
# 複製專案
git clone https://github.com/hansai-art/article-voice-reader.git
cd article-voice-reader

# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev
```

開發伺服器預設在 `http://localhost:5173`。

### 其他指令

```bash
npm run build        # 生產環境建置
npm run build:dev    # 開發環境建置
npm run preview      # 預覽建置結果
npm run test         # 執行測試
npm run lint         # 程式碼檢查
```

---

## 專案結構

```
src/
├── components/
│   ├── OnboardingTour.tsx     # 新手引導教學
│   ├── NavLink.tsx            # 導航連結
│   └── ui/                    # shadcn/ui 元件庫
├── hooks/
│   ├── useLanguage.ts         # 中英語系切換
│   ├── usePlaybackStore.ts    # 播放狀態管理
│   ├── useTTS.ts              # 語音合成核心邏輯
│   ├── useSwipeGesture.ts     # 滑動手勢（跳段）
│   └── useWakeLock.ts         # 螢幕常亮
├── lib/
│   ├── i18n.ts                # 國際化翻譯檔
│   ├── tts.ts                 # TTS 工具函式
│   ├── storage.ts             # LocalStorage 存取
│   ├── ai-summary.ts          # AI 摘要生成
│   ├── mp3-export.ts          # MP3 匯出
│   ├── file-parser.ts         # 檔案解析（PDF/DOCX/TXT/MD）
│   ├── url-parser.ts          # 網址文章擷取
│   ├── ocr-parser.ts          # OCR 圖片辨識
│   ├── supabase.ts            # Supabase 客戶端
│   └── sync.ts                # 雲端同步邏輯
├── pages/
│   ├── HomePage.tsx            # 首頁：文章列表
│   ├── AddArticlePage.tsx      # 新增文章頁
│   ├── PlayerPage.tsx          # 播放器頁
│   ├── SettingsPage.tsx        # 設定頁
│   └── PublicProfilePage.tsx   # 公開個人主頁
├── App.tsx                     # 路由設定
└── main.tsx                    # 應用進入點

extension/                      # Chrome 瀏覽器擴充功能
├── manifest.json
├── content.js
├── popup.html
└── popup.js

supabase/                       # Supabase 設定與資料庫遷移
├── config.toml
├── schema.sql
└── migrations/
```

---

## 功能詳細說明

### 文章匯入

**四種匯入方式**，滿足不同場景：

1. **貼上文字**：開啟新增頁面時自動偵測剪貼簿，也可手動貼上
2. **上傳檔案**：支援拖放或點擊上傳，格式包含 TXT、PDF（pdfjs-dist 解析）、DOCX（mammoth 解析）、Markdown
3. **網址擷取**：輸入任意文章 URL，使用 @mozilla/readability 自動提取正文
4. **OCR 辨識**：上傳圖片或截圖（PNG/JPG/BMP/WEBP），透過 Tesseract.js 在瀏覽器端辨識文字

匯入後可使用「清理文字」功能移除多餘空白和網頁雜訊。

### 語音朗讀

- **瀏覽器語音**：使用 Web Speech API，免費、零設定，語音選項取決於裝置
- **AI 語音**：串接 OpenAI TTS API（alloy / echo / fable / onyx / nova / shimmer），音質自然
- **語速控制**：0.5x ~ 5x，共 11 段
- **段落追蹤**：朗讀時自動捲動並高亮當前段落，支援左右滑動或方向鍵跳段
- **錯誤處理**：語音中斷時自動重試，失敗時提示切換語音

### 閱讀體驗

- **五種閱讀主題**：預設、復古（Sepia）、奶油（Cream）、深色、純黑（AMOLED）
- **沉浸模式**：隱藏所有控制項，全螢幕閱讀
- **速讀模式（RSVP）**：一次顯示一句話，幫助提升閱讀速度
- **Bionic 閱讀**：加粗每個字的前半部分，加速視覺掃描
- **字體大小**：14px ~ 24px 自由調整

### AI 功能

需要在設定頁填入 API Key：

- **AI 摘要**：支援 OpenAI 和 Google Gemini，一鍵生成文章重點
- **MP3 匯出**：使用 OpenAI TTS 將整篇文章轉為 MP3 下載，顯示即時進度

### 雲端同步

透過自建 Supabase 實現：

1. 在設定頁填入 Supabase URL 和 Anon Key
2. 註冊或登入帳號
3. 點擊「立即同步」上傳 / 下載文章
4. 可設定個人檔案（使用者名稱 + 顯示名稱）
5. 將文章設為公開，產生可分享的個人主頁

---

## 設定與配置

### AI 功能（選用）

在設定頁面填入 API Key 即可啟用 AI 摘要和 AI 語音：

| 服務 | 用途 | 取得方式 |
|------|------|----------|
| OpenAI | AI 語音、MP3 匯出、AI 摘要 | [platform.openai.com](https://platform.openai.com) |
| Google Gemini | AI 摘要 | [aistudio.google.com](https://aistudio.google.com) |

API Key 僅儲存在瀏覽器 localStorage，不會上傳至任何伺服器。

### 雲端同步（選用）

需要自行設定 Supabase 專案：

1. 到 [supabase.com](https://supabase.com) 建立專案
2. 執行 `supabase/schema.sql` 建立資料表
3. 在設定頁填入 Project URL 和 Anon Key

---

## 瀏覽器擴充功能

`extension/` 目錄包含 Chrome 擴充功能，可在任何網頁上一鍵擷取文章並傳送到語音朗讀器。

安裝方式：
1. 開啟 `chrome://extensions/`
2. 啟用「開發者模式」
3. 點擊「載入未封裝項目」選擇 `extension/` 資料夾

---

## PWA 安裝

本應用支援 PWA（Progressive Web App），可安裝到手機或電腦桌面：

- **iOS Safari**：點擊分享按鈕 → 加入主畫面
- **Android Chrome**：點擊網址列的安裝提示 或 選單 → 安裝應用程式
- **桌面 Chrome/Edge**：網址列右側的安裝圖示

---

## 授權

MIT License
