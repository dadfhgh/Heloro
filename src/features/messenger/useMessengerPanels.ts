import { useState } from "react";

export function useMessengerPanels() {
  const [showSettings, setShowSettings] = useState(false);
  const [showBots, setShowBots] = useState(false);
  const [showNavigation, setShowNavigation] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showComposeScreen, setShowComposeScreen] = useState(false);
  const [showContactsScreen, setShowContactsScreen] = useState(false);
  const [showSavedMessages, setShowSavedMessages] = useState(false);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);

  return {
    showSettings, setShowSettings,
    showBots, setShowBots,
    showNavigation, setShowNavigation,
    showProfile, setShowProfile,
    showComposeScreen, setShowComposeScreen,
    showContactsScreen, setShowContactsScreen,
    showSavedMessages, setShowSavedMessages,
    folderManagerOpen, setFolderManagerOpen,
  };
}
