import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function writeText(root: string, relativePath: string, content: string): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export function envLine(name: string): string {
  return `${name}=`;
}
