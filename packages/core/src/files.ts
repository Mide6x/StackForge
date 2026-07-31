// SPDX-License-Identifier: MPL-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertNoSymlinkEscape } from "./path-safety.js";

export async function writeText(root: string, relativePath: string, content: string): Promise<void> {
  const filePath = await assertNoSymlinkEscape(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export function envLine(name: string): string {
  return `${name}=`;
}
