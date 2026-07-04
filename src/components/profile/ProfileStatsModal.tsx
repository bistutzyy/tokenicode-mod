import { useEffect, useMemo, useState } from 'react';
import { bridge, type ProfileStats } from '../../lib/tauri-bridge';
import { useSettingsStore, MODEL_OPTIONS } from '../../stores/settingsStore';
import { useUsageStore } from '../../stores/usageStore';
import { useT } from '../../lib/i18n';

// Profile usage stats modal — opened by clicking the sidebar avatar.
// Graphical: 5-cell stat grid, GitHub-style 53-week heatmap, daily/weekly/total
// bar charts, top-models list. Data comes from `get_profile_stats` (aggregates
// tracked CLI session JSONL in ~/.claude/projects/). Ported from the reference
// 二创 (mistydew/tokenicode-deepseek-alpha), with i18n + MODEL_OPTIONS display.

interface Props {
  open: boolean;
  onClose: () => void;
}

type ActivityView = 'daily' | 'weekly' | 'total';

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function levelFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.45) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}

function heatColor(level: number): string {
  switch (level) {
    case 4: return '#e98d82';
    case 3: return '#f2aaa0';
    case 2: return '#f6c8b8';
    case 1: return '#f7ded0';
    default: return 'rgba(188, 144, 123, 0.13)';
  }
}

