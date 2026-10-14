import { createFileRoute } from "@tanstack/react-router";

import { AccountPage } from "#features/studio/account";
export const Route = createFileRoute("/(app)/account")({
  component: AccountPage,
});
