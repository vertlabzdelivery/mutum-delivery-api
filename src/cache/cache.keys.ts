export const CacheKeys = {
  restaurantsAll: 'mutum:restaurants:list:all',
  restaurantsActive: 'mutum:restaurants:list:active',
  restaurantDetail: (restaurantId: string) =>
    `mutum:restaurants:detail:${restaurantId}`,
  menuItems: (restaurantId: string, onlyAvailable?: boolean) =>
    `mutum:menu:restaurant:${restaurantId}:items:${
      onlyAvailable === undefined
        ? 'all'
        : onlyAvailable
          ? 'available'
          : 'with-unavailable'
    }`,
  menuCatalog: (restaurantId: string, onlyAvailable = true) =>
    `mutum:menu:restaurant:${restaurantId}:catalog:${
      onlyAvailable ? 'available' : 'all'
    }`,
  menuCategories: (restaurantId: string, activeOnly?: boolean) =>
    `mutum:menu:restaurant:${restaurantId}:categories:${
      activeOnly ? 'active' : 'all'
    }`,
  menuItem: (itemId: string) => `mutum:menu:item:${itemId}`,
  publicDeliveryZones: (restaurantId: string) =>
    `mutum:restaurant-delivery-zones:public:${restaurantId}`,
  states: 'mutum:locations:states',
  state: (stateId: string) => `mutum:locations:state:${stateId}`,
  citiesByState: (stateId: string) => `mutum:locations:state:${stateId}:cities`,
  city: (cityId: string) => `mutum:locations:city:${cityId}`,
  neighborhoodsByCity: (cityId: string) =>
    `mutum:locations:city:${cityId}:neighborhoods`,
  neighborhood: (neighborhoodId: string) =>
    `mutum:locations:neighborhood:${neighborhoodId}`,
};

export const CachePrefixes = {
  restaurantMenu: (restaurantId: string) => `mutum:menu:restaurant:${restaurantId}:`,
};

export const getRestaurantMenuCacheKeys = (restaurantId: string) => [
  CacheKeys.menuItems(restaurantId),
  CacheKeys.menuItems(restaurantId, true),
  CacheKeys.menuItems(restaurantId, false),
  CacheKeys.menuCatalog(restaurantId, true),
  CacheKeys.menuCatalog(restaurantId, false),
  CacheKeys.menuCategories(restaurantId),
  CacheKeys.menuCategories(restaurantId, true),
];
