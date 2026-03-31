import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, Smartphone, Monitor, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getSupabase, getUser } from '@/lib/supabase';
import { useLanguage } from '@/hooks/useLanguage';

interface ErrorReport {
  id: number;
  user_id: string | null;
  event_type: string;
  message: string;
  meta: Record<string, unknown>;
  device_os: string;
  device_browser: string;
  device_mobile: boolean;
  screen: string;
  created_at: string;
}

// Admin email whitelist
const ADMIN_EMAILS = ['hanslintw@gmail.com'];

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  tts_error: { label: 'TTS Error', color: 'text-red-500' },
  tts_stall: { label: 'TTS Stall', color: 'text-orange-500' },
  tts_skip: { label: 'Skipped', color: 'text-yellow-500' },
  tts_watchdog: { label: 'Watchdog', color: 'text-orange-400' },
  tts_retry: { label: 'Retry', color: 'text-blue-400' },
  sync_error: { label: 'Sync Error', color: 'text-red-400' },
};

const AdminPage = () => {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Check admin access
  useEffect(() => {
    (async () => {
      const user = await getUser();
      if (user && ADMIN_EMAILS.includes(user.email || '')) {
        setAuthorized(true);
        fetchReports();
      } else {
        setAuthorized(false);
        setLoading(false);
      }
    })();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }

    const { data, error } = await sb.rpc('get_all_error_reports', { row_limit: 500 });
    if (error) {
      console.error('Failed to fetch reports:', error);
      setLoading(false);
      return;
    }
    setReports(data || []);
    setLoading(false);
  };

  const handleClearOld = async () => {
    const sb = getSupabase();
    if (!sb) return;
    // Delete reports older than 7 days
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await sb.rpc('delete_old_error_reports', { before_date: cutoff });
    fetchReports();
  };

  // Stats
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byDevice: Record<string, number> = {};
    const byBrowser: Record<string, number> = {};
    const uniqueUsers = new Set<string>();

    for (const r of reports) {
      byType[r.event_type] = (byType[r.event_type] || 0) + 1;
      const deviceKey = r.device_mobile ? 'Mobile' : 'Desktop';
      byDevice[deviceKey] = (byDevice[deviceKey] || 0) + 1;
      byBrowser[r.device_browser || 'Unknown'] = (byBrowser[r.device_browser || 'Unknown'] || 0) + 1;
      if (r.user_id) uniqueUsers.add(r.user_id);
    }

    return { byType, byDevice, byBrowser, uniqueUsers: uniqueUsers.size };
  }, [reports]);

  const filtered = useMemo(() => {
    if (filter === 'all') return reports;
    return reports.filter((r) => r.event_type === filter);
  }, [reports, filter]);

  if (!loading && !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center space-y-3">
          <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-lg font-bold">{lang === 'zh-TW' ? '無權限存取' : 'Access Denied'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'zh-TW' ? '僅限管理員存取' : 'Admin access only'}</p>
          <Button onClick={() => navigate('/')}>{lang === 'zh-TW' ? '返回首頁' : 'Go Home'}</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-6">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-bold flex-1">{lang === 'zh-TW' ? '錯誤監控後台' : 'Error Dashboard'}</h1>
          <Button variant="ghost" size="icon" onClick={fetchReports} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleClearOld} title={lang === 'zh-TW' ? '清除 7 天前記錄' : 'Clear older than 7 days'}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 mt-4 space-y-4">
        {/* Stats overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold">{reports.length}</p>
            <p className="text-xs text-muted-foreground">{lang === 'zh-TW' ? '總錯誤數' : 'Total Errors'}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.uniqueUsers}</p>
            <p className="text-xs text-muted-foreground">{lang === 'zh-TW' ? '受影響使用者' : 'Affected Users'}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.byDevice['Mobile'] || 0}</p>
            <p className="text-xs text-muted-foreground">{lang === 'zh-TW' ? '手機錯誤' : 'Mobile Errors'}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.byDevice['Desktop'] || 0}</p>
            <p className="text-xs text-muted-foreground">{lang === 'zh-TW' ? '桌面錯誤' : 'Desktop Errors'}</p>
          </Card>
        </div>

        {/* Breakdown by type */}
        <Card className="p-4 space-y-2">
          <h2 className="text-sm font-semibold">{lang === 'zh-TW' ? '錯誤類型分布' : 'Error Types'}</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant={filter === 'all' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs"
              onClick={() => setFilter('all')}>
              {lang === 'zh-TW' ? '全部' : 'All'} ({reports.length})
            </Button>
            {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const info = EVENT_LABELS[type] || { label: type, color: 'text-muted-foreground' };
              return (
                <Button key={type} variant={filter === type ? 'secondary' : 'ghost'} size="sm"
                  className={`h-7 text-xs ${info.color}`}
                  onClick={() => setFilter(type)}>
                  {info.label} ({count})
                </Button>
              );
            })}
          </div>
        </Card>

        {/* Breakdown by browser */}
        <Card className="p-4 space-y-2">
          <h2 className="text-sm font-semibold">{lang === 'zh-TW' ? '瀏覽器分布' : 'Browsers'}</h2>
          <div className="space-y-1">
            {Object.entries(stats.byBrowser).sort((a, b) => b[1] - a[1]).map(([browser, count]) => (
              <div key={browser} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{browser}</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Error list */}
        <h2 className="text-sm font-semibold pt-2">
          {lang === 'zh-TW' ? `錯誤記錄 (${filtered.length})` : `Error Logs (${filtered.length})`}
        </h2>
        <div className="space-y-2">
          {filtered.map((r) => {
            const info = EVENT_LABELS[r.event_type] || { label: r.event_type, color: '' };
            const expanded = expandedId === r.id;
            return (
              <Card key={r.id} className="p-3 cursor-pointer" onClick={() => setExpandedId(expanded ? null : r.id)}>
                <div className="flex items-start gap-2">
                  {r.device_mobile ? <Smartphone className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    : <Monitor className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${info.color}`}>{info.label}</span>
                      <span className="text-[10px] text-muted-foreground">{r.device_os} / {r.device_browser}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{r.message}</p>
                    {expanded && (
                      <div className="mt-2 space-y-1 text-[11px]">
                        <p><span className="font-semibold">Screen:</span> {r.screen}</p>
                        <p><span className="font-semibold">User:</span> {r.user_id || '(anonymous)'}</p>
                        {r.meta && Object.keys(r.meta).length > 0 && (
                          <pre className="bg-muted/50 rounded p-2 text-[10px] overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(r.meta, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                  {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && !loading && (
            <p className="text-center text-sm text-muted-foreground py-8">
              {lang === 'zh-TW' ? '目前沒有錯誤記錄' : 'No error reports yet'}
            </p>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminPage;
