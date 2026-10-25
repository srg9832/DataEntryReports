# CAP Data Entry Reports

A compact, login-protected worksheet for CAP staff transferring feedback, drill-test, and uniform-inspection results into eServices.

**Production source:** Shared CAP Applications Supabase project (vosvdkkuiijywwmqzdiu). This new application is standalone and does **not** modify tables or records belonging to Leadership Feedback, Drill Test Manager, or Cadet Inspections.

## Deployment

1. This is a static GitHub Pages site: index.html, styles.css, app.js.
2. In **GitHub repository → Settings → Pages → Build and deployment**, choose **Deploy from a branch** as the source, branch **main**, and folder **/ (root)**. Save.
3. GitHub Pages automatically publishes changes committed to main. No custom Actions workflow is needed. The expected site URL once Pages finishes publishing is https://srg9832.github.io/DataEntryReports/.
4. Sign in with your **existing CAP Applications Supabase Auth email and password**. There is no public registration.
5. Existing users with profiles.is_app_admin = true are reporting administrators. A reporting administrator can use **Manage Access** to assign staff to units, with either **View only** or **View & mark** permissions.

**Important:** Publishing the website makes the *code* public, not the member data. Source data is returned only through server-side, per-unit authorization checks in Supabase. The JavaScript contains only a publishable Supabase key, never a secret or service-role key.

## Reporting rules

- **Roster:** active members associated with the selected unit, plus members with qualifying records in the reporting month. Names are grouped by **CAPID**.
- **Feedback:** finalized Leadership Feedback records using the discussion date (fallback review-end date) and recorded promotion decision. **Approved** is shown only when the source decision.promotion is approved; don't confuse that with merely creating feedback.
- **Drill:** only **submitted** drill records with test name/code, raw/max score, date, and pass/fail. Multiple tests per person remain separate.
- **Uniform:** inspection date, score out of 10, pass/fail, and rating. The selected month is actionable; the **previous two calendar months** are read-only history.
- **eServices status:** records start as **Needs entry**. Authorized users click **Mark entered**, or undo a mistaken mark. This is tracking **only**; nothing is sent automatically to eServices.
- **CSV / Print:** printable compact grid and one-row-per-member CSV. Export includes the selected month and previous two months' uniform history.

## Database additions

Migration data_entry_reports_initial_additive creates only:
- public.data_entry_access — unit-scoped reporting permissions
- public.data_entry_postings — eServices entry confirmations
- public.data_entry_get_units() — authorized unit listing
- public.data_entry_get_report(uuid,date) — authorized monthly report
- public.data_entry_set_posted(uuid,text,text,boolean) — permission-checked entry confirmation

All new tables enable RLS; source application schema is unchanged. The new server functions check auth.uid() and unit authorization before reading source records. Entry-confirmation RPC also verifies the referenced record belongs to the selected unit.

## Testing and operations

- Tested database reporting against the existing roster and all three production source types.
- Checked an unassigned signed-in user cannot read a unit report.
- Checked app.js parses as JavaScript.
- A real-user/browser acceptance test for login, marking/unmarking, CSV, and printing is still needed.
- For member privacy, avoid distributing exported CSV files or printouts outside authorized CAP staff.
- Never expose a service-role secret in GitHub or disable RLS to fix permissions. Create staff accounts using the existing shared authentication workflow and assign their unit under **Manage Access**.
