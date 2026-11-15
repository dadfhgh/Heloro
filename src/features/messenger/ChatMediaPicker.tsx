import { useRef, useState, type ChangeEvent } from "react";
import { Smile, Upload } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import "./ChatMediaPicker.css";

type PickerTab = "emoji" | "stickers" | "gif";
type Motion = "pop" | "float" | "pulse" | "spin";
type Props = {
  locale: Locale;
  disabled?: boolean;
  onEmojiSelect: (emoji: string) => void;
  onStickerSelect: (emoji: string, motion: Motion) => void;
  onGifSelect: (emoji: string, motion: Motion) => void;
  onStickerUpload: (file: File) => void;
  onGifUpload: (file: File) => void;
};

const emojiGroups = [
  ["😀","😂","🥹","😍","😎","😭","🤔","🙄","😡","🥳","🤯","😴","❤️","🔥","👍","👎","🙏","👏","💀","✨","🎉","💯","🤝","🫶","💔","🥰","😅","🤣","😇","🤩","😱","🤗","😏","🤨","😔","🤬","🤫","🤍","💙","⭐","☀️","🌊","🍀","🐱","🐶","🚀","🎮","🏆"],
];
const stickerPack: { emoji: string; motion: Motion; label: string }[] = [
  { emoji: "👋", motion: "float", label: "Привет" },
  { emoji: "❤️", motion: "pulse", label: "Люблю" },
  { emoji: "😂", motion: "pop", label: "Смешно" },
  { emoji: "🔥", motion: "float", label: "Огонь" },
  { emoji: "🥹", motion: "pulse", label: "Мило" },
  { emoji: "😎", motion: "pop", label: "Круто" },
  { emoji: "🐱", motion: "float", label: "Кот" },
  { emoji: "💀", motion: "pop", label: "Умер" },
  { emoji: "🎉", motion: "spin", label: "Праздник" },
  { emoji: "👍", motion: "pop", label: "Класс" },
  { emoji: "🤝", motion: "float", label: "Договорились" },
  { emoji: "💜", motion: "pulse", label: "HELORO" },
];
const gifPack: { emoji: string; motion: Motion; label: string }[] = [
  { emoji: "🎉", motion: "spin", label: "Праздник" },
  { emoji: "❤️", motion: "pulse", label: "Сердце" },
  { emoji: "🔥", motion: "float", label: "Огонь" },
  { emoji: "😂", motion: "pop", label: "Смех" },
  { emoji: "👀", motion: "pulse", label: "Смотрю" },
  { emoji: "🚀", motion: "float", label: "Поехали" },
  { emoji: "✨", motion: "spin", label: "Блеск" },
  { emoji: "🥳", motion: "pop", label: "Ура" },
];

export default function ChatMediaPicker({
  locale, disabled = false, onEmojiSelect, onStickerSelect, onGifSelect, onStickerUpload, onGifUpload,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>("emoji");
  const stickerInput = useRef<HTMLInputElement>(null);
  const gifInput = useRef<HTMLInputElement>(null);
  const ru = locale === "ru";

  function handleFile(event: ChangeEvent<HTMLInputElement>, kind: "sticker" | "gif") {
    const file = event.target.files?.[0];
    if (file) {
      if (kind === "sticker") onStickerUpload(file);
      else onGifUpload(file);
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
        <section className="chat-media-picker-panel" role="dialog" aria-label={ru ? "Выбор эмодзи и медиа" : "Emoji and media picker"}>
          <div className="chat-media-picker-tabs" role="tablist" aria-label={ru ? "Тип медиа" : "Media type"}>
            <button type="button" role="tab" aria-selected={tab === "emoji"} className={tab === "emoji" ? "active" : ""} onClick={() => setTab("emoji")}>{ru ? "Эмодзи" : "Emoji"}</button>
            <button type="button" role="tab" aria-selected={tab === "stickers"} className={tab === "stickers" ? "active" : ""} onClick={() => setTab("stickers")}>{ru ? "Стикеры" : "Stickers"}</button>
            <button type="button" role="tab" aria-selected={tab === "gif"} className={tab === "gif" ? "active" : ""} onClick={() => setTab("gif")}>GIF</button>
          </div>
          {tab === "emoji" && (
            <div className="chat-media-emoji-grid" role="tabpanel">
              {emojiGroups.flatMap((group) => group).map((emoji) => (
                <button type="button" key={emoji} onClick={() => { onEmojiSelect(emoji); setOpen(false); }} aria-label={emoji}>{emoji}</button>
              ))}
            </div>
          )}
          {tab === "stickers" && (
            <div className="chat-media-catalog" role="tabpanel">
              <div className="chat-media-catalog-grid">
                {stickerPack.map((sticker) => (
                  <button type="button" className="chat-media-catalog-item" key={sticker.label} onClick={() => { onStickerSelect(sticker.emoji, sticker.motion); setOpen(false); }} aria-label={sticker.label}>
                    <span className={"chat-media-art motion-" + sticker.motion}>{sticker.emoji}</span>
                    <small>{sticker.label}</small>
                  </button>
                ))}
              </div>
              <button type="button" className="chat-media-upload-button chat-media-upload-secondary" onClick={() => stickerInput.current?.click()}>
                <Upload size={15} />{ru ? "Загрузить свой стикер" : "Upload a sticker"}
              </button>
              <input ref={stickerInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => handleFile(event, "sticker")} />
            </div>
          )}
          {tab === "gif" && (
            <div className="chat-media-catalog" role="tabpanel">
              <div className="chat-media-catalog-grid chat-media-gif-grid">
                {gifPack.map((gif) => (
                  <button type="button" className="chat-media-catalog-item" key={gif.label} onClick={() => { onGifSelect(gif.emoji, gif.motion); setOpen(false); }} aria-label={gif.label}>
                    <span className={"chat-media-art motion-" + gif.motion}>{gif.emoji}</span>
                    <small>{gif.label}</small>
                  </button>
                ))}
              </div>
              <button type="button" className="chat-media-upload-button chat-media-upload-secondary" onClick={() => gifInput.current?.click()}>
                <Upload size={15} />{ru ? "Загрузить GIF-файл" : "Upload a GIF file"}
              </button>
              <input ref={gifInput} type="file" accept="image/gif,.gif" hidden onChange={(event) => handleFile(event, "gif")} />
              <p className="chat-media-catalog-note">{ru ? "Встроенные анимации HELORO отправляются сразу. Свои GIF можно загрузить с устройства." : "Built-in HELORO animations send instantly. You can also upload a GIF from your device."}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
