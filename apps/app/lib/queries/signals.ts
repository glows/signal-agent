import { queryOptions } from "@tanstack/react-query";

import { trpcClient } from "#lib/trpc";

export function signalConnectionQueryOptions(userId?: string) {
  return queryOptions({
    queryKey: ["signals", "connection", userId],
    queryFn: () => trpcClient.signals.connection.query(),
    staleTime: 30_000,
    retry: false,
  });
}
