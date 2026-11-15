import { useState, type ChangeEvent } from "react";
import { Smile, Upload } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import "./ChatMediaPicker.css";

type PickerTab = "emoji" | "stickers" | "gif";

type Props = {
  locale: Locale;
  disabled?: boolean;
  onEmojiSelect: (emoji: string) => void;
  onStickerSelect: (file: File) => void;
  onGifSelect: (file: File) => void;
};

const emojiGroups = [
  { label: "Часто используемые", emojis: ["😀","😂","🥹","😍","😎","😭","🤔","🙄","😡","🥳","🤯","😴","❤️","🔥","👍","👎","🙏","👏","💀","✨","🎉","💯","🤝","🫶","💔","🥰","😅","🤣","😇","🤩","😱","🤗","😏","🤨","😔","🤬","🤫","🤍","💙","⭐","☀️","🌊","🍀","🐱","🐶","🚀","🎮","🏆"] },
];

export default function ChatMediaPicker({ locale, disabled = false, onEmojiSelect, onStickerSelect, onGifSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>("emoji");
  const ru = locale === "ru";

  function handleFile(event: ChangeEvent<HTMLInputElement>, kind: "sticker" | "gif") {
    const file = event.target.files?.[0];
    if (file) {
      if (kind === "sticker") onStickerSelect(file);
      else onGifSelect(file);
    }
    event.target.value = "";
    setOpen(false);
  }

  return (
    <div className="chat-media-picker">
      <button
        type="button"
        className="icon-button composer-emoji-trigger"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-label={ru ? "Эмодзи, стикеры и GIF" : "Emoji, stickers and GIFs"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={ru ? "Эмодзи, стикеры и GIF" : "Emoji, stickers and GIFs"}
      >
        <Smile size={21} />
      </button>
      {open && (
        <section className="chat-media-picker-panel" role="dialog" aria-label={ru ? "Медиа" : "Media picker"}>
          <div className="chat-media-picker-tabs" role="tablist" aria-label={ru ? "Тип медиа" : "Media type"}>
            <button type="button" role="tab" aria-selected={tab === "emoji"} className={tab === "emoji" ? "active" : ""} onClick={() => setTab("emoji")}>{ru ? "Эмодзи" : "Emoji"}</button>
            <button type="button" role="tab" aria-selected={tab === "stickers"} className={tab === "stickers" ? "active" : ""} onClick={() => setTab("stickers")}>{ru ? "Стикеры" : "Stickers"}</button>
            <button type="button" role="tab" aria-selected={tab === "gif"} className={tab === "gif" ? "active" : ""} onClick={() => setTab("gif")}>GIF</button>
          </div>
          {tab === "emoji" && (
            <div className="chat-media-emoji-grid" role="tabpanel">
              {emojiGroups.flatMap((group) => group.emojis).map((emoji) => (
                <button type="button" key={emoji} onClick={() => onEmojiSelect(emoji)} aria-label={emoji}>{emoji}</button>
              ))}
            </div>
          )}
          {tab === "stickers" && (
            <div className="chat-media-upload-panel" role="tabpanel">
              <div className="chat-media-upload-icon"><Smile size={26} /></div>
              <strong>{ru ? "Отправить стикер" : "Send a sticker"}</strong>
              <p>{ru ? "Выбери изображение PNG, JPEG или WebP с устройства." : "Choose a PNG, JPEG or WebP image from your device."}</p>
              <label className="chat-media-upload-button">
                <Upload size={16} />{ru ? "Выбрать стикер" : "Choose sticker"}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => handleFile(event, "sticker")} />
              </label>
            </div>
          )}
          {tab === "gif" && (
            <div className="chat-media-upload-panel" role="tabpanel">
              <div className="chat-media-upload-icon chat-media-gif-mark">GIF</div>
              <strong>{ru ? "Отправить GIF" : "Send a GIF"}</strong>
              <p>{ru ? "Выбери анимированный GIF-файл с устройства." : "Choose an animated GIF file from your device."}</p>
              <label className="chat-media-upload-button">
                <Upload size={16} />{ru ? "Выбрать GIF" : "Choose GIF"}
                <input type="file" accept="image/gif,.gif" hidden onChange={(event) => handleFile(event, "gif")} />
              </label>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
