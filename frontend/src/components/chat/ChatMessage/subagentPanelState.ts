import type { CollapsibleStatus } from "../../common";
import type { SubagentPanelData } from "./subagentPanelStore";
import { createSubagentPanelKey } from "./messagePartAnchors";
import { formatDateTime } from "../../../utils/datetime";
import { formatSubagentName } from "./subagentRoleMeta";

export function buildSubagentPanelState(data: SubagentPanelData) {
  const effectiveStatus =
    data.status ||
    (data.isPending ? "running" : data.success ? "complete" : "error");
  const panelStatus: CollapsibleStatus =
    effectiveStatus === "running"
      ? "loading"
      : effectiveStatus === "complete"
        ? "success"
        : effectiveStatus === "error"
          ? "error"
          : effectiveStatus === "cancelled"
            ? "cancelled"
            : "idle";
  const subtitle = data.startedAt ? formatDateTime(data.startedAt) : undefined;

  return {
    effectiveStatus,
    panelStatus,
    subtitle: subtitle || undefined,
    panelKey: createSubagentPanelKey(data.agentId),
    formattedAgentName: formatSubagentName(data.agentName),
  };
}
