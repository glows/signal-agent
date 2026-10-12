import { discover } from "@repo/core/signals";
import { DEMO_PEOPLE, createInitialData } from "@repo/core/signals";
import { describe, expect, it } from "vitest";

describe("discovery", () => {
  const now = "2026-10-12T00:00:00.000Z";
  it("finds relevant fictional people with explanation and provenance", () => {
    const agent = createInitialData().agents[0];
    const result = discover(agent, [], DEMO_PEOPLE, now);
    expect(result.added).toBeGreaterThan(0);
    expect(result.leads[0].score).toBeGreaterThanOrEqual(45);
    expect(result.leads[0].rationale.length).toBeGreaterThan(0);
    expect(result.leads[0].provenance.source.length).toBeGreaterThan(0);
  });
  it("does not add the same person twice", () => {
    const agent = createInitialData().agents[0];
    const first = discover(agent, [], DEMO_PEOPLE, now);
    expect(discover(agent, first.leads, DEMO_PEOPLE, now).added).toBe(0);
  });
  it("does not run paused agents", () => {
    const agent = {
      ...createInitialData().agents[0],
      status: "paused" as const,
    };
    expect(discover(agent, [], DEMO_PEOPLE, now)).toEqual({
      leads: [],
      added: 0,
      checkedAt: null,
    });
  });
  it("high precision returns no more leads than standard", () => {
    const agent = createInitialData().agents[0];
    const standard = discover(agent, [], DEMO_PEOPLE, now);
    const high = discover(
      { ...agent, precisionMode: "high" },
      [],
      DEMO_PEOPLE,
      now,
    );
    expect(high.added).toBeLessThan(standard.added);
  });
  it("attributes profile and list matches to their source", () => {
    const agent = createInitialData().agents[0];
    const profile = discover(
      {
        ...agent,
        signals: [
          {
            id: "profile",
            type: "profile_watch",
            value: "@liamfounder",
            status: "active",
          },
        ],
      },
      [],
      DEMO_PEOPLE,
      now,
    );
    expect(profile.leads.length).toBeGreaterThan(0);
    expect(
      profile.leads.every(
        (lead) => lead.provenance.signalType === "profile_watch",
      ),
    ).toBe(true);
    const list = discover(
      {
        ...agent,
        signals: [
          {
            id: "list",
            type: "list_watch",
            value: "AI 创业者",
            status: "active",
          },
        ],
      },
      [],
      DEMO_PEOPLE,
      now,
    );
    expect(list.leads.length).toBeGreaterThan(0);
    expect(
      list.leads.every((lead) => lead.provenance.signalType === "list_watch"),
    ).toBe(true);
  });
});
