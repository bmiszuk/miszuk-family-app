-- Vehicles Phase 1 foundation only. No seeds or changes to existing tables.
CREATE TABLE vehicles (
 id TEXT PRIMARY KEY NOT NULL,
 household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
 primary_driver_id TEXT REFERENCES people(id) ON DELETE RESTRICT,
 year INTEGER CHECK(year IS NULL OR (typeof(year)='integer' AND year BETWEEN 1886 AND 9999)),
 make TEXT NOT NULL CHECK(length(trim(make)) BETWEEN 1 AND 100),
 model TEXT NOT NULL CHECK(length(trim(model)) BETWEEN 1 AND 100),
 trim TEXT NOT NULL DEFAULT '',
 vin TEXT NOT NULL DEFAULT '',
 license_plate TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','sold_inactive')),
 purchase_date TEXT CHECK(purchase_date IS NULL OR (length(purchase_date)=10 AND purchase_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
 purchase_mileage INTEGER CHECK(purchase_mileage IS NULL OR (typeof(purchase_mileage)='integer' AND purchase_mileage>=0)),
 current_mileage INTEGER CHECK(current_mileage IS NULL OR (typeof(current_mileage)='integer' AND current_mileage>=0)),
 engine TEXT NOT NULL DEFAULT '',
 oil_specification TEXT NOT NULL DEFAULT '',
 oil_capacity TEXT NOT NULL DEFAULT '',
 oil_filter_references TEXT NOT NULL DEFAULT '[]' CHECK(CASE WHEN json_valid(oil_filter_references) THEN json_type(oil_filter_references)='array' ELSE 0 END),
 front_tire_size TEXT NOT NULL DEFAULT '',
 rear_tire_size TEXT NOT NULL DEFAULT '',
 front_tire_pressure TEXT NOT NULL DEFAULT '',
 rear_tire_pressure TEXT NOT NULL DEFAULT '',
 driver_wiper_size TEXT NOT NULL DEFAULT '',
 passenger_wiper_size TEXT NOT NULL DEFAULT '',
 rear_wiper_size TEXT NOT NULL DEFAULT '',
 lug_nut_socket_size TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version)='integer' AND version>=1)
);
CREATE INDEX idx_vehicles_household ON vehicles(household_id,status,make,model,id);

CREATE TABLE vehicle_maintenance (
 id TEXT PRIMARY KEY NOT NULL,
 vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
 service_date TEXT NOT NULL CHECK(length(service_date)=10 AND service_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 mileage INTEGER CHECK(mileage IS NULL OR (typeof(mileage)='integer' AND mileage>=0)),
 category TEXT CHECK(category IS NULL OR category IN ('Oil & Filter','Tires','Brakes','Battery','Fluids','Engine','Transmission','Suspension/Steering','Electrical','HVAC','Body/Glass','Inspection','Other')),
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 500),
 performed_by TEXT NOT NULL DEFAULT '' CHECK(length(performed_by)<=200),
 total_cost_cents INTEGER CHECK(total_cost_cents IS NULL OR (typeof(total_cost_cents)='integer' AND total_cost_cents>=0)),
 notes TEXT NOT NULL DEFAULT '',
 created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 updated_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version)='integer' AND version>=1),
 deleted_at TEXT,
 deleted_by_user_id TEXT REFERENCES app_users(id) ON DELETE RESTRICT,
 CHECK((deleted_at IS NULL AND deleted_by_user_id IS NULL) OR (deleted_at IS NOT NULL AND deleted_by_user_id IS NOT NULL))
);
CREATE INDEX idx_vehicle_maintenance_history ON vehicle_maintenance(vehicle_id,deleted_at,service_date DESC,id);

-- Driver assignment must be valid at assignment time. Later Directory moves do not
-- silently rewrite vehicle history; the service rejects retaining an invalid driver on save.
CREATE TRIGGER vehicle_driver_insert BEFORE INSERT ON vehicles
WHEN NEW.primary_driver_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'vehicles: Choose an active driver in the vehicle household.')
 WHERE NOT EXISTS(SELECT 1 FROM people WHERE id=NEW.primary_driver_id AND household_id=NEW.household_id AND deleted_at IS NULL);
END;
CREATE TRIGGER vehicle_driver_update BEFORE UPDATE OF primary_driver_id,household_id ON vehicles
WHEN NEW.primary_driver_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'vehicles: Choose an active driver in the vehicle household.')
 WHERE NOT EXISTS(SELECT 1 FROM people WHERE id=NEW.primary_driver_id AND household_id=NEW.household_id AND deleted_at IS NULL);
END;
