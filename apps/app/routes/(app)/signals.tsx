import { createFileRoute } from "@tanstack/react-router";

import { SignalWorkspace } from "#features/signals/workspace";
import { useSessionQuery } from "#lib/queries/session";

export const Route = createFileRoute("/(app)/signals")({
  component: SignalsPage,
});
function SignalsPage() {
  const { data: session } = useSessionQuery();
  return <SignalWorkspace userId={session?.user.id} embedded />;
}
