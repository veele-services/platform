import { requireThat, identifier, fail } from './contract.mjs';

// Reviewed against a real PostgreSQL 17 installation of the complete committed
// migration chain. Discovery validates this list; it NEVER authorizes deletion.
const DELETE = `
assignment_candidates assignment_capacity_checks assignment_checklist_answers assignment_checklist_evidence
assignment_checklist_sources assignment_checklists assignment_extra_work assignment_interest_responses
assignment_interest_rounds assignment_inventory_items assignment_material_usage assignment_participant_executions
assignment_personnel assignment_personnel_lifecycle_history assignment_photos assignment_report_note_attachments
assignment_report_notes assignment_required_regions assignment_route_cache assignment_route_contexts assignment_tasks assignments
availability_day_entries availability_windows checklist_configuration_warnings checklist_reconciliation_events checklist_waivers
credential_recovery_challenges credential_recovery_events customer_contacts customer_message_entries customer_message_threads
customer_notes customer_notifications customer_payment_batch_items customer_payment_batches customer_portal_preferences customer_regions
customer_users customers documents domain_events dossier_events dossier_notes dossier_profiles dossier_tasks email_delivery_log
 google_maps_autocomplete_sessions google_maps_rate_limit_buckets google_maps_usage_events inventory_issues inventory_items
inventory_maintenance_events inventory_movements invoice_line_item_snapshots invoices leave_periods material_stock_balances
material_stock_movements materials native_push_device_tokens news_post_targets news_posts notification_delivery_attempts
notification_delivery_queue notification_dispatches object_contacts object_personnel object_regions object_security_access_audit
object_security_challenges object_security_object_revisions object_security_records object_security_unlock_sessions objects
 offline_operation_receipts payment_allocations payments personnel personnel_message_entries personnel_message_threads personnel_notifications
personnel_qualifications personnel_regions platform_notification_dispatches platform_notification_recipients
portal_onboarding_sessions portal_onboarding_step_completions portal_realtime_events push_subscriptions quotes reports
sensitive_access_grants sensitive_access_requests
`.trim().split(/\s+/);
const PRESERVE = `
audit_log checklist_bindings checklist_template_versions checklist_templates customer_types
fieldgrid_auth_surface_locks fieldgrid_platform_owner_continuity_lock inventory_categories
invoice_numbering_settings invoice_payment_settings invoice_template_settings
kb_article_audiences kb_article_feedback kb_article_media kb_article_modules kb_article_permissions kb_article_related
kb_article_versions kb_articles kb_categories kb_search_events kb_search_terms kb_tooltip_audiences kb_tooltip_related_articles kb_tooltips
material_categories module_dependencies modules notification_event_settings organization_settings permissions
plan_limits plan_modules planning_sector_rules plans platform_email_providers platform_theme_settings platform_ticket_notes platform_tickets
platform_users portal_notification_preferences qualification_items release_audiences release_categories release_dismissals
release_highlights release_items release_media release_modules release_read_receipts release_roadmap_links release_ticket_links releases
roadmap_item_audiences roadmap_item_comments roadmap_item_modules roadmap_item_status_history roadmap_item_tenant_links
roadmap_item_ticket_links roadmap_item_votes roadmap_items role_permissions role_qualifications roles sectors stock_locations
support_access_audit_log support_access_grants task_code_qualifications task_codes tenant_company_settings tenant_domain_checks tenant_domains
 tenant_email_template_overrides tenant_first_run_state tenant_modules tenant_owner_invites tenant_provisioning_runs tenant_regions
 tenant_role_permissions tenant_roles tenant_sector_settings tenant_sectors tenant_subscriptions tenant_task_code_prices tenant_task_codes
 tenant_theme_settings tenant_user_roles tenant_users tenants user_roles
website_blog_categories website_blog_post_tags website_blog_posts website_blog_tags website_custom_deployments website_delivery_activations
website_delivery_operations website_domain_bindings website_form_rate_limits website_form_submission_events website_form_submissions
website_forms website_navigation_items website_page_sections website_pages website_preview_sessions website_publications website_redirects website_sites
`.trim().split(/\s+/);
const COUNTERS = ['assignment_code_sequences', 'code_sequences', 'invoice_number_sequences', 'tenant_sequences'];
export const JOURNALS = Object.freeze(['drizzle.__drizzle_migrations', 'drizzle.veele_sql_migrations']);
const all = [...DELETE, ...PRESERVE, ...COUNTERS];
requireThat(new Set(all).size === all.length, 'DUPLICATE_CLASSIFICATION');
for (const name of all) identifier(name);
export const CLASSIFICATION = Object.freeze(Object.fromEntries([
  ...DELETE.map(name => [name, 'delete-test-data']), ...PRESERVE.map(name => [name, 'preserve-configuration']),
  ...COUNTERS.map(name => [name, 'preserve-counter']),
]));
export const DELETE_TABLES = Object.freeze([...DELETE].sort());
export const ALL_TABLES = Object.freeze([...all].sort());
export const PRESERVE_TABLES = Object.freeze([...PRESERVE].sort());

