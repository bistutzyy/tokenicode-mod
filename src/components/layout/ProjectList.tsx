import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useFileStore } from '../../stores/fileStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { bridge } from '../../lib/tauri-bridge';
import { newSessionInProject } from '../../lib/session-create';
import { useT } from '../../lib/i18n';

/**
 * Pinned project switcher — sits below the New Chat button. Lists
 * fileStore.recentProjects, highlights the active working directory, and lets
 * the user add a new folder or reveal one in the file manager. Switching calls
 * settingsStore.setWorkingDirectory + fileStore.loadTree (same path the
 * WelcomeScreen folder picker takes).
 */
export function ProjectList() {
  const t = useT();
  const recentProjects = useFileStore((s) => s.recentProjects);
  const fetchRecentProjects = useFileStore((s) => s.fetchRecentProjects);
  const loadTree = useFileStore((s) => s.loadTree);
  const workingDirectory = useSettingsStore((s) => s.workingDirectory);
  const [collapsed, setCollapsed] = useState(false);

  // Initial load
  useEffect(() => {
    fetchRecentProjects();
  }, [fetchRecentProjects]);

  // Refresh whenever the working directory changes — the backend bumps the
  // newly-touched project to the top of list_recent_projects.
  useEffect(() => {
    fetchRecentProjects();
  }, [workingDirectory, fetchRecentProjects]);

  const switchTo = async (path: string) => {
    if (!path) return;
    newSessionInProject(path);
    await loadTree(path);
  };

  const addProject = async () => {
    try {
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === 'string' && dir) {
        newSessionInProject(dir);
        await loadTree(dir);
        await fetchRecentProjects();
      }
    } catch (e) {
      console.error('[ProjectList] open directory failed:', e);
    }
  };

  return (
    <div className="px-3 mb-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-1">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide
            text-text-tertiary hover:text-text-secondary transition-smooth"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-smooth ${collapsed ? '-rotate-90' : ''}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
          {t('sidebar.projects')}
        </button>
        <button
          onClick={addProject}
          title={t('sidebar.addProject')}
          className="p-0.5 rounded hover:bg-bg-tertiary text-text-tertiary
            hover:text-text-primary transition-smooth"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>

      {/* List */}
      {!collapsed && (
        <div className="space-y-0.5 max-h-[30vh] overflow-y-auto no-scrollbar">
          {recentProjects.length === 0 ? (
            <p className="px-1 py-1.5 text-[11px] text-text-tertiary">
              {t('sidebar.projectsEmpty')}
            </p>
          ) : (
            recentProjects.map((p) => {
              const active = p.path === workingDirectory;
              return (
                <div
                  key={p.path}
                  className={`group relative flex items-center rounded-lg transition-smooth ${
                    active ? 'bg-accent/10' : 'hover:bg-bg-secondary'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-accent" />
                  )}
                  <button
                    onClick={() => switchTo(p.path)}
                    title={p.path}
                    className="flex-1 min-w-0 text-left px-2 py-1.5"
                  >
                    <div
                      className={`truncate text-[12px] ${
                        active ? 'text-accent font-medium' : 'text-text-secondary'
                      }`}
                    >
                      {p.name}
                    </div>
                    <div className="truncate text-[10px] text-text-tertiary">
                      {p.shortPath}
                    </div>
                  </button>
                  <button
                    onClick={() => bridge.revealInFinder(p.path).catch(() => {})}
                    title={t('sidebar.revealProject')}
                    className="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded
                      text-text-tertiary hover:text-text-primary transition-smooth flex-shrink-0"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 4h5l1.5 1.5H14V13H2V4z" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
