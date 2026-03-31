/**
 * Device diagnostics + TTS error tracking.
 * Auto-detects device/browser/OS, logs TTS events for debugging.
 */

const DIAG_KEY = 'article-reader-diagnostics';
const MAX_LOGS = 200;

export interface DeviceInfo {
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  mobile: boolean;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  userAgent: string;
  touchPoints: number;
  audioContext: boolean;
  speechSynthesis: boolean;
  serviceWorker: boolean;
  standalone: boolean; // PWA mode
}

export interface DiagLog {
  ts: number;
  type: 'tts_error' | 'tts_stall' | 'tts_skip' | 'tts_retry' | 'tts_watchdog' | 'sync_error' | 'info';
  message: string;
  meta?: Record<string, unknown>;
}

export interface DiagData {
  device: DeviceInfo;
  logs: DiagLog[];
  firstSeen: number;
  lastSeen: number;
}

// ── Device detection ──

function parseOS(ua: string): { os: string; version: string } {
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    const m = ua.match(/OS (\d+[_\.]\d+[_\.]?\d*)/);
    return { os: 'iOS', version: m ? m[1].replace(/_/g, '.') : 'unknown' };
  }
  if (/Android/.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/);
    return { os: 'Android', version: m ? m[1] : 'unknown' };
  }
  if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_.]+)/);
    return { os: 'macOS', version: m ? m[1].replace(/_/g, '.') : 'unknown' };
  }
  if (/Windows NT/.test(ua)) {
    const m = ua.match(/Windows NT ([\d.]+)/);
    return { os: 'Windows', version: m ? m[1] : 'unknown' };
  }
  if (/Linux/.test(ua)) return { os: 'Linux', version: '' };
  return { os: 'unknown', version: '' };
}

function parseBrowser(ua: string): { browser: string; version: string } {
  // Order matters: check specific browsers before generic ones
  if (/CriOS/.test(ua)) {
    const m = ua.match(/CriOS\/([\d.]+)/);
    return { browser: 'Chrome iOS', version: m ? m[1] : '' };
  }
  if (/FxiOS/.test(ua)) {
    const m = ua.match(/FxiOS\/([\d.]+)/);
    return { browser: 'Firefox iOS', version: m ? m[1] : '' };
  }
  if (/EdgiOS|Edg\//.test(ua)) {
    const m = ua.match(/Edg[iO]*\/([\d.]+)/);
    return { browser: 'Edge', version: m ? m[1] : '' };
  }
  if (/SamsungBrowser/.test(ua)) {
    const m = ua.match(/SamsungBrowser\/([\d.]+)/);
    return { browser: 'Samsung', version: m ? m[1] : '' };
  }
  if (/Chrome/.test(ua) && !/Chromium/.test(ua)) {
    const m = ua.match(/Chrome\/([\d.]+)/);
    return { browser: 'Chrome', version: m ? m[1] : '' };
  }
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    const m = ua.match(/Version\/([\d.]+)/);
    return { browser: 'Safari', version: m ? m[1] : '' };
  }
  if (/Firefox/.test(ua)) {
    const m = ua.match(/Firefox\/([\d.]+)/);
    return { browser: 'Firefox', version: m ? m[1] : '' };
  }
  return { browser: 'unknown', version: '' };
}

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const { os, version: osVersion } = parseOS(ua);
  const { browser, version: browserVersion } = parseBrowser(ua);
  const mobile = /Mobi|Android|iPhone|iPad|iPod/.test(ua) || navigator.maxTouchPoints > 1;

  let audioContext = false;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContext = true;
    ctx.close();
  } catch { /* */ }

  return {
    os,
    osVersion,
    browser,
    browserVersion,
    mobile,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    pixelRatio: window.devicePixelRatio || 1,
    userAgent: ua,
    touchPoints: navigator.maxTouchPoints || 0,
    audioContext,
    speechSynthesis: 'speechSynthesis' in window,
    serviceWorker: 'serviceWorker' in navigator,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
  };
}

// ── Known platform TTS limits ──

export function getTTSLimits(device: DeviceInfo): { maxUtteranceLength: number; needsUserGesture: boolean; resumeWorkaround: boolean } {
  // iOS Safari: hard limit on utterance length (~200-300 chars), needs user gesture
  if (device.os === 'iOS') {
    return { maxUtteranceLength: 200, needsUserGesture: true, resumeWorkaround: false };
  }
  // Chrome (desktop + Android): resume workaround needed, ~80 char safe limit
  if (device.browser === 'Chrome' || device.browser === 'Chrome iOS' || device.browser === 'Samsung') {
    return { maxUtteranceLength: 80, needsUserGesture: false, resumeWorkaround: true };
  }
  // Firefox: generally reliable
  if (device.browser === 'Firefox' || device.browser === 'Firefox iOS') {
    return { maxUtteranceLength: 500, needsUserGesture: false, resumeWorkaround: false };
  }
  // Safari macOS: similar to iOS but less strict
  if (device.browser === 'Safari') {
    return { maxUtteranceLength: 300, needsUserGesture: false, resumeWorkaround: false };
  }
  // Default: conservative
  return { maxUtteranceLength: 80, needsUserGesture: false, resumeWorkaround: true };
}

// ── Logging ──

function loadData(): DiagData {
  try {
    const raw = localStorage.getItem(DIAG_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return { device: detectDevice(), logs: [], firstSeen: Date.now(), lastSeen: Date.now() };
}

function saveData(data: DiagData) {
  try {
    localStorage.setItem(DIAG_KEY, JSON.stringify(data));
  } catch { /* */ }
}

export function diagLog(type: DiagLog['type'], message: string, meta?: Record<string, unknown>) {
  const data = loadData();
  data.device = detectDevice(); // refresh device info
  data.lastSeen = Date.now();
  data.logs.push({ ts: Date.now(), type, message, meta });
  // Keep only last N logs
  if (data.logs.length > MAX_LOGS) {
    data.logs = data.logs.slice(-MAX_LOGS);
  }
  saveData(data);
}

export function getDiagData(): DiagData {
  const data = loadData();
  data.device = detectDevice();
  return data;
}

export function clearDiagLogs() {
  const data = loadData();
  data.logs = [];
  saveData(data);
}

// ── Summary for display ──

export function getDiagSummary(): string {
  const d = detectDevice();
  const data = getDiagData();
  const errorCount = data.logs.filter((l) => l.type === 'tts_error' || l.type === 'tts_stall').length;
  const skipCount = data.logs.filter((l) => l.type === 'tts_skip').length;
  const limits = getTTSLimits(d);

  return [
    `${d.os} ${d.osVersion} / ${d.browser} ${d.browserVersion}`,
    `${d.mobile ? 'Mobile' : 'Desktop'} ${d.screenWidth}x${d.screenHeight} @${d.pixelRatio}x`,
    `TTS: ${d.speechSynthesis ? 'OK' : 'N/A'} | Max: ${limits.maxUtteranceLength} chars`,
    `Errors: ${errorCount} | Skips: ${skipCount} | Logs: ${data.logs.length}`,
  ].join('\n');
}
