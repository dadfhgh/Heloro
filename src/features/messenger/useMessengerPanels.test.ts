import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMessengerPanels } from "./useMessengerPanels";

describe("useMessengerPanels", () => {
  it("starts with every top-level panel closed", () => {
    const { result } = renderHook(() => useMessengerPanels());

    expect(result.current.showNavigation).toBe(false);
    expect(result.current.showSettings).toBe(false);
    expect(result.current.showProfile).toBe(false);
    expect(result.current.showBots).toBe(false);
    expect(result.current.showComposeScreen).toBe(false);
    expect(result.current.showContactsScreen).toBe(false);
    expect(result.current.showSavedMessages).toBe(false);
    expect(result.current.folderManagerOpen).toBe(false);
  });

  it("updates the selected panel state without changing other panels", () => {
    const { result } = renderHook(() => useMessengerPanels());

    act(() => result.current.setShowNavigation(true));

    expect(result.current.showNavigation).toBe(true);
    expect(result.current.showSettings).toBe(false);
    expect(result.current.showProfile).toBe(false);
  });
});
