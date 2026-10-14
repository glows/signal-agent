import { createFileRoute } from "@tanstack/react-router";

import { InspirationPage } from "#features/studio/pages";
export const Route = createFileRoute("/(app)/inspiration")({
  component: InspirationPage,
});
