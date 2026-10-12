import { createFileRoute } from "@tanstack/react-router";

import { SignalWorkspace } from "#features/signals/workspace";

export const Route = createFileRoute("/signal-demo")({
  component: SignalWorkspace,
});
