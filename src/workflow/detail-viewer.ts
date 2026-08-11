// SPDX-License-Identifier: MIT OR Apache-2.0

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { DetailViewer } from "./renderers.ts";

export async function showDetailText(
  ctx: ExtensionCommandContext,
  label: string,
  text: string,
): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify(text, "info");
    return;
  }
  await ctx.ui.custom<void>((tui, theme, keybindings, done) => new DetailViewer(
    label,
    text,
    theme,
    keybindings,
    Math.max(1, Math.min(20, tui.terminal.rows - 6)),
    () => tui.requestRender(),
    () => done(undefined),
  ));
}
