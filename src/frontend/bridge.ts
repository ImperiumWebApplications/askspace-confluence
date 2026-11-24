import { invoke as rawInvoke } from '@forge/bridge';

export async function invoke<T>(
  functionKey: string,
  payload?: Record<string, unknown>
): Promise<T> {
  return (await rawInvoke(functionKey, payload)) as T;
}
