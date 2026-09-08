import { buildStreamingThinkingPreview } from "../thinkingPreview";
import { useSmoothStreamText } from "../useSmoothStreamText";
import { parsePartialToolArgs } from "./partialToolArgs";

/**
 * 取参数里正在生成的文本：最后一个字符串值。JSON 键序即生成序，
 * 生成中的键总是最后被解析出来（content / new_string / code / query…）。
 */
export function pickStreamingArgText(args: Record<string, unknown>): string {
  let last = "";
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value) last = value;
  }
  return last;
}

/**
 * 标签拼接：流式期间把参数文本的尾部预览追加在基础标签后。
 * 参数文本已完整出现在标签里的（路径/命令逐字增长的工具）不重复追加。
 */
export function appendToolStreamingPreview(
  baseLabel: string,
  streamingText: string,
  isStreaming: boolean,
): string {
  if (!isStreaming || !streamingText || baseLabel.includes(streamingText)) {
    return baseLabel;
  }
  const preview = buildStreamingThinkingPreview(streamingText);
  return preview ? `${baseLabel} ${preview}` : baseLabel;
}

/**
 * 工具进行中的 pill 标签：学「思考中」，把正在生成的参数尾部平滑地
 * （打字机式）流在标签上；结束后回归静态标签。args 兼容 argsPartial
 * 的 { partial: "<JSON 前缀>" } 原文形态，内部渐进解析。
 */
export function useToolStreamingLabel(
  baseLabel: string,
  args: Record<string, unknown>,
  opts: { isPending?: boolean; result?: string | Record<string, unknown> },
): { label: string; isStreamingLabel: boolean } {
  const isStreamingLabel = !!opts.isPending && !opts.result;
  const partial = args.partial;
  const parsed =
    typeof partial === "string" ? parsePartialToolArgs(partial) : args;
  const source = pickStreamingArgText(parsed);
  // 平滑流出而非整块蹦出；非流式（历史回放）直接全量
  const display = useSmoothStreamText(source, isStreamingLabel);
  return {
    label: appendToolStreamingPreview(baseLabel, display, isStreamingLabel),
    isStreamingLabel,
  };
}
