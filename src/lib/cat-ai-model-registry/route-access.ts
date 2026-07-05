export type AppRoleRow = { role: string };

/** executive-only：CAT AI 模型 registry 管理頁（Phase 3A 路由守衛）。 */
export function canAccessCatAiModelRegistry(roles: AppRoleRow[]): boolean {
  return roles.some((r) => r.role === "executive");
}
