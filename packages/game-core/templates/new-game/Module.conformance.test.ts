import { testGameModuleConformance } from '../../../testing/conformance.js';
import { __SLUG__Module } from './index.js';

// TODO: update secretKeys once this game has hidden information.
testGameModuleConformance(__SLUG__Module, { secretKeys: [] });
