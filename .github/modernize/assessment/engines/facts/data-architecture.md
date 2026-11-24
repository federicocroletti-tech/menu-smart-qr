# Data Architecture & Persistence Layer

The current data layer reads restaurant and menu content from static JSON assets; it has no database, ORM, or persistent reservation store. The proposed reservation domain and PostgreSQL model are documented separately in [reservation-system-design.md](../../../../../docs/reservation-system-design.md).

## Database Configuration

| Service/Module | DB Type | Profile | Driver | Connection | Migration Tool |
|---|---|---|---|---|---|
| Menu Smart QR frontend | None | All | Angular `HttpClient` | Static files under `src/assets` | None |

No database connection, schema migration, or seed runner is configured in the repository.

## Data Ownership per Service

| Service | Tables Owned | ORM Framework | Caching | Notes |
|---|---|---|---|---|
| Menu Smart QR frontend | None; reads `client.json`, `menu/*.json`, and `allergens.json` | None | In-memory RxJS `shareReplay` for loaded assets | The source of truth is the static asset tree. |
| Order cart | None | None | In-memory `Map` and `BehaviorSubject` | Cart contents are lost on page reload. |

## Entity Model

The TypeScript interfaces in `src/app/core/models/client.model.ts`, `src/app/core/models/menu.model.ts`, and `src/app/core/models/allergen.model.ts` describe JSON structures, not persisted database entities. Services consuming these structures are `ClientService`, `MenuService`, and `AllergenService` in `src/app/core/services/`.

<!-- mermaid-checked: every attribute is `<type> <name> [<key>] ["<description>"]` with at most one of PK/FK/UK, no \n in descriptions, no {} in descriptions, every relationship label is double-quoted -->
~~~mermaid
erDiagram
    Client ||--o{ MenuCategory : "configures"
    Client ||--o{ Allergen : "describes"
    MenuCategory ||--o{ MenuItem : "contains"
    MenuItem }o--o{ Allergen : "references"
    Client {
        string id
        string name
        string type
        string defaultLanguage
    }
    MenuCategory {
        string id
        string name
        int order
        bool enabled
    }
    MenuItem {
        string id
        string name
        decimal price
        string currency
        bool available
    }
    Allergen {
        string id
        string name
    }
~~~

The diagram represents logical JSON references. There are no foreign-key constraints or relational mappings.

## Key Repository Methods

| Service | Repository | Notable Methods | Purpose |
|---|---|---|---|
| Client data | `ClientService` (`src/app/core/services/client.service.ts`) | `getClient()` | Loads the selected client's static JSON document. |
| Menu data | `MenuService` (`src/app/core/services/menu.service.ts`) | `getMenuCategories()` | Loads enabled category files and normalizes menu items. |
| Allergen data | `AllergenService` (`src/app/core/services/allergen.service.ts`) | `getAllergens()`, `getAllergenById()` | Loads and queries the static allergen list. |

There are no database repository interfaces or custom SQL queries.

## Caching Strategy

`ClientService`, `MenuService`, and `AllergenService` share loaded observables in process memory with RxJS `shareReplay(1)`. This is not a durable cache and has no explicit TTL or invalidation policy. `OrderCartService` keeps cart entries in a `Map` and emits state through a `BehaviorSubject`; it does not persist the cart to browser storage.

## Data Ownership Boundaries

The frontend reads public static assets from the active client's directory. There are no independently deployed data services or cross-service database reads. Menu data, restaurant details, and allergens are separate JSON documents related by identifiers and configured category file names.

### Data Classification & Sensitivity

| Entity | Sensitive Fields | Classification (PII/PHI/PCI/None) | Controls in Place |
|---|---|---|---|
| Client contacts | Phone, email, address | PII | Public client configuration; no field-level encryption or access control. |
| MenuItem and Allergen | Dish and allergen metadata | None for an identified guest | Static public assets. |
| Reservation form | Name, phone, date, time, party size, optional note | PII; note content is not constrained | Form constructs a WhatsApp link; the app has no reservation database. WhatsApp is an external recipient. |

No payment card data is stored by this frontend.
