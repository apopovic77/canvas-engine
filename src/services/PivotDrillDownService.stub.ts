/**
 * Minimal stub for PivotDrillDownService
 * This is a simplified version for the canvas-engine-template
 * For full pivot functionality, use the complete PivotDrillDownService
 */

import type { Product } from '../types/Product';
import { PivotGroup } from '../layout/PivotGroup';

export type GroupDimension = string;
export type PriceBucketMode = 'static' | 'equal-width' | 'quantile' | 'kmeans';
export type PriceBucketConfig = {
  mode: PriceBucketMode;
  bucketCount: number;
};

export type DrillDownState = {
  dimension: GroupDimension;
  filters: any[];
};

/**
 * Minimal PivotDrillDownService stub
 * Returns default values for basic template functionality
 */
export class PivotDrillDownService {
  private dimension: GroupDimension = 'category:presentation';

  setModel(_analysis: any): void {
    // Stub: no-op
  }

  getState(): DrillDownState {
    return { dimension: this.dimension, filters: [] };
  }

  setState(_state: DrillDownState): void {
    // Stub: no-op
  }

  setPriceBucketConfig(_config: PriceBucketConfig): void {
    // Stub: no-op
  }

  setDimensionOrder(_dimension: GroupDimension, _order: Map<string, number>): void {
    // Stub: no-op
  }

  getGroupKey(product: Product): string {
    // Return category or 'Uncategorized'
    return product.category?.[0] || 'Uncategorized';
  }

  getGroupComparator(): (a: string, b: string) => number {
    // Simple alphabetical sort
    return (a: string, b: string) => a.localeCompare(b);
  }

  getDimension(): GroupDimension {
    return this.dimension;
  }

  setDimension(dimension: GroupDimension): void {
    this.dimension = dimension;
  }

  canUseDimension(_dimension: GroupDimension): boolean {
    return true;
  }

  getHierarchy(): GroupDimension[] {
    return [this.dimension];
  }

  getAvailableDimensions(_products: Product[]): GroupDimension[] {
    return ['category:presentation'];
  }

  setGroupingDimension(dimension: GroupDimension): void {
    this.dimension = dimension;
  }

  getFilters(): any[] {
    return [];
  }

  drillDown(_value: string): boolean {
    return false;
  }

  drillUp(): boolean {
    return false;
  }

  reset(): void {
    // Stub: no-op
  }

  getBreadcrumbs(): string[] {
    return [];
  }

  canDrillUp(): boolean {
    return false;
  }

  canDrillDown(): boolean {
    return false;
  }

  isHeroModeActive(): boolean {
    return false;
  }

  createGroups(products: Product[]): PivotGroup[] {
    // Group by category
    const groups = new Map<string, Product[]>();
    for (const product of products) {
      const key = this.getGroupKey(product);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(product);
    }

    // Convert to PivotGroup array
    return Array.from(groups.entries()).map(([key, items]) => {
      return new PivotGroup(key, key, 0, items.length);
    });
  }

  filterProducts(products: Product[]): Product[] {
    // No filtering in stub
    return products;
  }

  resolveValue(product: Product, _dimension: GroupDimension): string {
    return this.getGroupKey(product);
  }
}
