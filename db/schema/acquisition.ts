import type { AgentInput, Lead } from "@repo/core/signals";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./user";

export type AcquisitionLead = Lead & {
  review: "new" | "follow_up" | "not_fit" | "contacted";
  suggestion: string;
};
export type AcquisitionRun = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "failed";
  scanned: number;
  added: number;
  message?: string;
  trigger: "manual" | "daily";
};
export const acquisition = pgTable(
  "acquisition",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),
    product: text().notNull(),
    agent: jsonb().$type<AgentInput>().notNull(),
    enabled: boolean().notNull().default(false),
    dailyLimit: integer().notNull().default(30),
    nextRunAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    leaseUntil: timestamp({ withTimezone: true, mode: "date" }),
    leaseId: text(),
    leads: jsonb().$type<AcquisitionLead[]>().notNull().default([]),
    runs: jsonb().$type<AcquisitionRun[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("acquisition_user_id_idx").on(table.userId),
    index("acquisition_next_run_at_idx").on(table.nextRunAt),
  ],
);
