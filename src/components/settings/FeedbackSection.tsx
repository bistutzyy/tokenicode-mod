/**
 * FeedbackSection — "提交反馈" UI in Settings > General.
 *
 * Collects free-text feedback + optional contact + optional screenshot,
 * bundles diagnostic metadata (app version, provider, model, session id,
 * locale) and ships to Feishu via the self-built app webhook in Rust.
 *
 * The submit button is disabled when FEISHU_* env vars weren't baked in at
 * build time. Frontend polls `feedbackIsConfigured()` on mount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { bridge, type FeedbackMetadata } from '../../lib/tauri-bridge';
import { useSettingsStore } from '../../stores/settingsStore';
import { useProviderStore } from '../../stores/providerStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useChatStore } from '../../stores/chatStore';
import { useT } from '../../lib/i18n';
import { APP_NAME } from '../../lib/edition';

type SubmitState = 'idle' | 'sending' | 'success' | 'error';

export function FeedbackSection() {
  const t = useT();
  const locale = useSettingsStore((s) => s.locale);
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [screenshot, setScreenshot] = useState<{ dataUrl: string; base64: string; bytes: number } | null>(null);
  const [state, setState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Probe config + read app version once on mount
  useEffect(() => {
    bridge.feedbackIsConfigured().then(setConfigured).catch(() => setConfigured(false));
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion().then(setAppVersion))
      .catch(() => {});
  }, []);

  const readImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg(t('feedback.imageOnly'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg(t('feedback.imageTooLarge'));
      return;
    }
    setErrorMsg('');
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Convert to base64 without using Buffer (browser-safe)
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const dataUrl = `data:${file.type};base64,${base64}`;
    setScreenshot({ dataUrl, base64, bytes: file.size });
  }, [t]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await readImageFile(file);
    // Allow re-selecting the same file
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [readImageFile]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await readImageFile(file);
          break;
        }
      }
    }
  }, [readImageFile]);

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) {
      setErrorMsg(t('feedback.emptyDescription'));
      return;
    }
    setState('sending');
    setErrorMsg('');

    // Assemble metadata from stores at submit time
    const activeProviderId = useProviderStore.getState().activeProviderId;
    const providers = useProviderStore.getState().providers;
    const providerName = activeProviderId
      ? providers.find((p) => p.id === activeProviderId)?.name
      : undefined;
    const selectedTabId = useSessionStore.getState().selectedSessionId;
    const sessionMeta = selectedTabId
      ? useChatStore.getState().getTab(selectedTabId)?.sessionMeta
      : undefined;

    const metadata: FeedbackMetadata = {
      app_name: APP_NAME,
      app_version: appVersion || 'unknown',
      locale,
      provider_name: providerName,
      model: useSettingsStore.getState().selectedModel,
      session_id: sessionMeta?.sessionId,
      user_contact: contact.trim() || undefined,
    };

    try {
      await bridge.submitFeedback({
        description: description.trim(),
        screenshotBase64: screenshot?.base64,
        metadata,
      });
      setState('success');
      setDescription('');
      setContact('');
      setScreenshot(null);
      // Reset to idle after a brief confirmation window
      setTimeout(() => setState('idle'), 3000);
    } catch (err) {
      setErrorMsg(String(err));
      setState('error');
    }
  }, [description, contact, screenshot, appVersion, locale, t]);

  const isDisabled = state === 'sending' || configured === false;

  return (
    <div className="mt-6 pt-6 border-t border-border-subtle">
      <h3 className="text-[13px] font-medium text-text-primary mb-1">
        {t('feedback.title')}
      </h3>
      <p className="text-[11px] text-text-tertiary mb-3">
        {t('feedback.subtitle')}
      </p>

      {configured === false && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {t('feedback.notConfigured')}
          </p>
        </div>
      )}

      {/* Description */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onPaste={handlePaste}
        placeholder={t('feedback.descriptionPlaceholder')}
        rows={4}
        maxLength={5000}
        disabled={isDisabled}
        className="w-full px-3 py-2 rounded-lg border border-border-subtle
          bg-bg-secondary text-[13px] text-text-primary placeholder:text-text-tertiary
          focus:outline-none focus:border-accent/60 transition-smooth resize-none
          disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-between mt-1.5 text-[10px] text-text-tertiary">
        <span>{t('feedback.pasteHint')}</span>
        <span>{description.length}/5000</span>
      </div>

      {/* Screenshot preview / add button */}
      <div className="mt-3">
        {screenshot ? (
          <div className="relative inline-block">
            <img
              src={screenshot.dataUrl}
              alt="screenshot"
              className="max-h-32 rounded-lg border border-border-subtle"
            />
            <button
              onClick={() => setScreenshot(null)}
              disabled={isDisabled}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-bg-card
                border border-border-subtle text-text-muted hover:text-text-primary
                flex items-center justify-center shadow-sm transition-smooth
                disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('feedback.removeScreenshot')}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={handleFileSelect}
            disabled={isDisabled}
            className="px-2.5 py-1.5 text-[11px] rounded-md border border-dashed
              border-border-subtle text-text-muted hover:text-text-primary
              hover:bg-bg-secondary transition-smooth
              disabled:opacity-50 disabled:cursor-not-allowed
              inline-flex items-center gap-1.5"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
            {t('feedback.addScreenshot')}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Optional contact */}
      <div className="mt-3">
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          disabled={isDisabled}
          placeholder={t('feedback.contactPlaceholder')}
          maxLength={100}
          className="w-full px-3 py-1.5 rounded-lg border border-border-subtle
            bg-bg-secondary text-[12px] text-text-primary placeholder:text-text-tertiary
            focus:outline-none focus:border-accent/60 transition-smooth
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Error / success state */}
      {errorMsg && state === 'error' && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-[11px] text-red-500 break-words">{errorMsg}</p>
        </div>
      )}
      {state === 'success' && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30">
          <p className="text-[11px] text-green-600 dark:text-green-400">
            {t('feedback.successMessage')}
          </p>
        </div>
      )}

      {/* Submit */}
      <div className="mt-3 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={isDisabled || !description.trim()}
          className="px-4 py-1.5 rounded-lg bg-accent text-text-inverse
            text-[12px] font-medium hover:bg-accent-hover transition-smooth
            disabled:opacity-40 disabled:cursor-not-allowed
            inline-flex items-center gap-1.5"
        >
          {state === 'sending' && (
            <span className="w-3 h-3 border-[1.5px] border-text-inverse/30
              border-t-text-inverse rounded-full animate-spin" />
          )}
          {state === 'sending' ? t('feedback.sending') : t('feedback.submit')}
        </button>
      </div>
    </div>
  );
}
