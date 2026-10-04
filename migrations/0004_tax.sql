-- Tax page: a plan line can be tagged as a tax income/deduction kind; the tax tables hold only what the user typed
-- (paid so far, one-off amounts, hand-typed lines, what-if scenarios). Tax itself is computed in the browser.

ALTER TABLE budget_lines ADD COLUMN tax_kind TEXT;                         -- NULL = not used for tax; a key of shared/tax-rules.ts
CREATE UNIQUE INDEX budget_lines_user_id ON budget_lines(user_id, id);     -- lets tax_lines point here with a composite key

CREATE TABLE tax_years (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year           INTEGER NOT NULL,           -- CE, e.g. 2026
  reserve_thb    REAL NOT NULL DEFAULT 0,    -- tax reserve set aside so far
  reserve_expr   TEXT,
  reserve_as_of  TEXT,                       -- YYYY-MM the reserve amount is as of; NULL = not typed yet
  PRIMARY KEY (user_id, year)
);

CREATE TABLE tax_lines (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  year            INTEGER NOT NULL,
  kind            TEXT NOT NULL,
  label           TEXT NOT NULL,
  budget_line_id  INTEGER,                   -- NULL = typed by hand
  paid_thb        REAL NOT NULL DEFAULT 0,   -- by hand: the whole year · linked: paid so far
  paid_expr       TEXT,
  as_of           TEXT,                      -- YYYY-MM paid_thb is as of; linked lines only
  lump_thb        REAL NOT NULL DEFAULT 0,   -- one-off still to come this year; linked lines only
  lump_expr       TEXT,
  sort            INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id, year) REFERENCES tax_years(user_id, year) ON DELETE CASCADE,
  -- the Worker detaches a tax line before its plan line goes (the paid amount is kept); this cascade is only the backstop
  FOREIGN KEY (user_id, budget_line_id) REFERENCES budget_lines(user_id, id) ON DELETE CASCADE,
  UNIQUE (user_id, year, budget_line_id)
);
CREATE INDEX tax_lines_user ON tax_lines(user_id, year);

CREATE TABLE tax_scenarios (
  id       INTEGER PRIMARY KEY,
  user_id  INTEGER NOT NULL,
  year     INTEGER NOT NULL,
  name     TEXT NOT NULL,
  changes  TEXT NOT NULL,                    -- JSON: [{ "kind": "ded_rmf", "thb": 100000 }]
  sort     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id, year) REFERENCES tax_years(user_id, year) ON DELETE CASCADE
);
CREATE INDEX tax_scenarios_user ON tax_scenarios(user_id, year);
