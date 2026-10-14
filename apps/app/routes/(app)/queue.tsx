import { createFileRoute } from "@tanstack/react-router";

import { QueuePage } from "#features/studio/pages";
export const Route = createFileRoute("/(app)/queue")({ component: QueuePage });
