import { Button } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { auth } from "#lib/auth";
import { sessionQueryKey } from "#lib/queries/session";

interface XLoginProps {
  onError: (error: string | null) => void;
  isDisabled?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  /** Post-auth redirect destination (already validated by caller). */
  returnTo?: string;
}

export function XLogin({
  onError,
  isDisabled,
  onLoadingChange,
  returnTo,
}: XLoginProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const setLoading = useCallback(
    (loading: boolean) => {
      setIsLoading(loading);
      onLoadingChange?.(loading);
    },
    [onLoadingChange],
  );

  const handleXLogin = async () => {
    setLoading(true);
    onError(null);

    try {
      // Clear stale session before OAuth redirect
      queryClient.removeQueries({ queryKey: sessionQueryKey });

      // OAuth redirects to /login which validates session and redirects to returnTo
      const callbackURL = returnTo
        ? `/login?returnTo=${encodeURIComponent(returnTo)}`
        : "/login";

      const result = await auth.signIn.social({
        provider: "twitter",
        callbackURL,
      });

      if (result?.error) {
        onError(result.error.message || "Failed to sign in with X");
        setLoading(false);
      } else if (!result?.data?.redirect) {
        // No redirect (popup blocked, misconfigured provider, etc.) - reset loading
        setLoading(false);
      }
      // On redirect, page navigates away - component unmounts, no cleanup needed
    } catch (err) {
      console.error("X login error:", err);
      onError("Failed to sign in with X");
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleXLogin}
      disabled={isDisabled || isLoading}
    >
      <span aria-hidden="true" className="mr-2">
        𝕏
      </span>
      Continue with X
    </Button>
  );
}
