// Offline outbox for chat messages.
// Queued items survive reloads (IndexedDB stores File/Blob natively),
// and are flushed in order once the network is back.
import { get, set } from "idb-keyval";

const KEY = "youandme-outbox-v1";

export type OutboxItem = {
  id: string;
  senderId: string;
  body: string | null;
  files: File[];
  replyToId: string | null;
  audio?: { blob: Blob; secs: number; mime: string };
  createdAt: string;
};

export async function readOutbox(): Promise<OutboxItem[]> {
  try {
    return ((await get(KEY)) as OutboxItem[] | undefined) ?? [];
  } catch {
    return [];
  }
}

export async function writeOutbox(items: OutboxItem[]): Promise<void> {
  try {
    await set(KEY, items);
  } catch {
    /* storage unavailable — keep going in memory */
  }
}

export async function enqueue(item: OutboxItem): Promise<OutboxItem[]> {
  const items = [...(await readOutbox()), item];
  await writeOutbox(items);
  return items;
}

export async function dequeue(id: string): Promise<OutboxItem[]> {
  const items = (await readOutbox()).filter((i) => i.id !== id);
  await writeOutbox(items);
  return items;
}

export function newOutboxId() {
  return `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
