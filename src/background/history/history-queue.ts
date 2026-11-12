/**
 * The single write queue of the import history (spec 012, R1.4). Every operation that reads then writes, or
 * deletes, `importHistory:*` keys goes through it: the history store (start, update, reconcile, list with its
 * pruning, remove, clear, setEnabled) and the configuration store (erasing at `delete()` and at a locked
 * reconfiguration). Module without dependency, so that `config-store.ts` can use it without an import cycle.
 * A failed operation does not block the next one.
 */
let queue: Promise<unknown> = Promise.resolve();

export function enqueueHistoryWrite<T>(op: () => Promise<T>): Promise<T> {
  const result = queue.then(op);
  queue = result.catch(() => undefined);
  return result;
}
