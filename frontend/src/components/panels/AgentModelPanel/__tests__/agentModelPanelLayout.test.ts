import { readFileSync } from "node:fs";
const panelSource = readFileSync(
  new URL("../AgentModelPanel.tsx", import.meta.url),
  "utf8",
);
const agentSectionSource = readFileSync(
  new URL("../AgentSection.tsx", import.meta.url),
  "utf8",
);
const rolesModelTabSource = readFileSync(
  new URL("../../ModelPanel/tabs/RolesModelTab.tsx", import.meta.url),
  "utf8",
);

test("agent model panel uses a glass-shell layout with a section switcher", () => {
  expect(panelSource).toMatch(/glass-shell/);
  expect(panelSource).toMatch(/agent-model-section-switcher/);
  expect(agentSectionSource).toMatch(/glass-card/);
});

test("roles model tab uses a compact scan-friendly config list", () => {
  expect(rolesModelTabSource).toMatch(/agent-config-list/);
});
