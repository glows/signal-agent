import { createFileRoute } from "@tanstack/react-router";

import { DailyBrief } from "#features/signals/daily-brief";
export const Route = createFileRoute("/(app)/brief")({ component: DailyBrief });
