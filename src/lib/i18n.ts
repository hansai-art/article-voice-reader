const translations = {
  'zh-TW': {
    appTitle: '語音朗讀器',
    appSubtitle: 'Article Voice Reader',
    addArticle: '新增文章',
    pasteContent: '貼上文章內容...',
    uploadFile: '上傳檔案',
    uploadHint: '支援 TXT / PDF / DOCX / MD',
    orDivider: '或',
    startReading: '開始朗讀',
    play: '播放',
    pause: '暫停',
    speed: '語速',
    voice: '語音',
    resumeReading: '繼續上次閱讀',
    characters: '字',
    progress: '進度',
    back: '返回',
    delete: '刪除',
    lastRead: '上次閱讀',
    notStarted: '未開始',
    noArticles: '還沒有文章',
    noArticlesHint: '點擊上方按鈕新增文章',
    wordCount: '字數',
    estimatedTime: '預估時間',
    minutes: '分鐘',
    noVoices: '找不到可用的語音',
    fileTooLarge: '檔案過大（超過 10MB），建議使用 TXT 格式',
    unsupportedFormat: '不支援的檔案格式',
    screenOffWarning: '螢幕關閉可能會中斷朗讀',
    settings: '設定',
    language: '語言',
    editTitle: '編輯標題',
    ago: '前',
    hoursAgo: '小時前',
    minutesAgo: '分鐘前',
    justNow: '剛剛',
    daysAgo: '天前',
    darkMode: '深色模式',
    lightMode: '淺色模式',
    systemTheme: '跟隨系統',
    remaining: '剩餘',
    ttsError: '語音播放失敗，請嘗試切換語音',
    ttsRetrying: '語音播放中斷，正在重試...',
    wakeLockActive: '螢幕保持開啟中',
    saveTitle: '儲存',
    cancelEdit: '取消',
    titlePlaceholder: '輸入文章標題...',
    keyboardShortcuts: '快捷鍵',
    spaceToPlay: '空白鍵 播放/暫停',
    arrowToSkip: '← → 跳段',
    deleteConfirm: '確定要刪除這篇文章嗎？',
    confirm: '確定',
    cancel: '取消',
  },
  en: {
    appTitle: 'Voice Reader',
    appSubtitle: 'Article Voice Reader',
    addArticle: 'Add Article',
    pasteContent: 'Paste article content...',
    uploadFile: 'Upload File',
    uploadHint: 'Supports TXT / PDF / DOCX / MD',
    orDivider: 'or',
    startReading: 'Start Reading',
    play: 'Play',
    pause: 'Pause',
    speed: 'Speed',
    voice: 'Voice',
    resumeReading: 'Resume Reading',
    characters: 'chars',
    progress: 'Progress',
    back: 'Back',
    delete: 'Delete',
    lastRead: 'Last read',
    notStarted: 'Not started',
    noArticles: 'No articles yet',
    noArticlesHint: 'Tap the button above to add one',
    wordCount: 'Word count',
    estimatedTime: 'Est. time',
    minutes: 'min',
    noVoices: 'No voices available',
    fileTooLarge: 'File too large (>10MB). Try TXT format.',
    unsupportedFormat: 'Unsupported file format',
    screenOffWarning: 'Screen off may interrupt playback',
    settings: 'Settings',
    language: 'Language',
    editTitle: 'Edit title',
    ago: ' ago',
    hoursAgo: 'h ago',
    minutesAgo: 'm ago',
    justNow: 'just now',
    daysAgo: 'd ago',
    darkMode: 'Dark mode',
    lightMode: 'Light mode',
    systemTheme: 'System',
    remaining: 'remaining',
    ttsError: 'Voice playback failed. Try switching voice.',
    ttsRetrying: 'Playback interrupted, retrying...',
    wakeLockActive: 'Screen kept awake',
    saveTitle: 'Save',
    cancelEdit: 'Cancel',
    titlePlaceholder: 'Enter article title...',
    keyboardShortcuts: 'Shortcuts',
    spaceToPlay: 'Space to play/pause',
    arrowToSkip: '← → to skip',
    deleteConfirm: 'Delete this article?',
    confirm: 'Confirm',
    cancel: 'Cancel',
  },
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = keyof (typeof translations)['zh-TW'];

const LANG_KEY = 'article-reader-lang';

export function getLanguage(): Language {
  return (localStorage.getItem(LANG_KEY) as Language) || 'zh-TW';
}

export function setLanguage(lang: Language) {
  localStorage.setItem(LANG_KEY, lang);
}

export function t(key: TranslationKey, lang?: Language): string {
  const l = lang || getLanguage();
  return translations[l]?.[key] || translations['zh-TW'][key] || key;
}

export function formatTimeAgo(timestamp: number, lang?: Language): string {
  const l = lang || getLanguage();
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('justNow', l);
  if (minutes < 60) return `${minutes}${t('minutesAgo', l)}`;
  if (hours < 24) return `${hours}${t('hoursAgo', l)}`;
  return `${days}${t('daysAgo', l)}`;
}
