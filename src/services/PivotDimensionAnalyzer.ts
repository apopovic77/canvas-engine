/**
 * STUB: PivotDimensionAnalyzer
 * Minimal stub to satisfy LayoutService and PivotDrillDownService dependencies
 */

export type PivotDimensionKind = 'enum' | 'numeric' | 'date' | 'text';

export type NumericBucket = {
  min: number;
  max: number;
  label: string;
  count?: number;
  inclusiveMax?: boolean;
};

export type NumericDimensionConfig = {
  unit?: string;
  buckets?: NumericBucket[];
};

export type DimensionSource = {
  type: string;
  key?: string;
  level?: number;
};

export type PivotDimensionDefinition = {
  id: string;
  label: string;
  type?: string;
  key?: string;
  role?: string;
  parentKey?: string;
  numeric?: boolean | NumericDimensionConfig;
  source?: string | DimensionSource;
  attributeKey?: string;
};

export type PivotAnalysisResult = {
  dimensions: PivotDimensionDefinition[];
  values: Map<string, any[]>;
};

/**
 * Stub class for pivot dimension analysis
 */
export class PivotDimensionAnalyzer {
  constructor() {}

  /**
   * Stub: Returns empty array
   */
  getAvailableDimensions(): PivotDimensionDefinition[] {
    return [];
  }

  /**
   * Stub: Returns null
   */
  getDimensionById(id: string): PivotDimensionDefinition | null {
    return null;
  }

  /**
   * Stub: Returns empty array
   */
  getValuesForDimension(dimensionId: string): any[] {
    return [];
  }

  /**
   * Stub: Returns empty map
   */
  analyzeProducts(products: any[]): PivotAnalysisResult {
    return {
      dimensions: [],
      values: new Map()
    };
  }
}

export const pivotDimensionAnalyzer = new PivotDimensionAnalyzer();
