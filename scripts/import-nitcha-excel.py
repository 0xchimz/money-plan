# WARNING: this script's SQL deletes rows from budget_lines. Since migration 0003 that cascades to the tax_lines
# rows linked to them and drops the tax tags (tax_kind) of the plan lines. Do not run it against a database where
# the user has typed tax amounts or tagged plan lines (the Tax page) unless losing them is intended.
"""Nitcha's Excel ("Nitcha's Personal Finance - 2026.xlsx") → SQL that fills her money-plan data.

    uv run --no-project --with openpyxl python scripts/import-nitcha-excel.py "<xlsx>" out.sql [--main 102026] [--em unemployed]
    pnpm exec wrangler d1 execute money-plan --remote --yes --file out.sql     # --local to try it first

What it writes (and replaces on a re-run):
- Planning ปัจจุบัน ← the monthly sheet (--main): Saving + Expense lines. Her Income lines typed in the app are kept.
- Planning ตกงาน ← --em: Expense lines only (the sheet's leftover salary is not income when jobless).
- Balance ← '🏡 Balance Sheet': every item, one closed month per dated column. It replaces all of her balance data, so the
  file starts with a guard: if the app already has a month the sheet doesn't (one she started or closed in the app), or the
  user doesn't exist, the first statement fails with "NOT NULL constraint failed: balance_months.user_id" and nothing runs.
Rows are matched by their label; a non-zero row this script doesn't know stops it (add it to MAIN / EM / ITEMS).
Zero lines and cells are skipped. Formulas are kept as expr, with the THB/USD rate cell replaced by its number.
"""
import argparse
import datetime as dt
import re
import warnings
from decimal import ROUND_HALF_UP, Decimal

import openpyxl
from openpyxl.utils import get_column_letter

warnings.filterwarnings("ignore")  # the workbook has pivot tables and sparklines openpyxl can't read
EMAIL = "nitchawee.sw@gmail.com"
BALANCE_SHEET = "🏡 Balance Sheet"

# Planning: Excel label (column A) → (type, category, item). The account comes from column B.
MAIN = {
    "Backup Cash (120,000 THB)": ("Saving", "Saving", "Backup Cash (120,000 THB)"),
    "Insurance FWD": ("Saving", "Saving", "Insurance FWD"),
    "STOCK&ETF": ("Saving", "Investment", "STOCK&ETF"),
    "FUND": ("Saving", "Investment", "FUND"),
    "CRYPTO": ("Saving", "Investment", "CRYPTO"),
    "Currency": ("Saving", "Investment", "Currency"),
    "Marriage Budge": ("Saving", "Saving", "Marriage Budget"),
    "Withholding Tax": ("Expense", "Tax", "Withholding Tax"),
    "Transportation": ("Expense", "Daily Living", "Transportation"),
    "Phone": ("Expense", "Bills & Utilities", "Phone"),
    "FOOD & DRINK": ("Expense", "Daily Living", "FOOD & DRINK"),
    "Shopping": ("Expense", "Daily Living", "Shopping"),
    "Insurance KT-AXA": ("Expense", "Insurance", "Insurance KT-AXA"),
    "MOM&DAD": ("Expense", "Family", "MOM&DAD"),
    "THE LINE WONGSAWANG": ("Expense", "Debt", "THE LINE WONGSAWANG"),
    "THE LINE VIBE": ("Expense", "Debt", "THE LINE VIBE"),
    "กยศ หัก บ.": ("Expense", "Debt", "กยศ หัก บ."),
    "ค่ารองเท้า": ("Expense", "Debt", "ค่ารองเท้า"),
    "ค่าโต๊ะ": ("Expense", "Debt", "ค่าโต๊ะ"),
    "Botox": ("Expense", "Debt", "Botox"),
    "ค่า Apple Watch": ("Expense", "Debt", "ค่า Apple Watch"),
    "Macbook Air": ("Expense", "Debt", "Macbook Air"),
    "Donation": ("Expense", "Donation", "Donation"),
    "Trip Budget": ("Expense", "Travel", "Trip Budget"),
    "Anything I want": ("Expense", "Activity", "Anything I want"),
}
# ตกงาน counts expenses only, so anything still paid when jobless is an Expense (Insurance FWD is a premium still due)
EM = {
    "Withholding Tax": ("Expense", "Tax", "Withholding Tax"),
    "Transportation": ("Expense", "Daily Living", "Transportation"),
    "Phone": ("Expense", "Bills & Utilities", "Phone"),
    "FOOD & DRINK": ("Expense", "Daily Living", "FOOD & DRINK"),
    "Shopping": ("Expense", "Daily Living", "Shopping"),
    "Insurance KT-AXA": ("Expense", "Insurance", "Insurance KT-AXA"),
    "Insurance FWD": ("Expense", "Insurance", "Insurance FWD"),
    "MOM&DAD": ("Expense", "Family", "MOM&DAD"),
    "THE LINE WONGSAWANG": ("Expense", "Debt", "THE LINE WONGSAWANG"),
    "THE LINE VIBE": ("Expense", "Debt", "THE LINE VIBE"),
    "กยศ หัก บ.": ("Expense", "Debt", "กยศ หัก บ."),
    "ค่ารองเท้า": ("Expense", "Debt", "ค่ารองเท้า"),
    "ค่าโต๊ะ": ("Expense", "Debt", "ค่าโต๊ะ"),
    "Botox": ("Expense", "Debt", "Botox"),
    "ค่า Apple Watch": ("Expense", "Debt", "ค่า Apple Watch"),
    "Macbook Air": ("Expense", "Debt", "Macbook Air"),
    "Donation": ("Expense", "Donation", "Donation"),
    "Trip Budget": ("Expense", "Travel", "Trip Budget"),
    "Anything I want": ("Expense", "Activity", "Anything I want"),
}

