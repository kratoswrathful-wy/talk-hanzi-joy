export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  dueDate?: string;
  projectId: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  progress: number;
  taskCount: number;
  completedTasks: number;
  lead: string;
  updatedAt: string;
}

export const projects: Project[] = [
  {
    id: "proj-1",
    name: "網站重新設計",
    description: "重新設計公司官方網站，提升使用者體驗與視覺風格",
    color: "hsl(217 91% 60%)",
    progress: 68,
    taskCount: 24,
    completedTasks: 16,
    lead: "王小明",
    updatedAt: "2026-02-22",
  },
  {
    id: "proj-2",
    name: "行動應用程式 v2",
    description: "開發行動應用程式第二版，新增社群功能",
    color: "hsl(142 71% 45%)",
    progress: 35,
    taskCount: 40,
    completedTasks: 14,
    lead: "李美玲",
    updatedAt: "2026-02-23",
  },
  {
    id: "proj-3",
    name: "後端 API 優化",
    description: "優化 API 效能，降低回應時間至 100ms 以下",
    color: "hsl(38 92% 50%)",
    progress: 82,
    taskCount: 18,
    completedTasks: 15,
    lead: "張大偉",
    updatedAt: "2026-02-21",
  },
  {
    id: "proj-4",
    name: "資料分析平台",
    description: "建立內部資料分析儀表板與報表系統",
    color: "hsl(280 67% 55%)",
    progress: 12,
    taskCount: 32,
    completedTasks: 4,
    lead: "陳雅婷",
    updatedAt: "2026-02-20",
  },
];

export const tasks: Task[] = [
  // proj-1 tasks
  { id: "task-1", title: "設計首頁 Wireframe", status: "done", priority: "high", assignee: "王小明", dueDate: "2026-02-15", projectId: "proj-1" },
  { id: "task-2", title: "開發導覽列元件", status: "done", priority: "medium", assignee: "李美玲", dueDate: "2026-02-18", projectId: "proj-1" },
  { id: "task-3", title: "實作響應式佈局", status: "in_progress", priority: "high", assignee: "張大偉", dueDate: "2026-02-25", projectId: "proj-1" },
  { id: "task-4", title: "整合 CMS 系統", status: "todo", priority: "medium", assignee: "陳雅婷", dueDate: "2026-03-01", projectId: "proj-1" },
  { id: "task-5", title: "SEO 最佳化", status: "todo", priority: "low", assignee: "王小明", dueDate: "2026-03-05", projectId: "proj-1" },
  // proj-2 tasks
  { id: "task-6", title: "設計社群動態頁面", status: "in_progress", priority: "high", assignee: "李美玲", dueDate: "2026-02-28", projectId: "proj-2" },
  { id: "task-7", title: "建立聊天功能", status: "todo", priority: "urgent", assignee: "張大偉", dueDate: "2026-03-10", projectId: "proj-2" },
  { id: "task-8", title: "推播通知系統", status: "todo", priority: "high", assignee: "陳雅婷", dueDate: "2026-03-15", projectId: "proj-2" },
  { id: "task-9", title: "使用者個人檔案", status: "done", priority: "medium", assignee: "王小明", dueDate: "2026-02-20", projectId: "proj-2" },
  // proj-3 tasks
  { id: "task-10", title: "資料庫查詢優化", status: "done", priority: "urgent", assignee: "張大偉", dueDate: "2026-02-10", projectId: "proj-3" },
  { id: "task-11", title: "加入快取機制", status: "in_progress", priority: "high", assignee: "王小明", dueDate: "2026-02-24", projectId: "proj-3" },
  { id: "task-12", title: "負載測試", status: "todo", priority: "medium", assignee: "李美玲", dueDate: "2026-03-01", projectId: "proj-3" },
  // proj-4 tasks
  { id: "task-13", title: "定義資料模型", status: "in_progress", priority: "high", assignee: "陳雅婷", dueDate: "2026-02-26", projectId: "proj-4" },
  { id: "task-14", title: "建立 ETL 管線", status: "todo", priority: "urgent", assignee: "張大偉", dueDate: "2026-03-05", projectId: "proj-4" },
  { id: "task-15", title: "設計儀表板 UI", status: "todo", priority: "medium", assignee: "李美玲", dueDate: "2026-03-10", projectId: "proj-4" },
];

export const statusLabels: Record<TaskStatus, string> = {
  todo: "待辦",
  in_progress: "進行中",
  done: "已完成",
  cancelled: "已取消",
};

export const priorityLabels: Record<TaskPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "緊急",
};
