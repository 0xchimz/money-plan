# money-plan on mobile — follow-ups (3 Oct 2026)

Shipped to prod 3 Oct 2026 (`main` 6840027). Spec: `../specs/2026-10-03-mobile-design.md` · plan: `../plans/2026-10-03-mobile.md`.

## Checked on a real iPhone (Chin, 3 Oct — "ผ่านหมด")

- [x] Sheet buttons (บันทึก · ถัดไป, ยอดไม่เปลี่ยน, เพิ่ม, บันทึก) stay above the keyboard while typing — uses Base UI's `--drawer-keyboard-inset` on the Drawer Viewport
- [x] + − × ÷ buttons keep the keyboard open; `54791.65+5000` saves as 59,791.65 with the formula kept
- [x] After "บันทึก · ถัดไป" the next row's amount is selected, so typing replaces it
- [x] Notch and home bar never cover the header, tabs or a sheet's buttons
- [x] Full month close: start month → step through rows → add an item with a chip → tick transfers → close
- [x] Add to Home Screen + Google popup login in the home-screen app (Chin, 3 Oct) — redirect login (plan Task 7) not needed

## Added after feedback (3 Oct)

- [x] Header fixed + no iOS rubber-band on phones (`overscroll-behavior-y: none`)
- [x] Pull to refresh: pages register a reload (`usePageRefresh`) that runs in place — no flash to กำลังโหลด…

## Known, left on purpose (fix on the next touch of these files)

- Crossing 1024px (iPad rotation, resizing a desktop window) remounts the page and refetches; an open sheet and typed text are dropped, and a write still in flight can race the refetch so old numbers show until the next action.
- When the last unchecked row hands over to the close panel, two sheets overlap for ~400ms.
- The add sheet slides out showing an empty form after a successful add.
- ToggleLegend's "แสดงทั้งหมด" text button is still under 44px on phones.
- "ยอดไม่เปลี่ยน" stays enabled while the typed text can't be read (tapping it drops that text; nothing wrong is saved).
- The close panel's rate line says "ยืนยันแล้ว" when the rate is not stale but was never confirmed (no USD rows).
- `AmountField`'s `autoFocus` prop has no caller; the ฿/$ toggle markup is written twice in `balance-mobile.tsx`; the three sheets reset their forms three different ways.

## Testing note

Puppeteer's `fullPage` screenshot shrinks the viewport to 1×1 for a moment, which flips the app's `< 1024px` media query and remounts the page (it then shows "กำลังโหลด…"). For screenshots, set the viewport height to `document.documentElement.scrollHeight` at the same width and take a normal screenshot instead.
