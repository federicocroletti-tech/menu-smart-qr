import type { Pool, QueryResultRow } from "pg";

export interface RestaurantContent {
  client: Record<string, unknown>;
  allergens: unknown[];
  menuIndex: Record<string, unknown>;
  menuCategories: Record<string, unknown>;
}

export interface RestaurantContentStore {
  getRestaurantContent(restaurantId: string): Promise<RestaurantContent | null>;
}

interface RestaurantContentRow extends QueryResultRow {
  client_data: Record<string, unknown>;
  allergens: unknown[];
  menu_index: Record<string, unknown>;
  menu_categories: Record<string, unknown>;
}

export function createRestaurantContentStore(pool: Pool): RestaurantContentStore {
  return {
    async getRestaurantContent(restaurantId) {
      const result = await pool.query<RestaurantContentRow>(
        `SELECT client_data, allergens, menu_index, menu_categories
         FROM restaurant_content
         WHERE restaurant_id = $1`,
        [restaurantId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        client: row.client_data,
        allergens: row.allergens,
        menuIndex: row.menu_index,
        menuCategories: row.menu_categories,
      };
    },
  };
}