# Balance: Excel label (column B) → (side, category, item, tier, type, country); list order = row order in the app.
# Portfolio (tier) = her sheet's "Total Investments" (Crypto + Fund + Equity); tiers follow ChinOS investment-framework.md.
ITEMS = [
    ("Emergency Fund (Save me+DIME+KKP+MoneyPlus+Kept)", "asset", "Emergency Funds", "Emergency Fund (Save me+DIME+KKP+MoneyPlus+Kept)", None, None, None),
    ("Cash(MoneyPlus+MAKE+SCB)", "asset", "Cash", "Cash (MoneyPlus+MAKE+SCB)", None, None, None),
    ("DIME FCD", "asset", "Cash", "DIME FCD", None, None, None),
    ("DIME USD", "asset", "Cash", "DIME USD", None, None, None),
    ("InnovestX Cash Balance", "asset", "Cash", "InnovestX Cash Balance", None, None, None),
    ("Steaming Cash Balance", "asset", "Cash", "Streaming Cash Balance", None, None, None),
    ("Retirement Fund", "asset", "Insurance & Social Security", "Social Security (Retirement Fund)", None, None, None),
    ("Family Care 25/15", "asset", "Insurance & Social Security", "Family Care 25/15", None, None, None),
    ("SCBFST", "asset", "Bond", "SCBFST", "Foundation", "Bonds", "Thailand"),
    ("K-FIXEDPLUS-A", "asset", "Bond", "K-FIXEDPLUS-A", "Foundation", "Bonds", "Thailand"),
    ("E1VFVN3001", "asset", "Equity", "E1VFVN3001", "Growth", "ETF", "Vietnam"),
    ("CQQQ", "asset", "Equity", "CQQQ", "Growth", "ETF", "China"),
    ("JEPQ", "asset", "Equity", "JEPQ", "Core", "ETF", "United States"),
    ("SCHD", "asset", "Equity", "SCHD", "Core", "ETF", "United States"),
    ("URTH", "asset", "Equity", "URTH", "Core", "ETF", "Global"),
    ("MA", "asset", "Equity", "MA", "Core", "Equity", "United States"),
    ("O", "asset", "Equity", "O", "Core", "Equity", "United States"),
    ("GOOGL", "asset", "Equity", "GOOGL", "Growth", "Equity", "United States"),
    ("AMZN", "asset", "Equity", "AMZN", "Growth", "Equity", "United States"),
    ("ASML", "asset", "Equity", "ASML", "Growth", "Equity", "Netherlands"),
    ("NFLX", "asset", "Equity", "NFLX", "Growth", "Equity", "United States"),
    ("AMD", "asset", "Equity", "AMD", "Growth", "Equity", "United States"),
    ("TSM", "asset", "Equity", "TSM", "Growth", "Equity", "United States"),
    ("PLTR", "asset", "Equity", "PLTR", "Growth", "Equity", "United States"),
    ("UBER", "asset", "Equity", "UBER", "High Risk", "Equity", "United States"),
    ("TOST", "asset", "Equity", "TOST", "High Risk", "Equity", "United States"),
    ("USDT (Binance+BinanceTH)", "asset", "Crypto", "USDT (Binance+BinanceTH)", "Foundation", "Cash", "Crypto"),
    ("BTC", "asset", "Crypto", "BTC", "Growth", "Crypto", "Crypto"),
    ("ETH", "asset", "Crypto", "ETH", "Growth", "Crypto", "Crypto"),
    ("SOL", "asset", "Crypto", "SOL", "High Risk", "Crypto", "Crypto"),
    ("ZRO", "asset", "Crypto", "ZRO", "High Risk", "Crypto", "Crypto"),
    ("Student Loan", "liability", "Other Debts", "Student Loan (กยศ)", None, None, None),
]


