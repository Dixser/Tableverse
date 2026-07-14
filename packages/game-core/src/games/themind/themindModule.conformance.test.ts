import { testGameModuleConformance } from '../../../testing/conformance.js';
import { themindModule } from './index.js';

testGameModuleConformance(themindModule, { secretKeys: ['hands'] });
