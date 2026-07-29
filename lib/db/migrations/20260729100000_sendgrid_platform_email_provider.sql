-- Add SendGrid as a first-class platform-wide outgoing email provider.
-- Provider secrets remain encrypted by the application layer.

ALTER TABLE public.platform_email_providers
  DROP CONSTRAINT IF EXISTS platform_email_providers_provider_type_check;
ALTER TABLE public.platform_email_providers
  ADD CONSTRAINT platform_email_providers_provider_type_check
  CHECK (provider_type IN ('sendgrid_api', 'resend_api', 'smtp'));

ALTER TABLE public.email_delivery_log
  DROP CONSTRAINT IF EXISTS email_delivery_log_provider_type_check;
ALTER TABLE public.email_delivery_log
  ADD CONSTRAINT email_delivery_log_provider_type_check
  CHECK (
    provider_type IN (
      'sendgrid_api',
      'resend_api',
      'smtp',
      'legacy_smtp',
      'env_resend',
      'test_outbox',
      'none'
    )
  );

COMMENT ON COLUMN public.platform_email_providers.provider_type IS
  'Platform mail transport: sendgrid_api, resend_api or smtp.';

UPDATE public.kb_articles
SET
  summary = 'Stel centraal in hoe Fieldgrid e-mails verstuurt via SendGrid API, Resend API of SMTP.',
  content_json = jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(
          jsonb_build_object(
            'type', 'text',
            'text', 'Fieldgrid gebruikt standaard SendGrid als centrale e-mailprovider.'
          )
        )
      )
    )
  ),
  content_html = $fgkb$
    <h2>Uitleg</h2>
    <p>Fieldgrid verstuurt standaardmails centraal via SendGrid. Resend API en SMTP blijven als fallback beschikbaar. API keys en SMTP-wachtwoorden worden versleuteld opgeslagen en nooit volledig teruggetoond.</p>
    <h2>Stappen</h2>
    <ol>
      <li>Authenticeer fieldgrid.nl in SendGrid.</li>
      <li>Maak een Custom Access API key met alleen Mail Send.</li>
      <li>Open Platformbeheer &gt; Instellingen &gt; E-mailprovider.</li>
      <li>Kies SendGrid API en vul API key, regio, sending domain, afzender en reply-to in.</li>
      <li>Zet SendGrid actief en sla de provider op.</li>
      <li>Verstuur een testmail en controleer de afleverstatus.</li>
    </ol>
    <h2>Let op</h2>
    <ul>
      <li>Kies EU alleen voor een SendGrid EU-regional subuser.</li>
      <li>Standaardmails komen vanuit Fieldgrid. Custom enterprise-afzenders volgen later.</li>
      <li>Deel een API key nooit via documentatie, tickets of chat.</li>
    </ul>
  $fgkb$,
  content_text = $fgkb$
Uitleg

Fieldgrid verstuurt standaardmails centraal via SendGrid. Resend API en SMTP blijven als fallback beschikbaar. API keys en SMTP-wachtwoorden worden versleuteld opgeslagen en nooit volledig teruggetoond.

Stappen

1. Authenticeer fieldgrid.nl in SendGrid.
2. Maak een Custom Access API key met alleen Mail Send.
3. Open Platformbeheer > Instellingen > E-mailprovider.
4. Kies SendGrid API en vul API key, regio, sending domain, afzender en reply-to in.
5. Zet SendGrid actief en sla de provider op.
6. Verstuur een testmail en controleer de afleverstatus.

Let op

- Kies EU alleen voor een SendGrid EU-regional subuser.
- Standaardmails komen vanuit Fieldgrid. Custom enterprise-afzenders volgen later.
- Deel een API key nooit via documentatie, tickets of chat.
$fgkb$,
  updated_at = now()
WHERE scope = 'platform_global'
  AND tenant_id IS NULL
  AND slug = 'platform-e-mailprovider-instellen'
  AND language = 'nl';
