import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Camera, Loader2, Smile } from "lucide-react";
import toast from "react-hot-toast";
import { uploadApi } from "../../services/api";
import { compressImageFile } from "../../utils/imageCompression";
import {
  isPersonaImageAvatar,
  isEmojiAvatar,
  getEmojiAvatarUrl,
} from "./personaAvatar";
import { getFluentEmojiCDN } from "@lobehub/fluent-emoji";
import { PersonaAvatarIcon, PersonaAvatarImage } from "./PersonaAvatarIcon";
import { AVATAR_EMOJIS } from "./PersonaEditorTypes";
import type { PersonaEditorDraft } from "./PersonaEditorTypes";

interface AvatarSectionProps {
  draft: PersonaEditorDraft;
  onDraftChange: (
    updater: (prev: PersonaEditorDraft) => PersonaEditorDraft,
  ) => void;
}

export function AvatarSection({ draft, onDraftChange }: AvatarSectionProps) {
  const { t } = useTranslation();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      setIsUploadingAvatar(true);
      try {
        const compressed = await compressImageFile(file, {
          maxDimension: 256,
          targetSizeKB: 100,
          skipBelowKB: 100,
        });
        const result = await uploadApi.uploadFile(compressed, {
          folder: "persona-avatars",
        }).promise;
        onDraftChange((prev) => ({ ...prev, avatar: result.url }));
      } catch (error) {
        console.error("Avatar upload failed:", error);
        toast.error(t("personaPresets.avatarUploadFailed", "头像上传失败"));
      } finally {
        setIsUploadingAvatar(false);
      }
    },
    [t, onDraftChange],
  );

  return (
    <div className="ppe-avatar-upload">
      <div
        className="ppe-avatar-preview"
        onClick={() =>
          !draft.avatar && !isUploadingAvatar && avatarInputRef.current?.click()
        }
      >
        {isEmojiAvatar(draft.avatar) ? (
          <>
            <PersonaAvatarImage
              avatar={getEmojiAvatarUrl(draft.avatar)}
              alt=""
              className="ppe-avatar-img"
            />
            <button
              type="button"
              className="ppe-avatar-remove"
              onClick={(e) => {
                e.stopPropagation();
                onDraftChange((prev) => ({ ...prev, avatar: "" }));
              }}
              title={t("common.remove", "移除")}
            >
              <X size={12} />
            </button>
          </>
        ) : isPersonaImageAvatar(draft.avatar) ? (
          <>
            <PersonaAvatarImage
              avatar={draft.avatar}
              alt=""
              className="ppe-avatar-img"
              onError={() => onDraftChange((prev) => ({ ...prev, avatar: "" }))}
            />
            <button
              type="button"
              className="ppe-avatar-remove"
              onClick={(e) => {
                e.stopPropagation();
                onDraftChange((prev) => ({ ...prev, avatar: "" }));
              }}
              title={t("common.remove", "移除")}
            >
              <X size={12} />
            </button>
          </>
        ) : draft.avatar ? (
          <>
            <div className="ppe-avatar-placeholder">
              <PersonaAvatarIcon avatar={draft.avatar} size={20} />
            </div>
            <button
              type="button"
              className="ppe-avatar-remove"
              onClick={(e) => {
                e.stopPropagation();
                onDraftChange((prev) => ({ ...prev, avatar: "" }));
              }}
              title={t("common.remove", "移除")}
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <div className="ppe-avatar-placeholder">
            <Camera size={18} />
          </div>
        )}
        {isUploadingAvatar && (
          <div className="ppe-avatar-uploading">
            <Loader2 size={16} className="animate-spin" />
          </div>
        )}
      </div>
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={isUploadingAvatar}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleAvatarUpload(file);
          e.target.value = "";
        }}
      />
      <div ref={iconPickerRef} className="relative">
        <button
          type="button"
          className="ppe-avatar-hint-btn"
          disabled={isUploadingAvatar}
          onClick={() => setIconPickerOpen((v) => !v)}
        >
          <Smile size={12} />
          {t("personaPresets.pickIcon", "选择图标")}
        </button>
        {iconPickerOpen && (
          <div className="ppe-icon-picker">
            {AVATAR_EMOJIS.map((item) => (
              <button
                key={item.emoji}
                type="button"
                className="ppe-icon-picker-item"
                onClick={() => {
                  onDraftChange((prev) => ({
                    ...prev,
                    avatar: item.emoji,
                  }));
                  setIconPickerOpen(false);
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
    </div>
  );
}
