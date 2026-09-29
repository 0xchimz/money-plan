-- money-plan schema: every user-owned row carries user_id; composite foreign keys keep one user's rows
-- from ever pointing at another user's rows. D1 enforces foreign keys (test/schema.test.ts checks it).

CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,     -- lower-case, from a verified Google ID token
  name        TEXT,
  picture     TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,         -- SHA-256 (hex) of the cookie token; the token itself is never stored
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE tier_targets (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier     TEXT NOT NULL,               -- Foundation | Core | Growth | High Risk
  target   REAL NOT NULL,               -- 0..1, the four add up to 1
  PRIMARY KEY (user_id, tier)
);

CREATE TABLE budget_scenarios (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id       TEXT NOT NULL,               -- main | proj | em
  name     TEXT NOT NULL,
  note     TEXT,
  sort     INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE budget_lines (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL,
  scenario  TEXT NOT NULL,
  type      TEXT NOT NULL,              -- Income | Saving | Expense
  category  TEXT NOT NULL,              -- Saving lines: Saving | Investment | Education
  item      TEXT NOT NULL,
  thb       REAL NOT NULL,              -- per month, >= 0
  expr      TEXT,                       -- what was typed when it was a sum, e.g. 3638+5000
  account   TEXT,                       -- "bank/sub-account: note", optional
  sort      INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id, scenario) REFERENCES budget_scenarios(user_id, id) ON DELETE CASCADE
);
CREATE INDEX budget_lines_user ON budget_lines(user_id, scenario);

CREATE TABLE balance_items (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side      TEXT NOT NULL,              -- asset | liability
  category  TEXT NOT NULL,
  item      TEXT NOT NULL,
  tier      TEXT,                       -- NULL = not in the investment portfolio
  type      TEXT,                       -- set only when tier is set
  country   TEXT,
  active    INTEGER NOT NULL DEFAULT 1, -- 0 = not carried into new months
  sort      REAL NOT NULL DEFAULT 0,
  UNIQUE (user_id, side, category, item),
  UNIQUE (user_id, id)
);

CREATE TABLE balance_months (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,            -- YYYY-MM
  status      TEXT NOT NULL,            -- draft | closed
  updated_at  TEXT NOT NULL,
  closed_at   TEXT,
  PRIMARY KEY (user_id, month)
);

CREATE TABLE balance_entries (
  user_id     INTEGER NOT NULL,
  month       TEXT NOT NULL,
  item_id     INTEGER NOT NULL,
  thb         REAL NOT NULL,
  expr        TEXT,
  updated_at  TEXT,                     -- NULL = carried over from last month, not confirmed yet
  PRIMARY KEY (user_id, month, item_id),
  FOREIGN KEY (user_id, month) REFERENCES balance_months(user_id, month) ON DELETE CASCADE,
  FOREIGN KEY (user_id, item_id) REFERENCES balance_items(user_id, id) ON DELETE CASCADE
);

CREATE TABLE balance_transfers (
  user_id  INTEGER NOT NULL,
  month    TEXT NOT NULL,
  bank     TEXT NOT NULL,
  done_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, month, bank),
  FOREIGN KEY (user_id, month) REFERENCES balance_months(user_id, month) ON DELETE CASCADE
);
