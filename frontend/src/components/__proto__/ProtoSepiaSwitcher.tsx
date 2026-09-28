/**
 * PROTOTYPE（一次性）— 护眼盲区扫尾评审浮动条。
 * 左：before/after 切换（写 sessionStorage + 带 ?proto= 刷新）；
 * 右：主题循环（进入页面默认强制护眼 sepia，离开恢复原主题）。
 * 仅 DEV 构建挂载（App.tsx 内 DEV 守卫），文案为开发者向硬编码中文。
 */
import { useEffect, useState } from "react";
import {
  applyThemeToDocument,
  type Theme,
} from "../../utils/themeDom";
import {
  readProtoVariant,
  writeProtoVariant,
  type ProtoVariant,
} from "./protoSepiaSwap";

const THEME_ORDER: Theme[] = ["sepia", "light", "dark"];
const THEME_LABEL: Record<Theme, string> = {
  sepia: "护眼",
  light: "浅色",
  dark: "深色",
};

export function ProtoSepiaSwitcher() {
  const [variant, setVariant] = useState<ProtoVariant>("after");
  const [theme, setTheme] = useState<Theme>("sepia");

  useEffect(() => {
    setVariant(readProtoVariant());
  }, []);

  // 进入强制 sepia，卸载恢复进入前的 <html>/<body> 主题痕迹
  useEffect(() => {
    const html = document.documentElement;
    const prevHtmlClass = html.className;
    const prevHtmlStyle = html.getAttribute("style");
    const prevBodyStyle = document.body.getAttribute("style");
    applyThemeToDocument("sepia");
    return () => {
      html.className = prevHtmlClass;
      if (prevHtmlStyle === null) html.removeAttribute("style");
      else html.setAttribute("style", prevHtmlStyle);
      if (prevBodyStyle === null) document.body.removeAttribute("style");
      else document.body.setAttribute("style", prevBodyStyle);
    };
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const btn =
    "rounded-full px-2 py-0.5 text-11 font-medium transition-colors hover:bg-white/10";

  return (
    <div className="fixed bottom-3 left-1/2 z-[999] flex -translate-x-1/2 items-center gap-1 rounded-full bg-stone-900 px-2 py-1 text-white shadow-lg dark:bg-stone-100 dark:text-stone-900">
      <span className="pl-1 text-11 opacity-70">护眼扫尾原型</span>
      <button
        className={`${btn} ${variant === "before" ? "bg-white/20" : ""}`}
        onClick={() => writeProtoVariant("before")}
        title="替换前的硬编码类（现状盲区）"
      >
        Before
      </button>
      <button
        className={`${btn} ${variant === "after" ? "bg-white/20" : ""}`}
        onClick={() => writeProtoVariant("after")}
        title="替换后的 theme token（建议方案）"
      >
        After
      </button>
      <div className="mx-1 h-4 w-px bg-current opacity-20" />
      <button
        className={btn}
        onClick={() =>
          setTheme(
            (cur) =>
              THEME_ORDER[
                (THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length
              ] ?? "sepia",
          )
        }
        title="循环主题：护眼 / 浅色 / 深色（浅色应无变化，深色应像素级一致）"
      >
        主题：{THEME_LABEL[theme]}
      </button>
    </div>
  );
}
