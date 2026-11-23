import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';

/** Outcome of reading the target collection after a connection test (spec 024, FR-007). */
export type TargetCollection = { name: string } | { error: ErrorCode } | null;

/**
 * Collection the imports of an instance go to, read on HomeBox (`instance/collections`, which also refreshes the name
 * shown in the summary). A chosen collection no longer reachable is `COLLECTION_UNAVAILABLE`; another failure is its
 * code (never silent); no answer (page closing) is null. Nothing is logged.
 */
export async function readTargetCollection(instanceId: string): Promise<TargetCollection> {
  try {
    const res = await send({ type: 'instance/collections', instanceId });
    if (!res) return null;
    if (!res.ok) return { error: res.error };
    if (!res.value) return null;
    if (res.value.missing) return { error: 'COLLECTION_UNAVAILABLE' };
    return { name: (res.value.setting.chosen ?? res.value.defaultCollection).name };
  } catch {
    return { error: 'COLLECTIONS_UNAVAILABLE' };
  }
}
