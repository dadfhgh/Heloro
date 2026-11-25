import { describe, expect, it, vi } from "vitest";
import { resetDirectChatPanels, type DirectChatPanelSetters } from "./messengerNavigation";

describe("resetDirectChatPanels", () => {
  it("closes every panel that can cover a direct conversation", () => {
    const setters: DirectChatPanelSetters = {
      setShowNavigation: vi.fn(),
      setShowSettings: vi.fn(),
      setShowProfile: vi.fn(),
      setShowBots: vi.fn(),
      setShowComposeScreen: vi.fn(),
      setShowContactsScreen: vi.fn(),
      setShowSavedMessages: vi.fn(),
      setFolderManagerOpen: vi.fn(),
    };

    resetDirectChatPanels(setters);

    for (const setter of Object.values(setters)) {
      expect(setter).toHaveBeenCalledExactlyOnceWith(false);
    }
  });
});
