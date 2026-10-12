export type PrecisionMode = "standard" | "high";
export type AgentStatus = "active" | "paused";
export type SignalType = "keyword" | "profile_watch" | "list_watch";
export type Feedback = "fit" | "not_fit" | "pending";

export interface Signal {
  id: string;
  type: SignalType;
  value: string;
  status: "active";
}

export interface SignalInput {
  type: SignalType;
  value: string;
}
export interface AgentInput {
  name: string;
  icpDescription: string;
  precisionMode: PrecisionMode;
  signals: SignalInput[];
}

export interface Agent extends AgentInput {
  id: string;
  status: AgentStatus;
  signals: Signal[];
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
}

export interface Person {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  followers: number;
  posts: string[];
  interactions: string[];
  lists: string[];
  postEvidence?: { id: string; text: string; postedAt?: string }[];
  observedSignals?: { type: SignalType; value: string; postText: string }[];
}

export interface Lead {
  id: string;
  agentId: string;
  person: Person;
  score: number;
  rationale: string;
  provenance: {
    signalType: SignalType;
    source: string;
    interaction: string;
    postId?: string;
    postUrl?: string;
    postedAt?: string;
  };
  dataSource?: "demo" | "x";
  discoveredAt: string;
  feedback: Feedback;
}

export interface AppData {
  schemaVersion: 1;
  agents: Agent[];
  leads: Lead[];
}
