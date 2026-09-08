ALTER TABLE grocery_items ADD COLUMN requester_person_id TEXT REFERENCES people(id);
ALTER TABLE news_posts ADD COLUMN sender_person_id TEXT REFERENCES people(id);
ALTER TABLE news_posts ADD COLUMN home_notice INTEGER NOT NULL DEFAULT 0 CHECK(home_notice IN (0,1));
