/**
 * PROTOTYPE（一次性）— 护眼盲区扫尾 before/after 切换基础设施。
 *
 * 用法：把替换点的类名写成 `protoCls("替换后", "替换前")`，评审时通过
 * `?proto=before` 与浮动切换器在两个状态间实时对比（默认 after）。
 * 选择器状态存 sessionStorage，SPA 导航不丢；生产构建恒为 after。
 * 评审通过后，fix 分支将把 protoCls("A", "B") 塌缩回 "A"。
 */
export type ProtoVariant = "after" | "before";

const STORAGE_KEY = "proto-sepia-variant";

export function readProtoVariant(): ProtoVariant {
  if (!import.meta.env.DEV) return "after";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("proto");
    if (fromUrl === "before" || fromUrl === "after") {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(STORAGE_KEY) === "before"
      ? "before"
      : "after";
  } catch {
    return "after";
  }
}

export function writeProtoVariant(variant: ProtoVariant): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, variant);
    const url = new URL(window.location.href);
    if (variant === "before") url.searchParams.set("proto", "before");
    else url.searchParams.delete("proto");
    window.location.replace(url.href);
  } catch {
    window.location.reload();
  }
}

/** 类名替换点：评审态返回 before（现状），其余返回 after（token 化） */
export function protoCls(after: string, before: string): string {
  return readProtoVariant() === "before" ? before : after;
}
