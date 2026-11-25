# Data Architecture & Persistence Layer

The frontend menu continues to read restaurant and menu content from static JSON assets. A separate reservation API defines a PostgreSQL persistence layer using SQL through `pg`, with Supabase Auth identity and tenant memberships; the RLS migration and database behavior have not yet been verified against a live Supabase project.

## Database Configuration

| Service/Module | DB Type | Profile | Driver | Connection | Migration Tool |
|---|---|---|---|---|---|
| Menu Smart QR frontend | None | All | Angular `HttpClient` | Static files under `src/assets` | None |
| Reservation API | Supabase PostgreSQL | All configured environments | `pg` Node.js driver | `DATABASE_URL`; pool size 10; optional verified TLS | Custom SQL runner in `server/src/migrate.ts` |

The schema is in `server/migrations/001_reservation_schema.sql` and `server/migrations/002_supabase_tenant_security.sql`; migrations are recorded in `schema_migrations`. Supabase Auth verifies staff access tokens. Membership and read-only tenant RLS policies are defined, but no seed membership exists and neither migration has been verified against a live Supabase project.

## Data Ownership per Service

| Service | Tables Owned | ORM Framework | Caching | Notes |
|---|---|---|---|---|
| Menu Smart QR frontend | None; reads `client.json`, `menu/*.json`, and `allergens.json` | None | In-memory RxJS `shareReplay` for loaded assets | The source of truth is the static asset tree. |
| Reservation API | `restaurants`, `restaurant_memberships`, `dining_areas`, `restaurant_tables`, `table_combinations`, `opening_hours`, `service_shifts`, `availability_rules`, `closures`, `guests`, `reservations`, `reservation_tables`, `table_blocks`, `payment_guarantees`, `reservation_events`, `notifications`, `consent_records` | None; parameterized SQL with `pg` | None | Supabase Auth verification and tenant-scoped read policies are defined; migration application and RLS behavior remain unverified. |
| Order cart | None | None | In-memory `Map` and `BehaviorSubject` | Cart contents are lost on page reload. |

## Entity Model

The TypeScript interfaces in `src/app/core/models/client.model.ts`, `src/app/core/models/menu.model.ts`, and `src/app/core/models/allergen.model.ts` describe JSON structures, not persisted database entities. Reservation tables are defined in `server/migrations/001_reservation_schema.sql`; tenant memberships and RLS are in `server/migrations/002_supabase_tenant_security.sql`. Queries are in `server/src/availability.ts`, `server/src/reservation-service.ts`, and `server/src/tenant-database.ts`.

