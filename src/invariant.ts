/**
 * Package-owned invariant companion for `dsh-qsearch`.
 */
import type { Context } from '@deepseek-ai/cordis'

const PACKAGE_NAME = 'dsh-qsearch'

/** Cordis companion plugin name. */
export const name = 'qsearch-invariant'

/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package emits a pre-dispatch log event but owns no
 * later authoritative dispatch event to relate it to.
 */
const install = (): void => {}

interface InvariantsHost {
  invariants: { register(packageName: string, installer: () => void): () => void }
}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => {
  const host = ctx as Context & InvariantsHost
  return Promise.resolve(host.invariants.register(PACKAGE_NAME, install))
}
