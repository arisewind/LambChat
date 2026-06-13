import { getFluentEmojiCDN } from "@lobehub/fluent-emoji";
import { Smile } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "./AgentIcon";

const AGENT_ICON_EMOJIS: { emoji: string; labelKey: string }[] = [
  { emoji: "✨", labelKey: "personaPresets.emojiSparkles" },
  { emoji: "🤖", labelKey: "personaPresets.emojiRobot" },
  { emoji: "🎓", labelKey: "personaPresets.emojiAcademic" },
  { emoji: "💻", labelKey: "personaPresets.emojiCoding" },
  { emoji: "✍️", labelKey: "personaPresets.emojiWriting" },
  { emoji: "🛡️", labelKey: "personaPresets.emojiSecurity" },
  { emoji: "📊", labelKey: "personaPresets.emojiData" },
  { emoji: "⚡", labelKey: "personaPresets.emojiProductivity" },
  { emoji: "📦", labelKey: "personaPresets.emojiGeneral" },
  { emoji: "🎨", labelKey: "personaPresets.emojiArt" },
  { emoji: "🎵", labelKey: "personaPresets.emojiMusic" },
  { emoji: "📚", labelKey: "personaPresets.emojiLiterature" },
  { emoji: "🧠", labelKey: "personaPresets.emojiIntelligence" },
  { emoji: "🔬", labelKey: "personaPresets.emojiScience" },
  { emoji: "💬", labelKey: "personaPresets.emojiChat" },
  { emoji: "🌟", labelKey: "personaPresets.emojiStar" },
];

interface AgentIconSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export const AgentIconSelect = React.memo(function AgentIconSelect({
  value,
  onChange,
}: AgentIconSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="ppe-avatar-hint-btn"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="relative inline-flex h-4 w-4 overflow-hidden">
          <AgentIcon icon={value || undefined} size={16} />
        </span>
        <Smile size={12} />
        {t("personaPresets.pickIcon", "选择图标")}
      </button>

      {open && (
        <div className="ppe-icon-picker">
          {AGENT_ICON_EMOJIS.map((item) => (
            <button
              key={item.emoji}
              type="button"
              className="ppe-icon-picker-item"
              onClick={() => {
                onChange(item.emoji);
                setOpen(false);
              }}
              title={t(item.labelKey)}
            >
              <span className="relative inline-flex size-5">
                <span className="absolute inset-0 skeleton-line rounded-md" />
                <img
                  src={getFluentEmojiCDN(item.emoji, { type: "anim" })}
                  alt={t(item.labelKey)}
                  width={20}
                  height={20}
                  style={{ objectFit: "contain" }}
                  className="relative z-[1]"
                  loading="lazy"
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
