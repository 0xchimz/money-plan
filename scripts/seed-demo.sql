-- Demo user for local dev: set DEV_USER_EMAIL=demo@money-plan.local in .dev.vars, then `pnpm db:seed:demo`.
-- Six closed months (2026-04 → 2026-09) and a plan whose numbers match the mockups. Re-running replaces the user.
DELETE FROM users WHERE email = 'demo@money-plan.local';

INSERT INTO users (email, name, picture, created_at) VALUES ('demo@money-plan.local', 'Demo', NULL, '2026-04-01T00:00:00.000Z');

-- Budget scenarios
INSERT INTO budget_scenarios (user_id, id, name, note, sort)
SELECT id, 'main', 'ปัจจุบัน', NULL, 0 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_scenarios (user_id, id, name, note, sort)
SELECT id, 'proj', 'Projection', 'แผนอนาคต เช่น หลังขึ้นเงินเดือน แต่งงาน ย้ายบ้าน', 1 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_scenarios (user_id, id, name, note, sort)
SELECT id, 'em', 'ตกงาน', 'รายจ่ายที่ยังต้องจ่ายถ้าไม่มีรายได้ · ใช้คำนวณเป้าเงินสำรองฉุกเฉิน', 2 FROM users WHERE email = 'demo@money-plan.local';

-- Tier targets
INSERT INTO tier_targets (user_id, tier, target) SELECT id, 'Foundation', 0.10 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO tier_targets (user_id, tier, target) SELECT id, 'Core', 0.40 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO tier_targets (user_id, tier, target) SELECT id, 'Growth', 0.35 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO tier_targets (user_id, tier, target) SELECT id, 'High Risk', 0.15 FROM users WHERE email = 'demo@money-plan.local';

-- Budget lines for 'main' scenario
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Income', 'Salary', 'เงินเดือน', 60000, NULL, NULL, 1 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Income', 'Others', 'รายได้เสริม', 5000, NULL, NULL, 2 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Saving', 'Saving', 'เงินสำรองฉุกเฉิน', 5000, NULL, 'KBank/ออมทรัพย์', 3 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Saving', 'Saving', 'เงินออม', 3000, NULL, 'KBank/ออมทรัพย์', 4 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Saving', 'Investment', 'PVD', 4000, NULL, NULL, 5 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Saving', 'Investment', 'RMF', 3000, NULL, 'SCB/กองทุน', 6 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Saving', 'Investment', 'กองทุนหุ้น', 3000, NULL, 'SCB/กองทุน', 7 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Expense', 'Mortgage', 'ผ่อนคอนโด', 18000, NULL, 'SCB/ผ่อนบ้าน', 8 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Expense', 'Daily Living', 'อาหาร', 9000, NULL, 'KBank', 9 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Expense', 'Daily Living', 'เดินทาง', 3000, NULL, 'KBank', 10 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Expense', 'Bills & Utilities', 'ค่าน้ำไฟ / โทรศัพท์', 3000, NULL, 'KBank', 11 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Expense', 'Insurance', 'ประกัน', 2500, NULL, 'KBank', 12 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'main', 'Expense', 'Travel', 'ท่องเที่ยว', 5500, NULL, 'KBank', 13 FROM users WHERE email = 'demo@money-plan.local';

-- Budget lines for 'em' scenario
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'em', 'Expense', 'Mortgage', 'ผ่อนคอนโด', 18000, NULL, NULL, 1 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'em', 'Expense', 'Daily Living', 'อาหาร', 8000, NULL, NULL, 2 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'em', 'Expense', 'Bills & Utilities', 'ค่าน้ำไฟ / โทรศัพท์', 3000, NULL, NULL, 3 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT id, 'em', 'Expense', 'Insurance', 'ประกัน', 2500, NULL, NULL, 4 FROM users WHERE email = 'demo@money-plan.local';

-- Balance items
INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort)
SELECT id, 'asset', 'Cash', 'บัญชีออมทรัพย์ KBank', NULL, NULL, NULL, 1, 1 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort)
SELECT id, 'asset', 'Emergency Funds', 'บัญชีดอกเบี้ยสูง', NULL, NULL, NULL, 1, 2 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort)
SELECT id, 'asset', 'PVD', 'PVD', 'Foundation', 'Bonds', 'Thailand', 1, 3 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort)
SELECT id, 'asset', 'Insurance & Social Security', 'ประกันสังคม', NULL, NULL, NULL, 1, 4 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort)
SELECT id, 'asset', 'Equity', 'กองทุนหุ้นโลก', 'Core', 'Equity', 'Global', 1, 5 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort)
SELECT id, 'asset', 'Real Estate', 'คอนโด', NULL, NULL, NULL, 1, 6 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort)
SELECT id, 'liability', 'Mortgage', 'สินเชื่อคอนโด', NULL, NULL, NULL, 1, 7 FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort)
SELECT id, 'liability', 'Credit Card', 'บัตรเครดิต', NULL, NULL, NULL, 1, 8 FROM users WHERE email = 'demo@money-plan.local';

