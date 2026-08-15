/** Package-owned invariant companion for the mobile carrier. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-mobile-access'

/** Cordis companion plugin name. */
export const name = 'host-mobile-access-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/** No runtime invariant: listener lifecycle has no meaningful companion state to compare. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
