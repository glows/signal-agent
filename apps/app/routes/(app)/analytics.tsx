import { createFileRoute } from "@tanstack/react-router";

import { AnalyticsPage } from "#features/studio/pages";
export const Route = createFileRoute("/(app)/analytics")({
  component: AnalyticsPage,
});
