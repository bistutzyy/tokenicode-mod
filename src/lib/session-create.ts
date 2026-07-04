import { useSettingsStore } from '../stores/settingsStore';
import { useChatStore } from '../stores/chatStore';
import { useSessionStore } from '../stores/sessionStore';
import { useAgentStore } from '../stores/agentStore';

/**
 * Switch the working directory to `path` and start a fresh draft conversation
 * in it.
 *
 * Saves the currently-selected tab to cache, creates a new draft session, and
 * selects it — landing the UI on the EmptyReadyState (project welcome state)
 * so the user can type to start a new conversation that ConversationList will
 * group under this project. This is the shared implementation behind both the
 * sidebar project list click ("switch + restart conversation") and the
 * ConversationList "new session in project" action.
 *
 * Returns the new draft id.
 */
export function newSessionInProject(path: string): string {
  useSettingsStore.getState().setWorkingDirectory(path);

  // Save the currently-selected tab to cache before swapping it out.
  const currentTabId = useSessionStore.getState().selectedSessionId;
  if (currentTabId) {
    useChatStore.getState().saveToCache(currentTabId);
    useAgentStore.getState().saveToCache(currentTabId);
  }

  const newDraftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  useChatStore.getState().ensureTab(newDraftId);
  useChatStore.getState().resetTab(newDraftId);
  useSessionStore.getState().addDraftSession(newDraftId, path);
  // addDraftSession already selects the new id, but set it explicitly so the
  // helper's contract doesn't rely on that side effect.
  useSessionStore.getState().setSelectedSession(newDraftId);
  return newDraftId;
}
