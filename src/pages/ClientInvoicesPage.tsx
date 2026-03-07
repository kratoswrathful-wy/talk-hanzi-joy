import { motion } from "framer-motion";

export default function ClientInvoicesPage() {
  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">客戶請款</h1>
      </div>

      <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
        此功能即將推出，敬請期待。
      </div>
    </motion.div>
  );
}
