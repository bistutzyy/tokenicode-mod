import { useEffect, useState, useCallback } from 'react';
import { bridge, type VisionCredentials } from '../../lib/tauri-bridge';
import { useT } from '../../lib/i18n';

const DEFAULT_VL_MODEL = 'qwen-vl-max';

function emptyCreds(): VisionCredentials {
  return {
    qwen: { apiKey: '', vlModel: DEFAULT_VL_MODEL, enabled: true },
    volc: { ak: '', sk: '', enabled: false },
  };
}

const inputCls =
  'w-full px-2.5 py-1.5 rounded-lg text-[13px] bg-bg-secondary border border-border-subtle ' +
  'text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent/50 transition-smooth ' +
  'font-mono';

/** Small accessibly-labelled toggle. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-smooth ${
        checked ? 'bg-accent' : 'bg-bg-tertiary border border-border-subtle'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-smooth ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}

export function VisionTab() {
  const t = useT();
  const [creds, setCreds] = useState<VisionCredentials>(emptyCreds());
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [balanceMsg, setBalanceMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

  // Load stored credentials on mount; prefill qwen apiKey from providers.json
  // (qwen preset / dashscope baseUrl) when nothing is stored yet — prefill is
  // NOT auto-saved, the user must hit Save.
  useEffect(() => {
    (async () => {
      let merged = emptyCreds();
      try {
        const stored = await bridge.loadVisionCredentials();
        merged = {
          qwen: {
            apiKey: stored.qwen?.apiKey ?? '',
            vlModel: stored.qwen?.vlModel || DEFAULT_VL_MODEL,
            enabled: stored.qwen?.enabled ?? true,
          },
          volc: {
            ak: stored.volc?.ak ?? '',
            sk: stored.volc?.sk ?? '',
            enabled: stored.volc?.enabled ?? false,
          },
        };
      } catch (e) {
        console.error('[VisionTab] load credentials failed:', e);
      }
      if (!merged.qwen.apiKey) {
        try {
          const pf = await bridge.loadProviders();
          const qwenP = pf.providers.find(
            (p) => p.preset === 'qwen' || /dashscope/i.test(p.baseUrl),
          );
          if (qwenP?.apiKey) {
            merged.qwen.apiKey = qwenP.apiKey;
            setPrefilled(true);
          }
        } catch {
          /* providers.json unreadable — ignore */
        }
      }
      setCreds(merged);
      setLoaded(true);
    })();
  }, []);

  const setQwen = useCallback((patch: Partial<VisionCredentials['qwen']>) => {
    setCreds((c) => ({ ...c, qwen: { ...c.qwen, ...patch } }));
  }, []);
  const setVolc = useCallback((patch: Partial<VisionCredentials['volc']>) => {
    setCreds((c) => ({ ...c, volc: { ...c.volc, ...patch } }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      await bridge.saveVisionCredentials(creds);
      setSavedMsg(t('settings.vision.saved'));
      setPrefilled(false);
      setTimeout(() => setSavedMsg(''), 2500);
    } catch (e) {
      setSavedMsg(String(e));
    } finally {
      setSaving(false);
    }
  }, [creds, t]);

  const handleTestBalance = useCallback(async () => {
    setTesting(true);
    setBalanceMsg(null);
    try {
      const r = await bridge.queryQwenBalance();
      if (r.balance != null) {
        setBalanceMsg({
          ok: true,
          text: `${t('settings.vision.balanceOk')}: ¥${r.balance.toFixed(2)}`,
        });
      } else {
        setBalanceMsg({
          ok: false,
          text: r.error
            ? `${t('settings.vision.balanceFail')}: ${r.error}`
            : t('settings.vision.balanceFail'),
        });
      }
    } catch (e) {
      setBalanceMsg({ ok: false, text: String(e) });
    } finally {
      setTesting(false);
    }
  }, [t]);

  if (!loaded) {
    return <div className="text-[13px] text-text-tertiary">...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Intro */}
      <p className="text-[12px] leading-relaxed text-text-tertiary">
        {t('settings.vision.desc')}
      </p>

      {/* Qwen section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-text-primary">
            {t('settings.vision.qwenSection')}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-text-muted">
              {t('settings.vision.enabled')}
            </span>
            <Toggle
              checked={creds.qwen.enabled}
              onChange={(v) => setQwen({ enabled: v })}
              label={t('settings.vision.enabled')}
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] text-text-muted mb-1">
            {t('settings.vision.qwenApiKey')}
          </label>
          <input
            type={showSecrets ? 'text' : 'password'}
            value={creds.qwen.apiKey}
            onChange={(e) => {
              setQwen({ apiKey: e.target.value });
              setPrefilled(false);
            }}
            placeholder={t('settings.vision.qwenApiKeyPlaceholder')}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
          {prefilled && (
            <p className="mt-1 text-[11px] text-amber-500">
              {t('settings.vision.prefillHint')}
            </p>
          )}
        </div>

        <div>
          <label className="block text-[12px] text-text-muted mb-1">
            {t('settings.vision.qwenVlModel')}
          </label>
          <input
            type="text"
            value={creds.qwen.vlModel}
            onChange={(e) => setQwen({ vlModel: e.target.value })}
            placeholder={DEFAULT_VL_MODEL}
            className={inputCls}
            spellCheck={false}
          />
        </div>
      </div>

      {/* Volc section (reserved) */}
      <div className="space-y-3 pt-2 border-t border-border-subtle">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-text-primary">
            {t('settings.vision.volcSection')}
            <span className="ml-2 text-[11px] text-text-tertiary font-normal">
              {t('settings.vision.volcReserved')}
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-text-muted">
              {t('settings.vision.enabled')}
            </span>
            <Toggle
              checked={creds.volc.enabled}
              onChange={(v) => setVolc({ enabled: v })}
              label={t('settings.vision.enabled')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] text-text-muted mb-1">
              {t('settings.vision.volcAk')}
            </label>
            <input
              type={showSecrets ? 'text' : 'password'}
              value={creds.volc.ak}
              onChange={(e) => setVolc({ ak: e.target.value })}
              placeholder="AK..."
              className={inputCls}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="block text-[12px] text-text-muted mb-1">
              {t('settings.vision.volcSk')}
            </label>
            <input
              type={showSecrets ? 'text' : 'password'}
              value={creds.volc.sk}
              onChange={(e) => setVolc({ sk: e.target.value })}
              placeholder="SK..."
              className={inputCls}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-border-subtle">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium
            bg-accent text-text-inverse hover:bg-accent-hover transition-smooth
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('settings.vision.saving') : t('settings.vision.save')}
        </button>
        <button
          onClick={handleTestBalance}
          disabled={testing}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium
            border border-border-subtle text-text-muted
            hover:bg-bg-secondary hover:text-text-primary transition-smooth
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? t('settings.vision.testing') : t('settings.vision.testBalance')}
        </button>
        <label className="flex items-center gap-1.5 text-[12px] text-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showSecrets}
            onChange={(e) => setShowSecrets(e.target.checked)}
            className="accent-accent"
          />
          {t('settings.vision.showSecrets')}
        </label>
        {savedMsg && (
          <span className="text-[12px] text-green-500">{savedMsg}</span>
        )}
        {balanceMsg && (
          <span
            className={`text-[12px] ${balanceMsg.ok ? 'text-green-500' : 'text-amber-500'}`}
          >
            {balanceMsg.text}
          </span>
        )}
      </div>
    </div>
  );
}
