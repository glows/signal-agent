import { createFileRoute } from "@tanstack/react-router";

import { ContextPage } from "#features/studio/pages";
export const Route = createFileRoute("/(app)/context")({
  component: ContextPage,
});
