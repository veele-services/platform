/**
 * WP1's reviewed reset contract. Relation identifiers are deliberately constants:
 * neither dispatch inputs nor environment variables can extend this scope.
 */
export const APPLY_CONFIRMATION = "fieldgrid-v1-wp1-staging-application-cleanup-v1";
export const RESET_PHASES = ["diagnose", "quiesce", "clean", "bootstrap", "verify", "resume"];
export const MIGRATION_JOURNALS = Object.freeze([
  "drizzle.__drizzle_migrations",
  "drizzle.veele_sql_migrations",
]);
// This inventory is generated from the committed migration chain and reviewed with
// the runtime-capability and hardening inventories. Unknown application relations
// are deliberately blockers, never silently added to the destructive allowlist.
export const AUTHORITATIVE_APPLICATION_RELATIONS = Object.freeze([
  "assignment_candidates","assignment_capacity_checks","assignment_checklist_answers","assignment_checklist_evidence","assignment_checklist_sources","assignment_checklists","assignment_code_sequences","assignment_extra_work","assignment_interest_responses","assignment_interest_rounds","assignment_inventory_items","assignment_material_usage","assignment_participant_executions","assignment_personnel_lifecycle_history","assignment_photos","assignment_report_note_attachments","assignment_report_notes","assignment_required_regions","assignment_route_cache","assignment_route_contexts","availability_day_entries","checklist_bindings","checklist_configuration_warnings","checklist_reconciliation_events","checklist_template_versions","checklist_templates","checklist_waivers","code_sequences","credential_recovery_challenges","credential_recovery_events","customer_contacts","customer_message_entries","customer_message_threads","customer_notifications","customer_payment_batch_items","customer_payment_batches","customer_portal_preferences","customer_regions","customer_types","customer_users","domain_events","dossier_events","dossier_notes","dossier_profiles","dossier_tasks","email_delivery_log","fieldgrid_auth_surface_locks","fieldgrid_platform_owner_continuity_lock","google_maps_autocomplete_sessions","google_maps_rate_limit_buckets","google_maps_usage_events","inventory_categories","inventory_issues","inventory_items","inventory_maintenance_events","inventory_movements","invoice_line_item_snapshots","invoice_number_sequences","invoice_numbering_settings","invoice_payment_settings","invoice_template_settings","kb_article_audiences","kb_article_feedback","kb_article_media","kb_article_modules","kb_article_permissions","kb_article_related","kb_article_versions","kb_articles","kb_categories","kb_search_events","kb_search_terms","kb_tooltip_audiences","kb_tooltip_related_articles","kb_tooltips","material_categories","material_stock_balances","material_stock_movements","materials","module_dependencies","modules","native_push_device_tokens","news_post_targets","news_posts","notification_delivery_attempts","notification_delivery_queue","notification_dispatches","notification_event_settings","object_contacts","object_personnel","object_regions","object_security_access_audit","object_security_challenges","object_security_object_revisions","object_security_records","object_security_unlock_sessions","offline_operation_receipts","payment_allocations","personnel_message_entries","personnel_message_threads","personnel_notifications","personnel_qualifications","personnel_regions","plan_limits","plan_modules","planning_sector_rules","plans","platform_email_providers","platform_notification_dispatches","platform_notification_recipients","platform_theme_settings","platform_ticket_notes","platform_tickets","platform_users","portal_notification_preferences","portal_onboarding_sessions","portal_onboarding_step_completions","portal_realtime_events","push_subscriptions","qualification_items","release_audiences","release_categories","release_dismissals","release_highlights","release_items","release_media","release_modules","release_read_receipts","release_roadmap_links","release_ticket_links","releases","roadmap_item_audiences","roadmap_item_comments","roadmap_item_modules","roadmap_item_status_history","roadmap_item_tenant_links","roadmap_item_ticket_links","roadmap_item_votes","roadmap_items","role_qualifications","sensitive_access_grants","sensitive_access_requests","stock_locations","support_access_audit_log","support_access_grants","task_code_qualifications","tenant_company_settings","tenant_domain_checks","tenant_domains","tenant_email_template_overrides","tenant_first_run_state","tenant_modules","tenant_owner_invites","tenant_provisioning_runs","tenant_regions","tenant_role_permissions","tenant_roles","tenant_sector_settings","tenant_sectors","tenant_sequences","tenant_subscriptions","tenant_task_code_prices","tenant_task_codes","tenant_theme_settings","tenant_user_roles","tenant_users","tenants","website_blog_categories","website_blog_post_tags","website_blog_posts","website_blog_tags","website_custom_deployments","website_delivery_activations","website_delivery_operations","website_domain_bindings","website_form_rate_limits","website_form_submission_events","website_form_submissions","website_forms","website_navigation_items","website_page_sections","website_pages","website_preview_sessions","website_publications","website_redirects","website_sites"
]);

