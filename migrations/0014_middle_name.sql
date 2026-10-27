ALTER TABLE people ADD COLUMN middle_name TEXT;

-- Only split an unambiguous single trailing initial; compound names remain unchanged.
UPDATE people
SET middle_name=substr(trim(first_name), instr(trim(first_name), ' ')+1),
    first_name=substr(trim(first_name), 1, instr(trim(first_name), ' ')-1),
    updated_at=CURRENT_TIMESTAMP
WHERE middle_name IS NULL
  AND trim(first_name) GLOB '* [A-Z]'
  AND trim(first_name) NOT GLOB '* * *';
