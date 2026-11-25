export type DirectChatPanelSetters = {
  setShowNavigation: (open: boolean) => void;
  setShowSettings: (open: boolean) => void;
  setShowProfile: (open: boolean) => void;
  setShowBots: (open: boolean) => void;
  setShowComposeScreen: (open: boolean) => void;
  setShowContactsScreen: (open: boolean) => void;
  setShowSavedMessages: (open: boolean) => void;
  setFolderManagerOpen: (open: boolean) => void;
};

/**
 * Close every mutually-exclusive panel before a direct conversation becomes
 * the active mobile destination. Keep this list centralized and unit-tested.
 */
export function resetDirectChatPanels(setters: DirectChatPanelSetters): void {
  setters.setShowNavigation(false);
  setters.setShowSettings(false);
  setters.setShowProfile(false);
  setters.setShowBots(false);
  setters.setShowComposeScreen(false);
  setters.setShowContactsScreen(false);
  setters.setShowSavedMessages(false);
  setters.setFolderManagerOpen(false);
}
