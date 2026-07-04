import { useSettingsStore } from '../../stores/settingsStore';

interface AiAvatarProps {
  /** Tailwind size class for the container, e.g. "w-8 h-8", "w-16 h-16", "w-20 h-20" */
  size: string;
  /** Tailwind border-radius class, e.g. "rounded-[10px]", "rounded-2xl", "rounded-3xl" */
  rounded?: string;
  /** Extra classes for the container */
  className?: string;
}

/**
 * AI avatar that shows a user-customized image if set, otherwise the default
 * app icon (public/app-icon.png). The custom image is stored as a data URL in
 * settingsStore.aiAvatarUrl.
 */
export function AiAvatar({ size, rounded = 'rounded-[10px]', className = '' }: AiAvatarProps) {
  const avatarUrl = useSettingsStore((s) => s.aiAvatarUrl);

  return (
    <div className={`${size} ${rounded} bg-transparent
      flex items-center justify-center flex-shrink-0 shadow-md overflow-hidden ${className}`}>
      <img src={avatarUrl || '/app-icon.png'} alt="AI" className="w-full h-full object-cover" />
    </div>
  );
}