// This is the destructive subset. Everything else is either retained, recreated by
// the canonical seed, provider-managed, or explicitly blocks an unsafe reset.
export const RELATION_CLASSIFICATION = Object.freeze({
  notification_delivery_attempts: "delete-test-data", notification_delivery_queue: "delete-test-data",
  notification_dispatches: "delete-test-data", personnel_notifications: "delete-test-data",
  customer_notifications: "delete-test-data", domain_events: "delete-test-data",
  documents: "delete-test-data", assignment_photos: "delete-test-data", reports: "delete-test-data",
  assignment_participant_executions: "delete-test-data", assignment_personnel_lifecycle_history: "delete-test-data",
  assignment_extra_work: "delete-test-data", assignment_tasks: "delete-test-data",
  assignment_personnel: "delete-test-data", assignments: "delete-test-data", payments: "delete-test-data",
  customer_payment_batch_items: "delete-test-data", customer_payment_batches: "delete-test-data",
  invoices: "delete-test-data", quotes: "delete-test-data", object_contacts: "delete-test-data",
  object_personnel: "delete-test-data", objects: "delete-test-data", customer_contacts: "delete-test-data",
  customer_notes: "delete-test-data", customers: "delete-test-data", availability_day_entries: "delete-test-data",
  availability_windows: "delete-test-data", leave_periods: "delete-test-data",
  personnel_qualifications: "delete-test-data", personnel: "delete-test-data",
  tenants: "preserve-configuration", tenant_domains: "preserve-configuration",
  organization_settings: "preserve-configuration", roles: "preserve-configuration",
  tenant_roles: "preserve-configuration", permissions: "preserve-platform",
  tenant_role_permissions: "preserve-platform", user_roles: "preserve-platform",
  "drizzle.__drizzle_migrations": "preserve-migration", "drizzle.veele_sql_migrations": "preserve-migration",
  "auth.users": "provider-managed", "storage.objects": "provider-managed",
});
const relationClassification = { ...RELATION_CLASSIFICATION };
for (const relation of AUTHORITATIVE_APPLICATION_RELATIONS) relationClassification[relation] ??= "blocker";
export const EXHAUSTIVE_RELATION_CLASSIFICATION = Object.freeze(relationClassification);
export const APPLICATION_TABLES = Object.freeze(Object.entries(RELATION_CLASSIFICATION)
  .filter(([, category]) => category === "delete-test-data").map(([relation]) => relation));
export const PROTECTED_TABLES = Object.freeze(Object.entries(RELATION_CLASSIFICATION)
  .filter(([, category]) => category !== "delete-test-data").map(([relation]) => relation));

export function assertRelationClassification(relations) {
  const missing = [...new Set(relations)].filter((relation) => !EXHAUSTIVE_RELATION_CLASSIFICATION[relation]);
  if (missing.length) throw new Error(`Reset blocked: unclassified relations (${missing.sort().join(",")})`);
}
export function inventoryFingerprint(inventory) {
  return JSON.stringify({ tables: inventory.applicationCounts, storage: inventory.storageObjectCount,
    auth: inventory.authCandidateCount, journals: inventory.migrationJournals });
}
export function evaluatePreflight(input) {
  const blockers = [];
  if (!input.projectVerified || !input.databaseVerified || !input.migrationFrontierValid) blockers.push("identity");
  if (!input.backupEvidence?.verified) blockers.push("backup");
  if (!input.writersCanQuiesce) blockers.push("writers");
  if (!input.canonicalAdminPreservable) blockers.push("administrator");
  if (input.activeOrUnknownPayments > 0) blockers.push("payments");
  if (input.unexpectedCandidates > 0) blockers.push("unexpected-candidates");
  return { ...input, schemaVersion: 2, environment: "staging", readyForReset: blockers.length === 0, blockers };
}
export function assertApplyEligible(preflight, expectedFingerprint) {
  if (!preflight.readyForReset) throw new Error(`Reset blocked: ${preflight.blockers.join(",")}`);
  if (inventoryFingerprint(preflight) !== expectedFingerprint) throw new Error("Reset blocked: inventory changed");
}
export function transition(state, action) {
  const index = RESET_PHASES.indexOf(state.phase);
  if (index < 0 || RESET_PHASES[index + 1] !== action) throw new Error(`Invalid reset transition ${state.phase}->${action}`);
  return { ...state, phase: action };
}
