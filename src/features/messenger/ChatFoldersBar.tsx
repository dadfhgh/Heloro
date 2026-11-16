import { useEffect, useState, type FormEvent } from "react";
import { Check, Folder, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import "./MessengerLocalFeatures.css";

export type FolderChoice = {
  id: string;
  label: string;
  subtitle?: string;
};

export type ChatFolder = {
  id: string;
  name: string;
  chatIds: string[];
};

type Props = {
  userId: string;
  locale: Locale;
  choices: FolderChoice[];
  managerOpen: boolean;
  onManagerClose: () => void;
  onActiveFolderChange: (chatIds: string[] | null) => void;
};

function readFolders(userId: string): ChatFolder[] {
  try {
    const raw = window.localStorage.getItem("heloro:chat-folders:" + userId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ChatFolder =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as ChatFolder).id === "string" &&
      typeof (item as ChatFolder).name === "string" &&
      Array.isArray((item as ChatFolder).chatIds) &&
      (item as ChatFolder).chatIds.every((id) => typeof id === "string"),
    ).slice(0, 30);
  } catch {
    return [];
  }
}

function createId() {
  return "folder-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

export default function ChatFoldersBar({
  userId, locale, choices, managerOpen, onManagerClose, onActiveFolderChange,
}: Props) {
  const ru = locale === "ru";
  const [folders, setFolders] = useState<ChatFolder[]>(() => readFolders(userId));
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      window.localStorage.setItem("heloro:chat-folders:" + userId, JSON.stringify(folders));
    } catch {
      // Keep the current session usable when browser storage is unavailable.
    }
  }, [folders, userId]);

  useEffect(() => {
    if (managerOpen) setDialogOpen(true);
  }, [managerOpen]);

  useEffect(() => {
    const active = folders.find((folder) => folder.id === activeFolderId);
    onActiveFolderChange(active ? active.chatIds : null);
  }, [activeFolderId, folders, onActiveFolderChange]);

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setDraftName("");
    setSelectedIds([]);
    onManagerClose();
  }

  function beginCreate() {
    setEditingId(null);
    setDraftName("");
    setSelectedIds([]);
  }

  function beginEdit(folder: ChatFolder) {
    setEditingId(folder.id);
    setDraftName(folder.name);
    setSelectedIds(folder.chatIds);
  }

  function saveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draftName.trim().slice(0, 24);
    if (!name) return;
    const id = editingId ?? createId();
    const next = { id, name, chatIds: [...new Set(selectedIds)] };
    setFolders((current) => editingId
      ? current.map((folder) => folder.id === id ? next : folder)
      : [...current, next].slice(0, 30));
    setActiveFolderId(id);
    setEditingId(null);
    setDraftName("");
    setSelectedIds([]);
    setDialogOpen(false);
    onManagerClose();
  }

  function deleteFolder(id: string) {
    setFolders((current) => current.filter((folder) => folder.id !== id));
    if (activeFolderId === id) setActiveFolderId(null);
    if (editingId === id) beginCreate();
  }

  function toggleChoice(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  return (
    <div className="chat-folders-shell">
      <div className="chat-folders-bar" role="tablist" aria-label={ru ? "Папки чатов" : "Chat folders"}>
        <button
          type="button"
          role="tab"
          aria-selected={activeFolderId === null}
          className={activeFolderId === null ? "active" : ""}
          onClick={() => setActiveFolderId(null)}
        >
          {ru ? "Все" : "All"}
        </button>
        {folders.map((folder) => (
          <button
            type="button"
            role="tab"
            key={folder.id}
            aria-selected={activeFolderId === folder.id}
            className={activeFolderId === folder.id ? "active" : ""}
            onClick={() => setActiveFolderId(folder.id)}
            title={folder.name}
          >
            <Folder size={13} />
            <span>{folder.name}</span>
          </button>
        ))}
        <button
          type="button"
          className="chat-folders-manage-trigger"
          onClick={() => { beginCreate(); setDialogOpen(true); }}
          aria-label={ru ? "Создать папку чатов" : "Create chat folder"}
          title={ru ? "Создать папку" : "Create folder"}
        >
          <Plus size={17} />
        </button>
      </div>

      {dialogOpen && (
        <div className="chat-folders-backdrop" onClick={closeDialog}>
          <section
            className="chat-folders-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-folders-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="chat-folders-dialog-header">
              <div>
                <strong id="chat-folders-title">{ru ? "Папки чатов" : "Chat folders"}</strong>
                <small>{ru ? "Настрой список чатов для каждой папки" : "Choose which chats appear in each folder"}</small>
              </div>
              <button type="button" onClick={closeDialog} aria-label={ru ? "Закрыть" : "Close"}><X size={19} /></button>
            </header>

            <div className="chat-folders-manager-list">
              {folders.length === 0 ? (
                <p className="chat-folders-empty">{ru ? "Папок пока нет. Создай первую." : "No folders yet. Create your first one."}</p>
              ) : folders.map((folder) => (
                <div className="chat-folder-manager-row" key={folder.id}>
                  <button type="button" className="chat-folder-manager-name" onClick={() => beginEdit(folder)}>
                    <Folder size={17} />
                    <span><strong>{folder.name}</strong><small>{ru ? folder.chatIds.length + " чатов" : folder.chatIds.length + " chats"}</small></span>
                  </button>
                  <button type="button" onClick={() => beginEdit(folder)} aria-label={ru ? "Изменить папку " + folder.name : "Edit folder " + folder.name}><Pencil size={16} /></button>
                  <button type="button" onClick={() => deleteFolder(folder.id)} aria-label={ru ? "Удалить папку " + folder.name : "Delete folder " + folder.name}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>

            <form className="chat-folders-form" onSubmit={saveFolder}>
              <label>
                <span>{ru ? (editingId ? "Название папки" : "Новая папка") : (editingId ? "Folder name" : "New folder")}</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value.slice(0, 24))}
                  maxLength={24}
                  placeholder={ru ? "Например, Друзья" : "For example, Friends"}
                  required
                />
              </label>
              <div className="chat-folders-choice-heading">
                <strong>{ru ? "Добавить чаты" : "Include chats"}</strong>
                <small>{ru ? "Выбрано: " + selectedIds.length : "Selected: " + selectedIds.length}</small>
              </div>
              <div className="chat-folders-choice-list">
                {choices.length === 0 ? (
                  <p className="chat-folders-empty">{ru ? "Пока нет чатов для добавления." : "There are no chats to add yet."}</p>
                ) : choices.map((choice) => (
                  <label className="chat-folders-choice" key={choice.id}>
                    <input type="checkbox" checked={selectedIds.includes(choice.id)} onChange={() => toggleChoice(choice.id)} />
                    <span><strong>{choice.label}</strong>{choice.subtitle && <small>{choice.subtitle}</small>}</span>
                    {selectedIds.includes(choice.id) && <Check size={15} />}
                  </label>
                ))}
              </div>
              <footer className="chat-folders-form-actions">
                {editingId && <button type="button" className="chat-folders-secondary" onClick={beginCreate}>{ru ? "Новая папка" : "New folder"}</button>}
                <button type="button" className="chat-folders-secondary" onClick={closeDialog}>{ru ? "Отмена" : "Cancel"}</button>
                <button type="submit" className="chat-folders-primary" disabled={!draftName.trim()}>{ru ? "Сохранить" : "Save"}</button>
              </footer>
              <p className="chat-folders-local-note">{ru ? "Папки хранятся только на этом устройстве." : "Folders are stored on this device only."}</p>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
