import { DEMO_SNAPSHOT } from '../demo/data';
import type { ListSource } from './list-source';

export const demoSource: ListSource = {
  /** Возвращает независимый демонстрационный набор без сетевых запросов. */
  async load(_profileInput) {
    return structuredClone(DEMO_SNAPSHOT);
  },
};
