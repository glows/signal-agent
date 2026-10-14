import { createFileRoute } from "@tanstack/react-router";

import { ContactsPage } from "#features/studio/pages";
export const Route = createFileRoute("/(app)/contacts")({
  component: ContactsPage,
});
