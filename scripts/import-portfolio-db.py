"""Chin's apps/portfolio database → SQL that fills his money-plan data (c.soonue@gmail.com).

    uv run --no-project python scripts/import-portfolio-db.py ../portfolio/data/portfolio.db out.sql
    pnpm exec wrangler d1 execute money-plan --remote --yes --file out.sql     # --local to try it first

What it writes (and replaces on a re-run — portfolio.db is the source, edits made in money-plan are overwritten):
- Planning: every budget line of ปัจจุบัน / Projection / ตกงาน as it is (zero lines too); money-plan's scenario names stay.
- Tier targets.
- Balance: balance_items (tier / type / country / active / sort) and every closed month of balance_monthly as a closed month.
  A month still open in the portfolio Balance page (balance_months) is not copied. Zero cells are skipped.
  The file starts with a guard: if the app already has a month portfolio.db doesn't, or the user doesn't exist, the first
  statement fails with "NOT NULL constraint failed: balance_months.user_id" and nothing runs.
Amounts are rounded to 2 decimals, as the app does for anything typed in.
Tiers are per item here (money-plan has no per-month tier), so a month's port = its entries whose item has a tier.
"""
import argparse
import datetime as dt
import sqlite3
from decimal import ROUND_HALF_UP, Decimal

EMAIL = "c.soonue@gmail.com"


def r2(v):
    return float(Decimal(repr(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("db", help="apps/portfolio/data/portfolio.db")
    ap.add_argument("out")
    a = ap.parse_args()

    src = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    src.row_factory = sqlite3.Row
    rows = lambda sql: src.execute(sql).fetchall()
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    uid = f"(SELECT id FROM users WHERE email = {q(EMAIL)})"

    open_months = {r["month"] for r in rows("SELECT month FROM balance_months WHERE status <> 'closed'")}
    months = [r["month"] for r in rows("SELECT DISTINCT month FROM balance_monthly ORDER BY month") if r["month"] not in open_months]
    if not months:
        raise SystemExit("no closed months in balance_monthly")

    out = [f"-- Chin's portfolio.db → money-plan ({now}), from scripts/import-portfolio-db.py; re-running replaces what it wrote."]
    out.append("-- Guard: stop if he doesn't exist yet, or the app has a month portfolio.db doesn't (it would be wiped below).")
    out.append(
        "INSERT INTO balance_months (user_id, month, status, updated_at) SELECT NULL, 'import-guard', 'draft', 'x' "
        f"WHERE {uid} IS NULL OR EXISTS (SELECT 1 FROM balance_months WHERE user_id = {uid} AND month NOT IN ({', '.join(map(q, months))}));"
    )
    out.append(f"DELETE FROM budget_lines WHERE user_id = {uid};")
    out.append(f"DELETE FROM balance_months WHERE user_id = {uid};")  # entries + transfers cascade
    out.append(f"DELETE FROM balance_items WHERE user_id = {uid};")

    # ---------------- Planning + tier targets ----------------
    tot = {}
    for r in rows("SELECT scenario, type, category, item, thb, expr, account, sort FROM budget_lines ORDER BY scenario, sort, id"):
        if r["scenario"] not in ("main", "proj", "em") or r["type"] not in ("Income", "Saving", "Expense") or r["thb"] < 0:
            raise SystemExit(f"budget line the app can't hold: {dict(r)}")
        thb = r2(r["thb"])
        tot[(r["scenario"], r["type"])] = tot.get((r["scenario"], r["type"]), 0) + thb
        out.append(
            "INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort) VALUES "
            f"({uid}, {q(r['scenario'])}, {q(r['type'])}, {q(r['category'])}, {q(r['item'])}, {q(thb)}, {q(r['expr'])}, {q(r['account'])}, {r['sort']});"
        )
    for (s, t), v in sorted(tot.items()):
        print(f"plan {s:4} {t:7} {v:14,.2f}")
    targets = rows("SELECT tier, target FROM tier_targets")
    if abs(sum(t["target"] for t in targets) - 1) > 0.001:
        raise SystemExit("tier targets don't add up to 1")
    for t in targets:
        out.append(
            "INSERT INTO tier_targets (user_id, tier, target) VALUES "
            f"({uid}, {q(t['tier'])}, {q(t['target'])}) ON CONFLICT (user_id, tier) DO UPDATE SET target = excluded.target;"
        )

    # ---------------- Balance ----------------
    orphans = rows("""SELECT DISTINCT m.side, m.category, m.item FROM balance_monthly m
        LEFT JOIN balance_items i ON i.side = m.side AND i.category = m.category AND i.item = m.item WHERE i.id IS NULL""")
    if orphans:
        raise SystemExit(f"balance_monthly rows without a balance_item: {[tuple(o) for o in orphans]}")
    for i in rows("SELECT side, category, item, tier, type, country, active, sort FROM balance_items ORDER BY sort, id"):
        tier = i["tier"] if i["side"] == "asset" else None
        out.append(
            "INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort) VALUES "
            f"({uid}, {q(i['side'])}, {q(i['category'])}, {q(i['item'])}, {q(tier)}, {q(i['type'] if tier else None)}, "
            f"{q(i['country'] if tier else None)}, {i['active']}, {i['sort']});"
        )
    for month in months:
        out.append(f"INSERT INTO balance_months (user_id, month, status, updated_at, closed_at) VALUES ({uid}, {q(month)}, 'closed', {q(now)}, {q(now)});")
        s = {"asset": 0.0, "liability": 0.0, "port": 0.0}
        cells = rows(f"""SELECT m.side, m.category, m.item, m.thb, m.expr, i.tier FROM balance_monthly m
            JOIN balance_items i ON i.side = m.side AND i.category = m.category AND i.item = m.item
            WHERE m.month = {q(month)} AND m.thb <> 0 ORDER BY i.sort, i.id""")
        for c in cells:
            thb = r2(c["thb"])
            s[c["side"]] += thb
            if c["tier"] and c["side"] == "asset":
                s["port"] += thb
            out.append(
                "INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at) SELECT "
                f"{uid}, {q(month)}, id, {q(thb)}, {q(c['expr'])}, {q(now)} FROM balance_items WHERE user_id = {uid} "
                f"AND side = {q(c['side'])} AND category = {q(c['category'])} AND item = {q(c['item'])};"
            )
        print(f"{month}: {len(cells):3} rows  net {s['asset'] - s['liability']:15,.2f}  port {s['port']:15,.2f}")
    if open_months:
        print(f"not copied (still open in portfolio): {sorted(open_months)}")

    with open(a.out, "w") as fh:
        fh.write("\n".join(out) + "\n")
    print(f"{len(out)} lines → {a.out}")


if __name__ == "__main__":
    main()
