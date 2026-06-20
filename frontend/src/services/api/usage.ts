/**
 * Usage API - Token consumption tracking
 */

import { authFetch } from "./fetch";
import { API_BASE } from "./config";
import type {
  UsageDashboardResponse,
  UsageLogListResponse,
  UsageStats,
} from "../../types/usage";

export interface UsageLogsParams {
  skip?: number;
  limit?: number;
  user_id?: string;
  model?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
}

export interface UsageStatsParams {
  user_id?: string;
  period?: "today" | "week" | "month" | "all";
}

export interface UsageDashboardParams extends UsageStatsParams {
  model?: string;
  search?: string;
}

export const usageApi = {
  /**
   * Get usage logs (paginated)
   */
  async list(params: UsageLogsParams = {}): Promise<UsageLogListResponse> {
    const searchParams = new URLSearchParams();
    if (params.skip !== undefined)
      searchParams.append("skip", params.skip.toString());
    if (params.limit !== undefined)
      searchParams.append("limit", params.limit.toString());
    if (params.user_id) searchParams.append("user_id", params.user_id);
    if (params.model) searchParams.append("model", params.model);
    if (params.start_date) searchParams.append("start_date", params.start_date);
    if (params.end_date) searchParams.append("end_date", params.end_date);
    if (params.search) searchParams.append("search", params.search);
    const query = searchParams.toString() ? `?${searchParams}` : "";
    return authFetch<UsageLogListResponse>(
      `${API_BASE}/api/usage/logs${query}`,
    );
  },

  /**
   * Get aggregated usage stats
   */
  async getStats(params: UsageStatsParams = {}): Promise<UsageStats> {
    const searchParams = new URLSearchParams();
    if (params.user_id) searchParams.append("user_id", params.user_id);
    if (params.period && params.period !== "all")
      searchParams.append("period", params.period);
    const query = searchParams.toString() ? `?${searchParams}` : "";
    return authFetch<UsageStats>(`${API_BASE}/api/usage/stats${query}`);
  },

  /**
   * Get dashboard aggregates for the digital worker operations view
   */
  async getDashboard(
    params: UsageDashboardParams = {},
  ): Promise<UsageDashboardResponse> {
    const searchParams = new URLSearchParams();
    if (params.user_id) searchParams.append("user_id", params.user_id);
    if (params.period) searchParams.append("period", params.period);
    if (params.model) searchParams.append("model", params.model);
    if (params.search) searchParams.append("search", params.search);
    const query = searchParams.toString() ? `?${searchParams}` : "";
    return authFetch<UsageDashboardResponse>(
      `${API_BASE}/api/usage/dashboard${query}`,
    );
  },
};
