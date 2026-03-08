import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCases, caseStore } from "@/hooks/use-case-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const taskStatusColors: Record<string, string> = {
  已交件: "bg-green-600/20 text-green-400",
  進行中: "bg-blue-600/20 text-blue-400",
  待處理: "bg-yellow-600/20 text-yellow-400",
};

export default function CasesPage() {
  const navigate = useNavigate();
  const cases = useCases();

  const handleCreate = async () => {
    const newCase = await caseStore.create({ title: "新案件" });
    if (newCase) navigate(`/cases/${newCase.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">案件管理</h1>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          新增案件
        </Button>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">案件編號</TableHead>
              <TableHead>類型</TableHead>
              <TableHead>工作類型</TableHead>
              <TableHead>譯者</TableHead>
              <TableHead>審稿人員</TableHead>
              <TableHead>任務狀態</TableHead>
              <TableHead>翻譯交期</TableHead>
              <TableHead className="text-right">計費單位數</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  尚無案件紀錄
                </TableCell>
              </TableRow>
            ) : (
              cases.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/cases/${c.id}`)}
                >
                  <TableCell className="font-medium">{c.title || "—"}</TableCell>
                  <TableCell>
                    {c.category ? (
                      <Badge variant="secondary" className="text-xs">{c.category}</Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.workType ? (
                      <Badge variant="secondary" className="text-xs">{c.workType}</Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{c.translator || "—"}</TableCell>
                  <TableCell>{c.reviewer || "—"}</TableCell>
                  <TableCell>
                    {c.taskStatus ? (
                      <Badge className={`text-xs ${taskStatusColors[c.taskStatus] || "bg-muted text-muted-foreground"}`}>
                        {c.taskStatus}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.translationDeadline
                      ? new Date(c.translationDeadline).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">{c.unitCount || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
