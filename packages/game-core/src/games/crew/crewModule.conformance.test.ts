import { testGameModuleConformance } from '../../../testing/conformance.js';
import { crewModule } from './index.js';

testGameModuleConformance(crewModule, { secretKeys: ['hands'] });
