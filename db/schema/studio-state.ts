import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./user";

export const studioState = pgTable("studio_state", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  data: jsonb().$type<Record<string, unknown>>().notNull(),
  revision: integer().notNull().default(1),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});
