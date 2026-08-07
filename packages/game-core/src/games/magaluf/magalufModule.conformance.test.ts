import { testGameModuleConformance } from '../../../testing/conformance.js';
import { magalufModule } from './index.js';

// `secretKeys` is empty deliberately, and it is not a gap in this game's
// coverage. The shared suite models secret data as Record<PlayerID, unknown>
// -- one entry per player, e.g. Cahoots' `hands` -- and checks that no
// viewer sees another owner's entry. Magaluf's only hidden state is
// `G.limit`, a single global number every player is equally in the dark
// about, which that shape cannot express: passing it here would fail the
// suite's own `isPlainRecord` assertion rather than test anything.
//
// The limit's visibility rules (hidden until revealed, visible to a player
// who spent a Red Bull, still hidden from everyone else and from spectators)
// are covered explicitly in gameDef.test.ts's "playerView" block.
testGameModuleConformance(magalufModule, { secretKeys: [] });
