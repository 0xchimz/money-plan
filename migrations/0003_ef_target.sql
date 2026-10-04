-- Emergency-fund target per user = ef_months × a monthly amount. The amount is the ตกงาน plan's expenses
-- (ef_mode = 'plan') or one the user typed (ef_mode = 'custom'). Both modes share ef_months.

ALTER TABLE users ADD COLUMN ef_mode TEXT NOT NULL DEFAULT 'plan';   -- plan | custom
ALTER TABLE users ADD COLUMN ef_months INTEGER NOT NULL DEFAULT 6;   -- 1..60
ALTER TABLE users ADD COLUMN ef_monthly REAL;                        -- THB per month typed for 'custom'; kept while the mode is 'plan'
ALTER TABLE users ADD COLUMN ef_monthly_expr TEXT;                   -- what was typed when it was a sum