export function ProfileStatsModal({ open, onClose }: Props) {
  const t = useT();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<ActivityView>('daily');
  const userAvatarUrl = useSettingsStore((s) => s.userAvatarUrl);
  const userDisplayName = useSettingsStore((s) => s.userDisplayName);
  const locale = useSettingsStore((s) => s.locale);
  const balance = useUsageStore((s) => s.balance);
  const refreshBalance = useUsageStore((s) => s.refreshBalance);

  const formatTokens = (value: number): string => {
    if (!value) return '0';
    if (locale === 'zh') {
      if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
      if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
      return value.toLocaleString();
    }
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return value.toLocaleString();
  };

  const monthLabel = (date: Date): string => {
    if (locale === 'zh') return `${date.getMonth() + 1}月`;
    return date.toLocaleString('en', { month: 'short' });
  };

  const displayModelName = (id: string): string =>
    MODEL_OPTIONS.find((m) => id.includes(m.id))?.short ?? id;

  const loadStats = async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await bridge.getProfileStats());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadBalance = () => {
    refreshBalance().catch(() => {});
  };

  useEffect(() => {
    if (open) {
      loadStats();
      loadBalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dailyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of stats?.daily ?? []) {
      if (day.date !== 'unknown') map.set(day.date, day.total_tokens);
    }
    return map;
  }, [stats]);

  const heatmap = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let start = addDays(today, -364);
    start = addDays(start, -start.getDay());

    const days: { date: Date; key: string; tokens: number }[] = [];
    for (let d = start; d <= today; d = addDays(d, 1)) {
      const key = dateKey(d);
      days.push({ date: d, key, tokens: dailyMap.get(key) ?? 0 });
    }

    const weeks: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return weeks;
  }, [dailyMap]);

  const maxDay = stats?.peakDayTokens ?? 0;

  const recentDaily = useMemo(() => {
    return [...(stats?.daily ?? [])]
      .filter((d) => d.date !== 'unknown')
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 14);
  }, [stats]);

  const weekly = useMemo(() => {
    const weeks: { label: string; tokens: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 7; i >= 0; i -= 1) {
      const end = addDays(today, -i * 7);
      const start = addDays(end, -6);
      let tokens = 0;
      for (let d = start; d <= end; d = addDays(d, 1)) {
        tokens += dailyMap.get(dateKey(d)) ?? 0;
      }
      weeks.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, tokens });
    }
    return weeks;
  }, [dailyMap]);

  const maxWeek = Math.max(...weekly.map((w) => w.tokens), 1);
  const displayName = userDisplayName.trim() || 'TOKENICODE';

  if (!open) return null;

  const statCells: [string, string][] = [
    [t('profilestats.totalTokens'), formatTokens(stats?.totalTokens ?? 0)],
    [t('profilestats.peakDay'), formatTokens(stats?.peakDayTokens ?? 0)],
    [t('profilestats.sessions'), (stats?.sessionCount ?? 0).toLocaleString()],
    [t('profilestats.activeDays'), `${stats?.activeDays ?? 0} ${t('profilestats.dayUnit')}`],
    [t('profilestats.messages'), (stats?.messageCount ?? 0).toLocaleString()],
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-6 py-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
      <div className="relative w-[min(1120px,calc(100vw-48px))] max-h-[calc(100vh-64px)]
        overflow-hidden rounded-[24px] border border-border-subtle bg-bg-card shadow-2xl
        animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 z-10 p-2 rounded-full text-text-muted
            hover:text-text-primary hover:bg-bg-secondary transition-smooth"
          title={t('profilestats.close')}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>

        <div className="overflow-y-auto max-h-[calc(100vh-64px)] px-10 py-9">
          <div className="text-center">
            <div className="mx-auto w-20 h-20 rounded-[24px] overflow-hidden shadow-sm
              border border-border-subtle bg-accent/80 flex items-center justify-center">
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <svg width="40" height="40" viewBox="0 0 16 16" fill="none" stroke="white"
                  strokeWidth="1.2" strokeLinecap="round">
                  <circle cx="8" cy="5.5" r="2.5" />
                  <path d="M3 14c0-2.76 2.24-5 5-5s5 2.24 5 5" />
                </svg>
              )}
            </div>
            <h2 className="mt-4 text-[28px] font-semibold text-text-primary">{displayName}</h2>
            <p className="mt-1 text-sm text-text-muted">{t('profilestats.subtitle')}</p>
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full
              border border-border-subtle bg-bg-primary/70">
              <span className="text-xs text-text-muted">{t('profilestats.qwenBalance')}</span>
              {balance?.balance != null ? (
                <span className="text-sm font-semibold text-text-primary">
                  ¥{balance.balance.toFixed(2)}
                </span>
              ) : balance?.error ? (
                <span className="text-[11px] text-amber-500 leading-tight">
                  {t('profilestats.balanceUnavailable')}
                </span>
              ) : (
                <span className="text-[11px] text-text-tertiary">...</span>
              )}
            </div>
          </div>

          {loading && (
            <div className="mt-10 text-center text-sm text-text-muted">{t('profilestats.loading')}</div>
          )}

          {error && (
            <div className="mt-8 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              {t('profilestats.error')}{error}
            </div>
          )}

          {stats && !loading && (
            <>
              <div className="mt-9 grid grid-cols-5 rounded-[20px] border border-border-subtle
                bg-bg-primary/70 overflow-hidden">
                {statCells.map(([label, value]) => (
                  <div key={label} className="px-5 py-4 text-center border-r border-border-subtle last:border-r-0">
                    <div className="text-[18px] font-semibold text-text-primary">{value}</div>
                    <div className="mt-1 text-xs text-text-muted">{label}</div>
                  </div>
                ))}
              </div>

              <section className="mt-9">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-text-primary">{t('profilestats.tokenActivity')}</h3>
                  <div className="inline-flex rounded-full border border-border-subtle bg-bg-primary/70 p-1">
                    {(['daily', 'weekly', 'total'] as ActivityView[]).map((id) => (
                      <button
                        key={id}
                        onClick={() => setView(id)}
                        className={`px-3 py-1 rounded-full text-xs transition-smooth
                          ${view === id ? 'bg-accent text-text-inverse' : 'text-text-muted hover:text-text-primary'}`}
                      >
                        {t(`profilestats.${id}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="inline-flex gap-[5px] min-w-full">
                    {heatmap.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-[5px]">
                        {week.map((day) => {
                          const level = levelFor(day.tokens, maxDay);
                          return (
                            <div
                              key={day.key}
                              title={`${day.key}: ${formatTokens(day.tokens)} tokens`}
                              className="w-[13px] h-[13px] rounded-[4px] border border-white/35"
                              style={{ background: heatColor(level) }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-2 flex justify-between text-xs text-text-tertiary">
                  {heatmap
                    .filter((week) => week[0]?.date.getDate() <= 7)
                    .slice(-12)
                    .map((week) => (
                      <span key={week[0].key}>{monthLabel(week[0].date)}</span>
                    ))}
                </div>
              </section>

              <div className="mt-9 grid grid-cols-[1fr_0.95fr] gap-10">
                <section>
                  <h3 className="text-base font-semibold text-text-primary mb-4">{t('profilestats.insights')}</h3>
                  {view === 'daily' && (
                    <div className="space-y-2">
                      {recentDaily.length ? recentDaily.map((day) => (
                        <div key={day.date} className="flex items-center gap-3 text-sm">
                          <span className="w-24 text-text-muted">{day.date.slice(5)}</span>
                          <div className="h-2 flex-1 rounded-full bg-bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${Math.max(3, day.total_tokens / Math.max(maxDay, 1) * 100)}%` }}
                            />
                          </div>
                          <span className="w-20 text-right text-text-primary">{formatTokens(day.total_tokens)}</span>
                        </div>
                      )) : (
                        <p className="text-sm text-text-muted">{t('profilestats.noActivity')}</p>
                      )}
                    </div>
                  )}
                  {view === 'weekly' && (
                    <div className="space-y-2">
                      {weekly.map((week) => (
                        <div key={week.label} className="flex items-center gap-3 text-sm">
                          <span className="w-24 text-text-muted">{week.label}</span>
                          <div className="h-2 flex-1 rounded-full bg-bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${Math.max(3, week.tokens / maxWeek * 100)}%` }}
                            />
                          </div>
                          <span className="w-20 text-right text-text-primary">{formatTokens(week.tokens)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {view === 'total' && (
                    <div className="space-y-3 text-sm">
                      {([
                        ['profilestats.inputTokens', stats.totalInputTokens],
                        ['profilestats.cacheTokens', stats.totalCacheTokens],
                        ['profilestats.outputTokens', stats.totalOutputTokens],
                      ] as [string, number][]).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between border-b border-border-subtle pb-2">
                          <span className="text-text-muted">{t(key)}</span>
                          <span className="font-medium text-text-primary">{formatTokens(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-base font-semibold text-text-primary mb-4">{t('profilestats.topModels')}</h3>
                  <div className="space-y-3">
                    {stats.models.length ? stats.models.map((model) => (
                      <div key={model.model} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                            stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                            <path d="M8 1.5l5.5 3.2v6.6L8 14.5l-5.5-3.2V4.7L8 1.5z" />
                            <path d="M2.8 4.9L8 8l5.2-3.1M8 8v6" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-text-primary truncate">{displayModelName(model.model)}</div>
                          <div className="text-xs text-text-tertiary">{model.message_count} {t('profilestats.responses')}</div>
                        </div>
                        <div className="text-sm text-text-muted">{formatTokens(model.total_tokens)}</div>
                      </div>
                    )) : (
                      <p className="text-sm text-text-muted">{t('profilestats.noModels')}</p>
                    )}
                  </div>
                </section>
              </div>

              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => { loadStats(); loadBalance(); }}
                  className="px-4 py-2 rounded-full border border-border-subtle text-sm text-text-muted
                    hover:text-text-primary hover:bg-bg-secondary transition-smooth"
                >
                  {t('profilestats.refresh')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
