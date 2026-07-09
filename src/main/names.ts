import { ANIMALS } from "./data/animals";

export function generateWorktreeName(taken: (name: string) => boolean): string {
  const pool = ANIMALS.filter((w) => !taken(w));
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)]!;
  for (let n = 2; ; n++) {
    for (const w of ANIMALS) {
      const candidate = `${w}-${n}`;
      if (!taken(candidate)) return candidate;
    }
  }
}
