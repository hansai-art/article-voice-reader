/**
 * Device diagnostics + TTS error tracking.
 * Auto-detects device/browser/OS, logs TTS events for debugging.
 */

import { getSupabase, getUser } from './supabase';

const DIAG_KEY = 'article-reader-diagnostics';
const MAX_LOGS = 200;
const REPORT_BATCH_KEY = 'article-reader-diag-pending';
const REPORT_INTERVAL = 60000; // batch upload every 60s
export const DIAG_UPDATED_EVENT = 'article-reader-diagnostics-updated';
let reportTimer: ReturnType<typeof setTimeout> | null = null;

type DiagnosticsAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export type DiagLogType =
  | 'tts_error'
  | 'tts_stall'
  | 'tts_skip'
  | 'tts_retry'
  | 'tts_watchdog'
  | 'tts_watchdog_exhausted'
  | 'sync_error'
  | 'info';

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
  type: DiagLogType;
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
    const m = ua.match(/OS (\d+[_.]\d+[_.]?\d*)/);
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
    const AudioContextCtor = window.AudioContext || (window as DiagnosticsAudioWindow).webkitAudioContext;
    if (AudioContextCtor) {
      const ctx = new AudioContextCtor();
      audioContext = true;
      // AudioContext close can fail on some browsers during capability probing; safe to ignore here.
      void ctx.close().catch(() => {});
    }
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

function notifyDiagnosticsUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DIAG_UPDATED_EVENT));
  }
}

export type PlaybackStatus = 'ready' | 'attention' | 'setup';

export function getPlaybackErrorCount(logs: DiagLog[]): number {
  return logs.filter((log) =>
    log.type === 'tts_error'
    || log.type === 'tts_stall'
    || log.type === 'tts_watchdog'
    || log.type === 'tts_watchdog_exhausted'
  ).length;
}

export function getPlaybackSkipCount(logs: DiagLog[]): number {
  return logs.filter((log) => log.type === 'tts_skip').length;
}

export function getPlaybackStatus(device: DeviceInfo, logs: DiagLog[]): PlaybackStatus {
  if (!device.speechSynthesis) return 'setup';
  const limits = getTTSLimits(device);
  if (getPlaybackErrorCount(logs) > 0 || limits.needsUserGesture) return 'attention';
  return 'ready';
}

export function diagLog(type: DiagLog['type'], message: string, meta?: Record<string, unknown>) {
  const data = loadData();
  data.device = detectDevice();
  data.lastSeen = Date.now();
  const log: DiagLog = { ts: Date.now(), type, message, meta };
  data.logs.push(log);
  if (data.logs.length > MAX_LOGS) {
    data.logs = data.logs.slice(-MAX_LOGS);
  }
  saveData(data);
  notifyDiagnosticsUpdated();
  // Queue error types for remote reporting
  queueForReport(log);
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
  notifyDiagnosticsUpdated();
}

// ── Remote error reporting (Supabase) ──

function getPendingReports(): DiagLog[] {
  try {
    return JSON.parse(localStorage.getItem(REPORT_BATCH_KEY) || '[]');
  } catch { return []; }
}

function savePendingReports(logs: DiagLog[]) {
  try {
    localStorage.setItem(REPORT_BATCH_KEY, JSON.stringify(logs));
  } catch { /* */ }
}

function queueForReport(log: DiagLog) {
  // Only report errors, not info
  if (log.type === 'info') return;
  const pending = getPendingReports();
  pending.push(log);
  // Cap pending to avoid localStorage bloat
  if (pending.length > 50) pending.splice(0, pending.length - 50);
  savePendingReports(pending);
  scheduleFlush();
}

function scheduleFlush() {
  if (reportTimer) return;
  reportTimer = setTimeout(() => {
    reportTimer = null;
    flushReports();
  }, REPORT_INTERVAL);
}

async function flushReports() {
  const pending = getPendingReports();
  if (pending.length === 0) return;

  const sb = getSupabase();
  if (!sb) return;

  // Get user (optional, anonymous reports are fine)
  let userId: string | null = null;
  try {
    const user = await getUser();
    userId = user?.id || null;
  } catch { /* */ }

  const device = detectDevice();
  const rows = pending.map((log) => ({
    user_id: userId,
    event_type: log.type,
    message: log.message,
    meta: log.meta || {},
    device_os: `${device.os} ${device.osVersion}`,
    device_browser: `${device.browser} ${device.browserVersion}`,
    device_mobile: device.mobile,
    screen: `${device.screenWidth}x${device.screenHeight}`,
    created_at: new Date(log.ts).toISOString(),
  }));

  const { error } = await sb.from('error_reports').insert(rows);
  if (!error) {
    // Clear pending on success
    savePendingReports([]);
  } else {
    console.warn('[diagnostics] Failed to flush reports:', error.message);
  }
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushReports();
    }
  });
}

// ── Summary for display ──

export function getDiagSummary(): string {
  const d = detectDevice();
  const data = getDiagData();
  const errorCount = getPlaybackErrorCount(data.logs);
  const skipCount = getPlaybackSkipCount(data.logs);
  const limits = getTTSLimits(d);

  return [
    `${d.os} ${d.osVersion} / ${d.browser} ${d.browserVersion}`,
    `${d.mobile ? 'Mobile' : 'Desktop'} ${d.screenWidth}x${d.screenHeight} @${d.pixelRatio}x`,
    `TTS: ${d.speechSynthesis ? 'OK' : 'N/A'} | Max: ${limits.maxUtteranceLength} chars`,
    `Errors: ${errorCount} | Skips: ${skipCount} | Logs: ${data.logs.length}`,
  ].join('\n');
}
