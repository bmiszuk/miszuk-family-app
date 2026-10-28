-- Add a fixed store preference to grocery items. Existing rows default to Any.
ALTER TABLE grocery_items ADD COLUMN store TEXT NOT NULL DEFAULT 'any' CHECK(store IN ('costco', 'walmart', 'aldi', 'any'));
