import { testGameModuleConformance } from '../../../testing/conformance.js';
import { cahootsModule } from './index.js';

testGameModuleConformance(cahootsModule, { secretKeys: ['hands'] });
