export const PIVOT_CONFIG = {
  bucketGap: 100,
  bucketPadding: 20,
};

// Active pivot profile for layout service
export const ACTIVE_PIVOT_PROFILE = {
  presentationCategoryOrder: [] as string[],
  productFamilyOrders: {} as Record<string, string[]>,
  getProductFamilyOrderForCategory: (_category: string) => [] as string[],
  heroThreshold: 12,
  priceRefineThreshold: 20,
  getPreferredChildDimension: (_parentDimension: string, _parentValue: string) => null as string | null,
  getPreferredGrandchildDimension: (_parentDimension: string, _parentValue: string, _childDimension: string, _childValue: string) => null as string | null,
  isClothingContext: (_category: string) => false,
  isProtectorContext: (_category: string) => false,
};
