import { expect, it } from "vitest";

import { sendEmail } from "./email";

it("rejects placeholder Resend keys before attempting delivery", async () => {
  await expect(
    sendEmail(
      {
        RESEND_API_KEY: "dummy",
        RESEND_EMAIL_FROM: "onboarding@resend.dev",
      },
      { to: "person@example.com", subject: "Code", text: "test" },
    ),
  ).rejects.toThrow("not a valid Resend API key format");
});
