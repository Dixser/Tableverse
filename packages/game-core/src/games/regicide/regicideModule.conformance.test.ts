import { testGameModuleConformance } from '../../../testing/conformance.js';
import { regicideModule } from './index.js';

testGameModuleConformance(regicideModule, { secretKeys: ['hands'] });
