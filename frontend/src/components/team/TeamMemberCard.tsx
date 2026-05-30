import { useState } from "react";
import { ChevronDown, ChevronRight, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TeamMember } from "../../types/team";
import {
  PersonaAvatarIcon,
  PersonaAvatarImage,
} from "../persona/PersonaAvatarIcon";
import {
  getEmojiAvatarUrl,
  isEmojiAvatar,
  isPersonaImageAvatar,
} from "../persona/personaAvatar";

interface TeamMemberCardProps {
  member: TeamMember;
  isDefault: boolean;
  onRemove: () => void;
  onSetDefault: () => void;
  onToggleEnabled: () => void;
  onInstructionsChange: (text: string) => void;
}

export function TeamMemberCard({
  member,
  isDefault,
  onRemove,
  onSetDefault,
  onToggleEnabled,
  onInstructionsChange,
}: TeamMemberCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(!!member.role_instructions);

  return (
    <div
      className={`list-item-card ${
        member.enabled ? "" : "list-item-card--disabled"
      }`}
    >
      <div className="list-item-card__body">
        {/* Main row: avatar + name + tags + actions */}
        <div className="list-item-card__top">
          <div className="team-member-card__avatar-btn">
            {isPersonaImageAvatar(member.role_avatar) ||
            isEmojiAvatar(member.role_avatar) ? (
              <div className="team-member-card__avatar">
                <PersonaAvatarImage
                  avatar={
                    isEmojiAvatar(member.role_avatar)
                      ? getEmojiAvatarUrl(member.role_avatar)
                      : member.role_avatar
                  }
                  alt=""
                  className="team-member-card__avatar-img"
                />
              </div>
            ) : (
              <div className="team-member-card__avatar team-member-card__avatar--icon">
                <PersonaAvatarIcon
                  avatar={member.role_avatar}
                  primaryTag={member.role_tags[0]}
                  size={18}
                  className="text-[var(--theme-primary)]"
                />
              </div>
            )}
          </div>

          <div className="list-item-card__identity">
            <span className="list-item-card__name">
              {member.role_name || t("team.unnamedRole")}
            </span>
            {member.role_tags.length > 0 && (
              <span className="team-member-card__tags">
                {member.role_tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="team-member-card__tag">
                    {tag}
                  </span>
                ))}
              </span>
            )}
          </div>

          {/* Inline actions */}
          <div className="list-item-card__actions">
            <button
              onClick={onSetDefault}
              className={`team-member-card__action-btn ${
                isDefault ? "team-member-card__action-btn--active" : ""
              }`}
              title={isDefault ? t("team.defaultRole") : t("team.setDefault")}
              type="button"
            >
              <Star size={14} fill={isDefault ? "currentColor" : "none"} />
            </button>
            <button
              onClick={onRemove}
              className="team-member-card__action-btn team-member-card__action-btn--danger"
              title={t("team.remove")}
              type="button"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Toggle */}
          <button
            onClick={onToggleEnabled}
            className={`team-toggle ${member.enabled ? "team-toggle--on" : ""}`}
            title={
              member.enabled ? t("team.disableRole") : t("team.enableRole")
            }
            type="button"
            role="switch"
            aria-checked={member.enabled}
          />

          {/* Expand chevron */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="team-member-card__expand-btn"
            type="button"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>

        {/* Collapsible instructions */}
        {expanded && (
          <div className="list-item-card__instructions">
            <textarea
              value={member.role_instructions}
              onChange={(e) => onInstructionsChange(e.target.value)}
              placeholder={t("team.roleInstructionsPlaceholder")}
              className="ppe-textarea"
              rows={3}
            />
          </div>
        )}
      </div>
    </div>
  );
}
