import assert from "node:assert/strict";
import test from "node:test";
import en from "../i18n/locales/en.json";
import ja from "../i18n/locales/ja.json";
import ko from "../i18n/locales/ko.json";
import ru from "../i18n/locales/ru.json";
import zh from "../i18n/locales/zh.json";

test("scheduled-task Chinese UI copy does not expose placeholders", () => {
  const scheduledTask = zh.scheduledTask as Record<string, string>;

  assert.equal(scheduledTask.conversationTasks, "会话定时任务");
  assert.equal(scheduledTask.details, "详情");
  assert.equal(
    scheduledTask.noConversationTasks,
    "当前会话暂无 Agent 创建的定时任务",
  );

  for (const [key, value] of Object.entries(scheduledTask)) {
    assert.doesNotMatch(value, /【待翻译】/, `scheduledTask.${key}`);
  }
});

test("scheduled-task delete warning explains task sessions lose their entry point", () => {
  assert.match(zh.scheduledTask.deleteWarning, /历史运行会话/);
  assert.match(zh.scheduledTask.deleteWarning, /无法再从定时任务入口查看/);
  assert.match(en.scheduledTask.deleteWarning, /past run sessions/i);
  assert.match(en.scheduledTask.deleteWarning, /task entry point/i);
  assert.match(ja.scheduledTask.deleteWarning, /過去の実行セッション/);
  assert.match(ja.scheduledTask.deleteWarning, /タスクの入口/);
  assert.match(ko.scheduledTask.deleteWarning, /이전 실행 세션/);
  assert.match(ko.scheduledTask.deleteWarning, /작업入口|작업 입구|작업 항목/);
  assert.match(ru.scheduledTask.deleteWarning, /прошлые сеансы запусков/i);
  assert.match(ru.scheduledTask.deleteWarning, /карточки задачи/i);
});