export function assertCatalogCoverage(names) {
  requireThat(Array.isArray(names) && names.every(name => typeof name === 'string'), 'CATALOG_INVALID');
  const current = [...new Set(names)].sort();
  requireThat(current.length === names.length && JSON.stringify(current) === JSON.stringify(ALL_TABLES), 'CATALOG_COVERAGE');
}
function requiresChildFirst(fk) {
  // CASCADE and SET NULL resolve the dependency when the parent is deleted.
  // NO ACTION, RESTRICT and SET DEFAULT remain hard ordering constraints.
  return !['c', 'n'].includes(fk.action);
}
export function deletionOrder(fks) {
  const remaining = new Set(DELETE_TABLES), result = [];
  while (remaining.size) {
    const next = [...remaining].sort().find(parent => !fks.some(fk =>
      fk.parentSchema === 'public' && fk.childSchema === 'public' &&
      fk.parent === parent && fk.child !== parent && remaining.has(fk.child) &&
      requiresChildFirst(fk)));
    if (!next) fail('FK_CYCLE');
    result.push(next); remaining.delete(next);
  }
  return result;
}
// Only these existing business-history DELETE guards can be suspended in the
// exclusive, rolled-back-on-error staging TESTDATA transaction. RLS, FK triggers,
// all other triggers, permissions and function bodies are never disabled/changed.
// Each binding is checked before use and its original enable mode is restored
// BEFORE bootstrap. A before/after catalog fingerprint must be identical.
export const HISTORY_DELETE_GUARDS = Object.freeze([
  ['assignment_checklist_answers', 'trg_assignment_checklist_answers_no_delete', 'checklist_history_guard'],
  ['assignment_checklist_evidence', 'trg_assignment_checklist_evidence_no_delete', 'checklist_history_guard'],
  ['assignment_checklists', 'trg_assignment_checklists_mutation_guard', 'checklist_snapshot_mutation_guard'],
  ['checklist_waivers', 'trg_checklist_waivers_append_only', 'checklist_history_guard'],
  ['dossier_events', 'trg_dossier_events_append_only', 'fieldgrid_dossier_append_only'],
  ['dossier_notes', 'trg_dossier_notes_append_only', 'fieldgrid_dossier_append_only'],
  ['invoice_line_item_snapshots', 'prevent_finalized_invoice_line_snapshot_delete', 'fieldgrid_prevent_finalized_invoice_line_snapshot_mutation'],
  ['object_security_access_audit', 'trg_object_security_audit_append_only', 'fieldgrid_object_security_audit_append_only'],
  ['object_security_records', 'trg_object_security_record_revision_guard', 'fieldgrid_object_security_record_revision_guard'],
]);
