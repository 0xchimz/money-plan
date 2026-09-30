-- USD rows on the balance sheet: each month has its own USD/THB rate, and a row can be typed in USD.
-- balance_entries.thb stays the THB value everything else reads (net worth, Overview, history, importers);
-- for a USD row it is always ROUND(usd * the month's usd_thb, 2), recomputed whenever the rate changes.

ALTER TABLE balance_months ADD COLUMN usd_thb REAL;      -- THB per 1 USD at month end; NULL = no rate yet (no USD rows allowed)
ALTER TABLE balance_months ADD COLUMN usd_thb_at TEXT;   -- NULL = carried over from the previous month, not confirmed yet
ALTER TABLE balance_entries ADD COLUMN usd REAL;         -- amount typed in USD; NULL = typed in THB (expr is in the row's currency)
