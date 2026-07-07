-- ============================================================================
-- Fieldgrid legacy copy repair
--
-- Historical numeric migrations are immutable because staging/production record
-- their content hash after first application. This migration carries the
-- white-label data updates that were previously attempted inside older files.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL THEN
    UPDATE tenants
       SET name = 'Fieldgrid Default',
           updated_at = now()
     WHERE id = '00000000-0000-0000-0000-000000000010'::uuid
       AND name = 'Veele Services';
  END IF;

  IF to_regclass('public.organization_settings') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organization_settings'
        AND column_name = 'email_template_footer_text'
    ) THEN
      ALTER TABLE organization_settings
        ALTER COLUMN email_template_footer_text
        SET DEFAULT 'Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.';

      UPDATE organization_settings
         SET email_template_footer_text = 'Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.'
       WHERE email_template_footer_text = 'Dit is een automatisch bericht van Veele Services. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organization_settings'
        AND column_name = 'email_template_signature'
    ) THEN
      ALTER TABLE organization_settings
        ALTER COLUMN email_template_signature
        SET DEFAULT E'Met vriendelijke groet,\nFieldgrid';

      UPDATE organization_settings
         SET email_template_signature = E'Met vriendelijke groet,\nFieldgrid'
       WHERE email_template_signature = E'Met vriendelijke groet,\nVeele Services';
    END IF;
  END IF;

  IF to_regclass('public.notification_event_settings') IS NOT NULL THEN
    UPDATE notification_event_settings
       SET email_subject = 'Factuur {{invoice.number}} staat klaar'
     WHERE event_key = 'invoice_sent'
       AND email_subject = 'Factuur {{invoice.number}} van Veele Services';

    UPDATE notification_event_settings
       SET email_subject = 'Toegang tot het Fieldgrid-portaal'
     WHERE event_key = 'portal_invite'
       AND email_subject = 'Toegang tot het Veele portaal';

    UPDATE notification_event_settings
       SET description = 'Backoffice heeft gereageerd op een klantticket.'
     WHERE event_key = 'customer_ticket_backoffice_reply'
       AND description = 'Veele Services heeft gereageerd op een klantticket.';
  END IF;

  IF to_regclass('public.qualification_items') IS NOT NULL THEN
    UPDATE qualification_items
       SET description = 'Werken volgens organisatieprotocollen voor schoonmaak.',
           updated_at = now()
     WHERE code = 'SCHOONMAAKPROTOCOL'
       AND description = 'Werken volgens Veele schoonmaakprotocollen.';
  END IF;
END $$;