<!-- mermaid-checked: every attribute is `<type> <name> [<key>] ["<description>"]` with at most one of PK/FK/UK, no \n in descriptions, no {} in descriptions, every relationship label is double-quoted -->
~~~mermaid
erDiagram
    Client ||--o{ MenuCategory : "configures"
    Client ||--o{ Allergen : "describes"
    MenuCategory ||--o{ MenuItem : "contains"
    MenuItem }o--o{ Allergen : "references"
    Restaurant ||--o{ DiningArea : "contains"
    Restaurant ||--o{ RestaurantMembership : "has members"
    AuthUser ||--o{ RestaurantMembership : "has memberships"
    Restaurant ||--o{ Guest : "records guest"
    DiningArea ||--o{ RestaurantTable : "contains"
    DiningArea ||--o{ TableCombination : "defines"
    TableCombination }o--o{ RestaurantTable : "combines"
    Restaurant ||--o{ Reservation : "receives"
    Guest ||--o{ Reservation : "makes"
    Reservation ||--o{ ReservationTable : "allocates"
    RestaurantTable ||--o{ ReservationTable : "assigned in"
    Reservation ||--o{ ReservationEvent : "records"
    Reservation ||--o{ ConsentRecord : "records"
    Reservation ||--o| PaymentGuarantee : "tracks"
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
    Restaurant {
        string id PK
        string name
        string timeZone
    }
    AuthUser {
        uuid id PK "Supabase Auth user"
    }
    RestaurantMembership {
        uuid userId PK "also FK to AuthUser"
        string restaurantId PK "also FK to Restaurant"
        string role
        timestamp createdAt
    }
    DiningArea {
        uuid id PK
        string restaurantId FK
        string name
    }
    RestaurantTable {
        uuid id PK
        uuid diningAreaId FK
        string name
        string shape
        int minCapacity
        int standardCapacity
        int maxCapacity
    }
    TableCombination {
        uuid id PK
        uuid diningAreaId FK
        string name
    }
    Guest {
        uuid id PK
        string restaurantId FK
        string name
        string phone
        string email
    }
    Reservation {
        uuid id PK
        string restaurantId FK
        uuid guestId FK
        string status
        timestamp startsAt
        timestamp endsAt
        int partySizeInitial
        int partySizeCurrent
        int partySizeArrived
    }
    ReservationTable {
        uuid reservationId PK "also FK to Reservation"
        uuid tableId PK "also FK to RestaurantTable"
        string status
    }
    ReservationEvent {
        bigint id PK
        uuid reservationId FK
        string actorType
        string reason
    }
    ConsentRecord {
        bigint id PK
        uuid reservationId FK
        string consentType
        bool accepted
    }
    PaymentGuarantee {
        uuid id PK
        uuid reservationId UK "also FK to Reservation"
        string status
        string providerReference
    }
~~~

Client, menu, and allergen relationships in the diagram represent logical JSON references without database constraints. Reservation entities represent the PostgreSQL schema and its declared keys and relationships.

## Key Repository Methods

| Service | Repository or query module | Notable Methods | Purpose |
|---|---|---|---|
| Client data | `ClientService` (`src/app/core/services/client.service.ts`) | `getClient()` | Loads the selected client's static JSON document. |
| Menu data | `MenuService` (`src/app/core/services/menu.service.ts`) | `getMenuCategories()` | Loads enabled category files and normalizes menu items. |
| Allergen data | `AllergenService` (`src/app/core/services/allergen.service.ts`) | `getAllergens()`, `getAllergenById()` | Loads and queries the static allergen list. |
| Reservation API | SQL modules (`server/src/availability.ts`, `server/src/reservation-service.ts`, `server/src/tenant-database.ts`) | `resolveReservationTiming()`, `findAvailability()`, `createReservationHold()`, `confirmReservation()`, `cancelReservation()`, `listRestaurantsForUser()`, `listReservationsForRestaurant()` | Resolves schedule and capacity, performs transactional reservation writes, and scopes staff reads to authenticated tenant membership. |

There are no repository interfaces or ORM; database operations are parameterized SQL through `pg`. The API modules compile and unit/HTTP validation tests pass, but SQL and tenant isolation have not been run against Supabase PostgreSQL.

## Caching Strategy

`ClientService`, `MenuService`, and `AllergenService` share loaded observables in process memory with RxJS `shareReplay(1)`. This is not a durable cache and has no explicit TTL or invalidation policy. `OrderCartService` keeps cart entries in a `Map` and emits state through a `BehaviorSubject`; it does not persist the cart to browser storage. The reservation API has no cache.

## Data Ownership Boundaries

The frontend reads public static assets from the active client's directory. The reservation API is a separate module with its own PostgreSQL schema; it does not currently read menu JSON or have a configured production deployment. Staff identity is verified server-side through Supabase Auth; staff reads are scoped by `restaurant_memberships` and RLS in transaction-local `authenticated` sessions. Public guest booking endpoints remain server-side and use unguessable reservation codes; the database credential is not placed in the frontend. Live RLS behavior and deployment configuration remain unverified, and menu and reservation stores are not synchronized.

### Data Classification & Sensitivity

| Entity | Sensitive Fields | Classification (PII/PHI/PCI/None) | Controls in Place |
|---|---|---|---|
| Client contacts | Phone, email, address | PII | Public client configuration; no field-level encryption or access control. |
| MenuItem and Allergen | Dish and allergen metadata | None for an identified guest | Static public assets. |
| Reservation form | Name, phone, date, time, party size, optional note | PII; note content is not constrained | Form constructs a WhatsApp link; the app has no reservation database. WhatsApp is an external recipient. |
| RestaurantMembership | Supabase Auth user ID, restaurant ID, role | PII-linked identifier | Membership lookup is tenant-scoped by RLS; migration is not yet applied or verified. |
| Guest | Name, phone, email | PII | Rows are associated with a restaurant and have tenant-scoped read policies; no field-level encryption, masking, or retention automation. RLS is not yet verified on a live project. |
| Reservation | Confirmation code hash, party sizes, dates, status | PII when linked to Guest | Confirmation code is hashed; tenant-scoped read policy is defined. No database-level field encryption or retention automation; RLS is unverified. |
| PaymentGuarantee | Provider reference, amount, currency | Payment metadata; no card data | Schema does not store PAN or CVV; no provider integration exists. |

No payment card number or CVV is stored by the frontend or reservation schema.