def r2(v):
    return float(Decimal(repr(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def arith(s):
    if not re.fullmatch(r"[\d.+\-*/() ]+", s):
        raise SystemExit(f"not plain arithmetic: {s}")
    return eval(s)  # digits and operators only, checked above


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else 0


def account(v):
    """Column B as the app's "bank/sub-account"; the sheet sometimes writes the pocket first (Marriage/MAKE)"""
    if not isinstance(v, str) or not v.strip():
        return None
    parts = [p.strip() for p in v.split("/")]
    if len(parts) == 2 and parts[1].upper() == "MAKE":
        parts = ["MAKE", parts[0]]
    return "/".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("out")
    ap.add_argument("--main", default="102026", help="monthly plan sheet → ปัจจุบัน")
    ap.add_argument("--em", default="unemployed", help="jobless plan sheet → ตกงาน")
    a = ap.parse_args()

    wbv = openpyxl.load_workbook(a.xlsx, data_only=True)
    wbf = openpyxl.load_workbook(a.xlsx, data_only=False)
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    uid = f"(SELECT id FROM users WHERE email = {q(EMAIL)})"

    def expr_of(sheet, coord, rate_row=None):
        """Formula body usable as the app's expr, or None (plain number, or it points at cells other than the rate row)"""
        f = wbf[sheet][coord].value
        if not (isinstance(f, str) and f.startswith("=")):
            return None
        body = f[1:].replace(" ", "")
        ref = r"\$?([A-Z]+)\$?(\d+)"
        if any(rate_row is None or int(row) != rate_row for _, row in re.findall(ref, body)):
            return None
        body = re.sub(ref, lambda m: repr(wbv[sheet][f"{m[1]}{m[2]}"].value), body)
        return body if re.search(r"\d[)]*[+\-*/][(\d.]", body) else None

    # ---------------- Balance: months first, the guard needs them ----------------
    ws = wbv[BALANCE_SHEET]
    cols = [(get_column_letter(c), ws.cell(1, c).value.strftime("%Y-%m")) for c in range(1, ws.max_column + 1) if isinstance(ws.cell(1, c).value, dt.datetime)]
    months = sorted(m for _, m in cols)
    if len(set(months)) != len(months):
        raise SystemExit(f"a month appears twice in row 1: {months}")
    latest = max(cols, key=lambda x: x[1])[0]

    out = [f"-- Nitcha's Excel → money-plan ({now}), from scripts/import-nitcha-excel.py; re-running replaces what it wrote."]
    out.append("-- Guard: stop if she doesn't exist yet, or the app has a month this sheet doesn't (it would be wiped below).")
    out.append(
        "INSERT INTO balance_months (user_id, month, status, updated_at) SELECT NULL, 'import-guard', 'draft', 'x' "
        f"WHERE {uid} IS NULL OR EXISTS (SELECT 1 FROM balance_months WHERE user_id = {uid} AND month NOT IN ({', '.join(map(q, months))}));"
    )
    out.append(f"DELETE FROM budget_lines WHERE user_id = {uid} AND ((scenario = 'main' AND type IN ('Saving', 'Expense')) OR scenario = 'em');")
    out.append(f"DELETE FROM balance_months WHERE user_id = {uid};")  # entries + transfers cascade
    out.append(f"DELETE FROM balance_items WHERE user_id = {uid};")

    # ---------------- Planning ----------------
    def plan(sheet, scenario, mapping):
        ws = wbv[sheet]
        rows = {}
        for r in range(1, ws.max_row + 1):
            label, v = ws[f"A{r}"].value, ws[f"G{r}"].value
            if isinstance(label, str) and num(v):
                if label.strip() not in mapping:
                    raise SystemExit(f"{sheet} row {r}: '{label}' = {v} has no mapping — add it to {'MAIN' if scenario == 'main' else 'EM'}")
                rows[label.strip()] = r
        tot = {"Saving": 0.0, "Expense": 0.0}
        for sort, (label, (typ, cat, item)) in enumerate(mapping.items(), 1):
            if label not in rows:
                continue
            r = rows[label]
            thb = r2(ws[f"G{r}"].value)
            tot[typ] += thb
            out.append(
                "INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort) VALUES "
                f"({uid}, {q(scenario)}, {q(typ)}, {q(cat)}, {q(item)}, {q(thb)}, {q(expr_of(sheet, f'G{r}'))}, {q(account(ws[f'B{r}'].value))}, {sort});"
            )
        print(f"{scenario} ← {sheet}: saving {tot['Saving']:,.2f}  expense {tot['Expense']:,.2f}")

    plan(a.main, "main", MAIN)
    plan(a.em, "em", EM)

    # ---------------- Balance ----------------
    wf = wbf[BALANCE_SHEET]
    rows, labels_a = {}, {}
    for r in range(1, ws.max_row + 1):
        b, lab = ws[f"B{r}"].value, ws[f"A{r}"].value
        if isinstance(lab, str):
            labels_a[lab.strip()] = r
        if isinstance(b, str) and b.strip():
            rows[b.strip()] = r
        if lab == "Total Liabilities":
            break
    known = {x[0] for x in ITEMS}
    for label, r in rows.items():
        if label not in known and any(num(ws[f"{c}{r}"].value) for c, _ in cols):
            raise SystemExit(f"balance row {r}: '{label}' has values but no mapping — add it to ITEMS")
    sections = [labels_a[s] for s in ("Cryptocurrency", "Tax-Advantaged Accounts", "Social Security", "Fund", "Equity", "Cash")]
    total_a, total_l = labels_a["Total Assets"], labels_a["Total Liabilities"]

    for sort, (label, side, cat, item, tier, typ, country) in enumerate(ITEMS, 1):
        active = 1 if label in rows and num(ws[f"{latest}{rows[label]}"].value) else 0
        out.append(
            "INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort) VALUES "
            f"({uid}, {q(side)}, {q(cat)}, {q(item)}, {q(tier)}, {q(typ)}, {q(country)}, {active}, {sort});"
        )

    for col, month in sorted(cols, key=lambda x: x[1]):
        out.append(f"INSERT INTO balance_months (user_id, month, status, updated_at, closed_at) VALUES ({uid}, {q(month)}, 'closed', {q(now)}, {q(now)});")
        assets = liabilities = 0.0
        for label, side, cat, item, *_ in ITEMS:
            v = num(ws[f"{col}{rows[label]}"].value) if label in rows else 0
            if not v:
                continue
            thb = r2(v)
            e = expr_of(BALANCE_SHEET, f"{col}{rows[label]}", rate_row=2)
            if e is not None and abs(arith(e) - v) > 0.005:
                raise SystemExit(f"{col}{rows[label]}: expr {e} = {arith(e)} but the cell is {v}")
            if side == "asset":
                assets += thb
            else:
                liabilities += thb
            out.append(
                "INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at) SELECT "
                f"{uid}, {q(month)}, id, {q(thb)}, {q(e)}, {q(now)} FROM balance_items WHERE user_id = {uid} "
                f"AND side = {q(side)} AND category = {q(cat)} AND item = {q(item)};"
            )
        # every section of the sheet must be covered; her own Total Assets may leave a section out (2025-07..09: Social Security)
        want_a = sum(num(ws[f"{col}{r}"].value) for r in sections)
        want_l = num(ws[f"{col}{total_l}"].value)
        if abs(assets - want_a) > 0.1 or abs(liabilities - want_l) > 0.1:
            raise SystemExit(f"{month}: assets {assets:,.2f} vs sections {want_a:,.2f}, liabilities {liabilities:,.2f} vs {want_l:,.2f}")
        note = ""
        if abs(want_a - num(ws[f"{col}{total_a}"].value)) > 0.1:
            note = f"  (sheet's Total Assets {num(ws[f'{col}{total_a}'].value):,.2f} leaves out a section: {wf[f'{col}{total_a}'].value})"
        print(f"{month}: assets {assets:,.2f}  liabilities {liabilities:,.2f}  net {assets - liabilities:,.2f}{note}")

    with open(a.out, "w") as fh:
        fh.write("\n".join(out) + "\n")
    print(f"{len(out)} lines → {a.out}")


if __name__ == "__main__":
    main()
