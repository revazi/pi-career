// SPDX-License-Identifier: MIT OR Apache-2.0

export const HANDOFF = "ISSUE_66_SYNTHETIC_HANDOFF";

export default function issue66RpcProbe(pi) {
  pi.registerCommand("issue66-probe-set-editor", {
    description: "Synthetic issue #66 RPC set-editor probe",
    async handler(_args, ctx) {
      ctx.ui.setEditorText(HANDOFF);
      ctx.ui.notify("ISSUE_66_SET_EDITOR_RETURNED", "info");
    },
  });

  pi.registerCommand("issue66-probe-editor", {
    description: "Synthetic issue #66 RPC blocking-editor probe",
    async handler(_args, ctx) {
      const value = await ctx.ui.editor("Synthetic issue #66 handoff", HANDOFF);
      ctx.ui.notify(value === HANDOFF ? "ISSUE_66_EDITOR_ECHOED" : "ISSUE_66_EDITOR_NOT_ECHOED", "info");
    },
  });

  pi.on("input", async (event, ctx) => {
    if (event.text !== HANDOFF) return { action: "continue" };
    ctx.ui.notify(`ISSUE_66_INPUT_SOURCE_${event.source}`, "info");
    return { action: "handled" };
  });
}
