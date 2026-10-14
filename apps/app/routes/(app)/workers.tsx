import { createFileRoute } from "@tanstack/react-router";

import { WorkersPage } from "#features/studio/pages";
export const Route = createFileRoute("/(app)/workers")({
  component: WorkersPage,
});
