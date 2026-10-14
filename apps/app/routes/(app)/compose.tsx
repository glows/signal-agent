import { createFileRoute } from "@tanstack/react-router";

import { ComposePage } from "#features/studio/pages";
export const Route = createFileRoute("/(app)/compose")({
  component: ComposePage,
});
