import { createFileRoute } from "@tanstack/react-router";

import { DmsPage } from "#features/studio/pages";
export const Route = createFileRoute("/(app)/dms")({ component: DmsPage });
