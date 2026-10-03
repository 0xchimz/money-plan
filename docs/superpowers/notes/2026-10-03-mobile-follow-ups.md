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

## Small issues fixed 3 Oct (were left on purpose at first)

- [x] Crossing 1024px keeps the page and its data (one app frame; `<main>` keeps its place) — no remount, refetch or race
- [x] The last checked row's sheet slides away before the close panel opens (no two sheets at once)
- [x] The add sheet slides out showing what was added
- [x] Chart legend "Show all" is 44px on phones
- [x] "ยอดไม่เปลี่ยน" is disabled while the typed amount can't be read
- [x] The close panel ticks the USD rate only when it was confirmed

Still in the code, not user-visible: `AmountField`'s unused `autoFocus` prop, the ฿/$ toggle markup written twice in `balance-mobile.tsx`, three form-reset patterns across the sheets.

## Testing note

Puppeteer's `fullPage` screenshot shrinks the viewport to 1×1 for a moment, which flips the app's `< 1024px` media query and remounts the page (it then shows "กำลังโหลด…"). For screenshots, set the viewport height to `document.documentElement.scrollHeight` at the same width and take a normal screenshot instead.
