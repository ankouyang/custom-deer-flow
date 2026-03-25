function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function generateWorkspaceFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "user";
  const base = slugify(localPart) || "user";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
