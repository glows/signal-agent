import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "#features/studio/pages";
export const Route = createFileRoute("/(app)/")({ component: HomePage });
