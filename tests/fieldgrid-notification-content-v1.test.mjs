import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const requiredAttachmentKeys = ["assignment_cancelled_personnel","assignment_not_completed_backoffice","assignment_planned_personnel","assignment_reminder_personnel","assignment_started_backoffice","assignment_updated_personnel","availability_reminder_personnel","custom_domain_dns_attention","customer_portal_invite","customer_request_submitted_backoffice","customer_request_submitted_confirmation","document_shared_customer","document_shared_personnel","email_provider_test_failed","email_provider_test_success","invoice_sent_customer","kb_article_featured","kb_article_published","kb_article_updated","leave_approved_personnel","leave_rejected_personnel","leave_requested_backoffice","news_published","open_assignment_interested_backoffice","open_assignment_invite_personnel","open_assignment_reserve_personnel","open_assignment_selected_personnel","organization_environment_created","organization_onboarding_attention","password_reset_code","payment_received_customer","payment_reminder_customer","personnel_portal_invite","quote_accepted_backoffice","quote_expired_customer","quote_rejected_backoffice","quote_sent_customer","release_featured","release_highlight_active","release_published","report_approved_personnel","report_available_customer","report_rejected_personnel","report_submitted_backoffice","roadmap_comment_added","roadmap_item_done","roadmap_request_submitted","roadmap_status_changed","support_access_expired","support_access_granted","ticket_created_customer_backoffice","ticket_created_personnel_backoffice","ticket_reply_customer","ticket_reply_personnel"];

const requiredRuntimeAliases = ["portal_invite","customer_assignment_requested","quote_sent_to_customer","quote_approved_by_customer","quote_rejected_by_customer","quote_expired","report_available_to_customer","invoice_sent","payment_reminder","invoice_paid","assignment_assigned","assignment_personnel_linked","assignment_rescheduled","assignment_seen","assignment_started","assignment_en_route","assignment_completed","assignment_not_completed","assignment_interest_invited","assignment_interest_reminder","report_submitted","report_approved","report_rejected","leave_requested","leave_decision","customer_ticket_created","customer_ticket_replied","personnel_ticket_created","personnel_assignment_question_created","customer_ticket_backoffice_reply","personnel_ticket_backoffice_reply"];

function rowFor(sql, key) {
  const marker = `    '${key}',`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `${key} should be seeded`);
  const end = sql.indexOf("\n  )", start);
  return sql.slice(start, end);
}

test("fieldgrid notification content v1 seeds every requested event and current runtime alias", () => {
  const sql = read("lib/db/migrations/101_fieldgrid_notification_content_v1.sql");
  assert.match(sql, /ON CONFLICT \(event_key\) DO UPDATE SET/u);
  assert.match(sql, /email_enabled = EXCLUDED\.email_enabled/u);
  assert.match(sql, /push_enabled = EXCLUDED\.push_enabled/u);
  assert.match(sql, /in_app_enabled = EXCLUDED\.in_app_enabled/u);

  for (const key of [...requiredAttachmentKeys, ...requiredRuntimeAliases]) {
    const row = rowFor(sql, key);
    assert.match(row, /\$fgnotif\$[\s\S]+?\$fgnotif\$/u, `${key} should contain text fields`);
    assert.match(row, /::jsonb/u, `${key} should have shortcode jsonb`);
    assert.doesNotMatch(row, /\$fgnotif\$\s*\$fgnotif\$/u, `${key} should not contain empty text fields`);
  }
});

test("customer and personnel notification copy avoids technical terms", () => {
  const sql = read("lib/db/migrations/101_fieldgrid_notification_content_v1.sql");
  const forbidden = /\b(?:tenant|queue|worker|payload|dispatch|hostcontext|provisioning|module entitlement|scope)\b/iu;
  for (const key of [...requiredAttachmentKeys, ...requiredRuntimeAliases]) {
    const row = rowFor(sql, key);
    if (/\n    '(?:customer|personnel|mixed)',/u.test(row)) {
      assert.doesNotMatch(row, forbidden, `${key} should be end-user friendly`);
    }
  }
});

test("direct email templates use refreshed Fieldgrid copy and no old generic branding", () => {
  const templates = read("lib/db/src/email-templates.ts");
  assert.match(templates, /Activeer uw toegang tot \{\{portalName\}\} van \{\{brandName\}\}/u);
  assert.match(templates, /Uw account staat klaar/u);
  assert.match(templates, /Wachtwoord opnieuw instellen/u);
  assert.match(templates, /Factuur \{\{invoiceNumber\}\} staat klaar/u);
  assert.match(templates, /Betalingsherinnering voor factuur/u);
  assert.match(templates, /E-mailinstellingen test/u);
  assert.doesNotMatch(templates, /Tenant mailinstellingen test|tenant e-mailconfiguratie|Veele platform|Test SMTP-instellingen Veele/u);
});

test("notification settings UI exposes friendly shortcode labels and avoids technical delivery words", () => {
  const ui = read("artifacts/backoffice/src/components/settings/NotificatiesView.tsx");
  assert.match(ui, /Naam ontvanger/u);
  assert.match(ui, /shortcodeLabel/u);
  assert.match(ui, /Pushverzending voorbereid/u);
  assert.doesNotMatch(ui, /push-queue|delivery queue|payload|PWA queue/u);
});
