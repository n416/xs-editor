// 追加の部品の目次。parts/ の 1 部品 1 ファイルをここに並べる（xsasm-parts.js が読む）
import vfin from './vfin.js';
import headband from './headband.js';
import collar from './collar.js';
import maska from './maska.js';
import mask from './mask.js';
import china from './china.js';
import finplate from './finplate.js';
import horn from './horn.js';
import antenna from './antenna.js';
import visorhelm from './visorhelm.js';
import earblock from './earblock.js';
import chinguard from './chinguard.js';
import neck from './neck.js';
import monoeye from './monoeye.js';
import twineyes from './twineyes.js';
import backfin from './backfin.js';
import thruster from './thruster.js';
import cheekguard from './cheekguard.js';
import headpipe from './headpipe.js';
import peakhelm from './peakhelm.js';
import spine from './spine.js';
import heavyhelm from './heavyhelm.js';
import roundhelm from './roundhelm.js';
import sniperhelm from './sniperhelm.js';
import scopehelm from './scopehelm.js';
// （首は首当ての前：カタログに「首」「首当て」の順で並ぶ）
export const EXTRA = [vfin, headband, maska, mask, china, finplate, horn, antenna, visorhelm, earblock, chinguard, neck, collar, monoeye, twineyes, backfin, thruster, cheekguard, headpipe, peakhelm, spine, heavyhelm, roundhelm, sniperhelm, scopehelm].flat();
