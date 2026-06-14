export function buildCatDeepLink(fileId: string, projectId: string) {
  return `/cat/team/files/${encodeURIComponent(fileId)}?p=${encodeURIComponent(projectId)}`;
}

export function buildCatProjectLink(projectId: string) {
  return `/cat/team/projects/${encodeURIComponent(projectId)}`;
}
