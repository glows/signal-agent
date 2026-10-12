import { discover } from "./discovery.js";
import type { Agent, AppData, Person } from "./types.js";

export const DEMO_PEOPLE: Person[] = [
  {
    id: "p1",
    username: "mia_builds",
    displayName: "Mia Chen",
    bio: "独立产品设计师，正在为 AI SaaS 做增长和用户研究",
    followers: 4830,
    posts: [
      "寻找更高效的 AI 内容工作流，准备为新产品选工具",
      "从零搭建 SaaS 落地页与客户访谈流程",
    ],
    interactions: ["@founder_notes"],
    lists: ["AI 创业者"],
  },
  {
    id: "p2",
    username: "liamfounder",
    displayName: "Liam Wu",
    bio: "B2B SaaS 创始人，关注营销自动化和潜在客户发现",
    followers: 12900,
    posts: [
      "团队正在比较 AI 销售线索工具，有推荐吗？",
      "下周上线新的 B2B SaaS 产品",
    ],
    interactions: ["@founder_notes"],
    lists: ["AI 创业者"],
  },
  {
    id: "p3",
    username: "ava_growth",
    displayName: "Ava Park",
    bio: "增长顾问 | 帮助 SaaS 团队找到第一批客户",
    followers: 6120,
    posts: ["分享一套 AI 驱动的客户拓展流程", "试用了三个营销自动化产品"],
    interactions: [],
    lists: ["AI 创业者"],
  },
  {
    id: "p4",
    username: "noah_dev",
    displayName: "Noah",
    bio: "开源开发者，喜欢数据库和终端工具",
    followers: 1700,
    posts: ["今天修复了一个 CLI 性能问题", "写了一篇数据库索引文章"],
    interactions: [],
    lists: ["开发者"],
  },
  {
    id: "p5",
    username: "sofia_shop",
    displayName: "Sofia Lee",
    bio: "电商品牌运营者，关注短视频和直播带货",
    followers: 8420,
    posts: ["想找一款更好用的短视频字幕工具", "新品预售今天开始"],
    interactions: [],
    lists: ["电商"],
  },
  {
    id: "p6",
    username: "ethan_ai",
    displayName: "Ethan Brooks",
    bio: "AI 创业者，为小团队做轻量化销售工具",
    followers: 3190,
    posts: ["正在研究如何把客户发现自动化", "我的 SaaS 产品开始公开测试"],
    interactions: ["@founder_notes"],
    lists: ["AI 创业者"],
  },
  {
    id: "p7",
    username: "ivy_educates",
    displayName: "Ivy Lin",
    bio: "在线教育创作者，教授插画和视觉设计",
    followers: 22400,
    posts: ["新的插画课程上架了", "本周分享教学素材整理方法"],
    interactions: [],
    lists: ["创作者"],
  },
  {
    id: "p8",
    username: "oliver_ops",
    displayName: "Oliver Tan",
    bio: "SaaS 运营负责人，探索 AI 和自动化",
    followers: 2760,
    posts: ["正在评估新的潜在客户监测工具", "想减少手工筛选销售线索的时间"],
    interactions: [],
    lists: ["AI 创业者"],
  },
];

export function createInitialData(): AppData {
  const date = "2026-10-12T00:00:00.000Z";
  const example: Agent = {
    id: "example-agent",
    name: "AI SaaS 潜在客户",
    icpDescription:
      "正在寻找 AI 工具、销售线索和营销自动化的 SaaS 创始人或增长负责人",
    precisionMode: "standard",
    status: "active",
    signals: [
      { id: "example-keyword", type: "keyword", value: "AI", status: "active" },
      {
        id: "example-list",
        type: "list_watch",
        value: "AI 创业者",
        status: "active",
      },
    ],
    createdAt: date,
    updatedAt: date,
    lastCheckedAt: date,
  };
  return {
    schemaVersion: 1,
    agents: [example],
    leads: discover(example, [], DEMO_PEOPLE, date).leads.slice(0, 2),
  };
}