-- Balance months
INSERT INTO balance_months (user_id, month, status, updated_at, closed_at)
SELECT id, '2026-04', 'closed', '2026-04-28T12:00:00.000Z', '2026-04-28T12:00:00.000Z' FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_months (user_id, month, status, updated_at, closed_at)
SELECT id, '2026-05', 'closed', '2026-05-28T12:00:00.000Z', '2026-05-28T12:00:00.000Z' FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_months (user_id, month, status, updated_at, closed_at)
SELECT id, '2026-06', 'closed', '2026-06-28T12:00:00.000Z', '2026-06-28T12:00:00.000Z' FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_months (user_id, month, status, updated_at, closed_at)
SELECT id, '2026-07', 'closed', '2026-07-28T12:00:00.000Z', '2026-07-28T12:00:00.000Z' FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_months (user_id, month, status, updated_at, closed_at)
SELECT id, '2026-08', 'closed', '2026-08-28T12:00:00.000Z', '2026-08-28T12:00:00.000Z' FROM users WHERE email = 'demo@money-plan.local';
INSERT INTO balance_months (user_id, month, status, updated_at, closed_at)
SELECT id, '2026-09', 'closed', '2026-09-28T12:00:00.000Z', '2026-09-28T12:00:00.000Z' FROM users WHERE email = 'demo@money-plan.local';

-- Balance entries: KBank savings
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-04', i.id, 110000, NULL, '2026-04-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีออมทรัพย์ KBank';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-05', i.id, 112000, NULL, '2026-05-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีออมทรัพย์ KBank';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-06', i.id, 114000, NULL, '2026-06-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีออมทรัพย์ KBank';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-07', i.id, 116000, NULL, '2026-07-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีออมทรัพย์ KBank';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-08', i.id, 118000, NULL, '2026-08-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีออมทรัพย์ KBank';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-09', i.id, 120000, NULL, '2026-09-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีออมทรัพย์ KBank';

-- Balance entries: High interest savings
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-04', i.id, 155000, NULL, '2026-04-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีดอกเบี้ยสูง';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-05', i.id, 160000, NULL, '2026-05-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีดอกเบี้ยสูง';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-06', i.id, 165000, NULL, '2026-06-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีดอกเบี้ยสูง';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-07', i.id, 170000, NULL, '2026-07-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีดอกเบี้ยสูง';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-08', i.id, 175000, NULL, '2026-08-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีดอกเบี้ยสูง';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-09', i.id, 180000, NULL, '2026-09-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัญชีดอกเบี้ยสูง';

-- Balance entries: PVD
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-04', i.id, 274000, NULL, '2026-04-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'PVD';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-05', i.id, 281200, NULL, '2026-05-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'PVD';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-06', i.id, 288400, NULL, '2026-06-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'PVD';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-07', i.id, 295600, NULL, '2026-07-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'PVD';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-08', i.id, 302800, NULL, '2026-08-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'PVD';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-09', i.id, 310000, NULL, '2026-09-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'PVD';

-- Balance entries: Social security
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-04', i.id, 58000, NULL, '2026-04-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'ประกันสังคม';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-05', i.id, 58400, NULL, '2026-05-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'ประกันสังคม';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-06', i.id, 58800, NULL, '2026-06-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'ประกันสังคม';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-07', i.id, 59200, NULL, '2026-07-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'ประกันสังคม';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-08', i.id, 59600, NULL, '2026-08-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'ประกันสังคม';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-09', i.id, 60000, NULL, '2026-09-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'ประกันสังคม';

-- Balance entries: Global equity fund
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-04', i.id, 218000, NULL, '2026-04-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'กองทุนหุ้นโลก';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-05', i.id, 222500, NULL, '2026-05-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'กองทุนหุ้นโลก';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-06', i.id, 227000, NULL, '2026-06-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'กองทุนหุ้นโลก';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-07', i.id, 231500, NULL, '2026-07-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'กองทุนหุ้นโลก';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-08', i.id, 236000, NULL, '2026-08-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'กองทุนหุ้นโลก';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-09', i.id, 240500, NULL, '2026-09-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'กองทุนหุ้นโลก';

-- Balance entries: Condo (real estate)
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-04', i.id, 2100000, NULL, '2026-04-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'คอนโด';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-05', i.id, 2100000, NULL, '2026-05-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'คอนโด';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-06', i.id, 2100000, NULL, '2026-06-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'คอนโด';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-07', i.id, 2100000, NULL, '2026-07-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'คอนโด';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-08', i.id, 2100000, NULL, '2026-08-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'คอนโด';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-09', i.id, 2100000, NULL, '2026-09-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'คอนโด';

-- Balance entries: Mortgage
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-04', i.id, 1677000, NULL, '2026-04-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'สินเชื่อคอนโด';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-05', i.id, 1671600, NULL, '2026-05-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'สินเชื่อคอนโด';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-06', i.id, 1666200, NULL, '2026-06-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'สินเชื่อคอนโด';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-07', i.id, 1660800, NULL, '2026-07-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'สินเชื่อคอนโด';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-08', i.id, 1655400, NULL, '2026-08-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'สินเชื่อคอนโด';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-09', i.id, 1650000, NULL, '2026-09-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'สินเชื่อคอนโด';

-- Balance entries: Credit card (constant)
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-04', i.id, 12000, NULL, '2026-04-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัตรเครดิต';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-05', i.id, 12000, NULL, '2026-05-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัตรเครดิต';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-06', i.id, 12000, NULL, '2026-06-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัตรเครดิต';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-07', i.id, 12000, NULL, '2026-07-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัตรเครดิต';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-08', i.id, 12000, NULL, '2026-08-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัตรเครดิต';
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT u.id, '2026-09', i.id, 12000, NULL, '2026-09-28T12:00:00.000Z'
FROM users u, balance_items i WHERE u.email = 'demo@money-plan.local' AND u.id = i.user_id AND i.item = 'บัตรเครดิต';
