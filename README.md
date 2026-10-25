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

- **Rows:** by default only members with pending eServices entries appear, grouped by **CAPID**. Turning off **Pending only** shows members with any reportable entry in that month, including entered records. Members with no reportable entries are always omitted.
- **Feedback:** finalized Leadership Feedback records using the discussion date (fallback review-end date) and recorded promotion decision. **Approved** is shown only when the source decision.promotion is approved; don't confuse that with merely creating feedback.
- **Drill:** only **submitted** drill records with test name/code, raw/max score, date, and pass/fail. Multiple tests per person remain separate.
- **Uniform:** the one uniform column shows only explicit **cadet uniform record approvals** from the Uniform Inspection Tracker, using their review approval date. Raw inspection scores and historical inspections are never displayed in Data Entry Reports.
- **Approved Uniform:** an authorized Uniform Review administrator must review the cadet's full two-month inspection record and approve the **overall cadet uniform record** for promotion. That single approval and the review date become one actionable eServices entry. An unreviewed or declined inspection cannot create an approved entry.
- **eServices status:** records start as **Needs entry**. Authorized users click **Mark entered**, or undo a mistaken mark. This is tracking **only**; nothing is sent automatically to eServices.
- **CSV / Print:** printable compact five-column grid and one-row-per-member CSV. The single uniform field includes only approved review decisions and their review dates. CSV respects search and Pending only filtering.

## Database additions

Migration data_entry_reports_initial_additive creates only:
- public.data_entry_access — unit-scoped reporting permissions
- public.data_entry_postings — eServices entry confirmations
- public.data_entry_get_units() — authorized unit listing
- public.data_entry_get_report(uuid,date) — authorized monthly report
- public.data_entry_set_posted(uuid,text,text,boolean) — permission-checked entry confirmation
- public.data_entry_uniform_approvals(uuid,date) — approved uniform review results from the Uniform Inspection Tracker
- public.data_entry_set_uniform_posted(uuid,uuid,boolean) — mark only approved review results as entered
- public.uniform_record_reviews — one overall cadet review with a two-month inspection snapshot

All new tables enable RLS; source application schema is unchanged. The new server functions check auth.uid() and unit authorization before reading source records. Entry-confirmation RPC also verifies the referenced record belongs to the selected unit.

## Testing and operations

- Tested database reporting against the existing roster and all three production source types.
- Checked an unassigned signed-in user cannot read a unit report.
- Checked app.js parses as JavaScript.
- A real-user/browser acceptance test for login, marking/unmarking, CSV, and printing is still needed.
- For member privacy, avoid distributing exported CSV files or printouts outside authorized CAP staff.
- Never expose a service-role secret in GitHub or disable RLS to fix permissions. Create staff accounts using the existing shared authentication workflow and assign their unit under **Manage Access**.

## Acceptance rule

Previously recorded inspection scores and previously submitted feedback do not automatically become uniform approvals. An authorized reviewer must explicitly approve the cadet's overall two-month uniform record in Uniform Inspection Tracker → Uniform Review. Approval is independent of any score-based pass/fail flag stored in the inspection app. The approval and rejection paths are stored immutably with the review.

## Current uniform decision source

The existing `data_entry_uniform_approvals` RPC now reads `public.uniform_record_reviews` (Uniform Inspection Tracker) rather than Leadership Feedback. It uses the **review date** for report-month grouping and `record_type=uniform_approval` to track entry into eServices. Original inspection date and score remain in Uniform Inspection Tracker, not Data Entry Reports; a rejected cadet-level review never enters the eServices queue. The posting RPC's existing `p_feedback_id` parameter name remains for backward compatibility; its UUID now identifies the Uniform Review row.

## Two-month overall review behavior

Individual uniform inspections are never posted to eServices by this app. Uniform Review considers every inspection in the two months preceding the decision date and produces **one overall approval per decision**, with the cadet's CAPID and approval date. The Data Entry Reports queue shows that approval only; inspection history stays in Uniform Inspection Tracker. The eServices entry can be marked entered or undone without changing the underlying review.
