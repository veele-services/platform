'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Check, CheckCircle2, CircleHelp, Clock3, KeyRound, Link2, LoaderCircle, RefreshCw, ShieldCheck, Unlink, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { connectionRequest, ConnectionRequestError, type BlogConnection, type ConnectionAction, type ConnectionScope } from './client';
import styles from './connector.module.css';

type Action = ConnectionAction['action'] | 'load';
const statusCopy = {
  unconfigured: { label: 'Nog niet ingesteld', description: 'De koppeling is nog niet ingesteld voor deze omgeving. Laat de installatie afronden voordat je een koppelcode gebruikt.', icon: CircleHelp },
  disconnected: { label: 'Niet gekoppeld', description: 'Koppel deze website aan SocialHero om campagneartikelen als concept te ontvangen.', icon: Link2 },
  pending: { label: 'Bevestiging nodig', description: 'De voorlopige koppeling is opgeslagen. Hervat de verificatie om de verbinding te bevestigen.', icon: Clock3 },
  active: { label: 'Gekoppeld', description: 'SocialHero kan deze website gebruiken binnen de onderstaande toegangsrechten.', icon: CheckCircle2 },
  expired: { label: 'Koppeling verlopen', description: 'De voorlopige koppeling is verlopen. Maak een nieuwe koppelcode aan in SocialHero en koppel opnieuw.', icon: Clock3 },
  rejected: { label: 'Koppeling afgewezen', description: 'De koppeling kon niet worden bevestigd. Controleer de website en omgeving in SocialHero en gebruik een nieuwe code.', icon: XCircle },
};
const environmentLabels: Record<string, string> = { production: 'Productie', staging: 'Staging', development: 'Lokale testomgeving', local: 'Lokale testomgeving' };
const permissionLabels: Record<ConnectionScope, { title: string; description: string }> = {
  read: { title: 'Verbinding en artikelen lezen', description: 'De website en de status van artikelen controleren.' },
  draft: { title: 'Concepten beheren', description: 'Afbeeldingen uploaden en artikelconcepten aanmaken of bijwerken.' },
  publish: { title: 'Artikelen publiceren', description: 'Een expliciet goedgekeurde artikelrevisie publiceren.' },
};
function formattedDate(value?: string) {
  return value ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' }).format(new Date(value)) : 'Nog niet gecontroleerd';
}

function PermissionFields({ id, allowDraft, allowPublish, disabled, onDraft, onPublish }: { id: string; allowDraft: boolean; allowPublish: boolean; disabled: boolean; onDraft: (value: boolean) => void; onPublish: (value: boolean) => void }) {
  return <div className={styles.permissionFields}>
    <div className={styles.checkbox}><Checkbox id={`${id}-draft`} checked={allowDraft} disabled={disabled} onCheckedChange={value => onDraft(value === true)} /><label htmlFor={`${id}-draft`}>SocialHero mag concepten aanleveren</label></div>
    <div className={styles.checkbox}><Checkbox id={`${id}-publish`} checked={allowPublish} disabled={disabled} onCheckedChange={value => onPublish(value === true)} aria-describedby={`${id}-publish-hint`} /><label htmlFor={`${id}-publish`}>SocialHero mag automatisch publiceren</label></div>
    <p id={`${id}-publish-hint`} className={styles.hint}>SocialHero mag artikelen zelfstandig live zetten volgens de campagneplanning en de ingestelde goedkeuringsmodus.</p>
  </div>;
}

export function BlogConnectorPanel() {
  const inputId = useId(), permissionId = useId();
  const [connection, setConnection] = useState<BlogConnection | null>(null);
  const [busy, setBusy] = useState<Action | 'retry' | null>('load');
  const [code, setCode] = useState('');
  const [error, setError] = useState<ConnectionRequestError | null>(null);
  const [notice, setNotice] = useState('');
  const [lastAction, setLastAction] = useState<Action>('load');
  const [reconnect, setReconnect] = useState(false);
  const [allowDraft, setAllowDraft] = useState(true);
  const [allowPublish, setAllowPublish] = useState(true);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const mounted = useRef(true);
  const confirmation = useRef<HTMLDivElement>(null);
  const codeExpiresAt = useRef(0);
  const pairBaselineId = useRef<string | undefined>(undefined);
  const policyIntent = useRef({ allowDraft: true, allowPublish: true });
  const pairIntent = useRef({ allowDraft: true, allowPublish: true });
  const active = connection?.status === 'active';
  const pending = connection?.status === 'pending';
  const configured = Boolean(connection && connection.status !== 'unconfigured');
  const canPair = configured && (!active && !pending || reconnect);
  const policyDirty = Boolean(active && connection && (allowDraft !== connection.allowDraft || allowPublish !== connection.allowPublish));
  const disabled = busy !== null || remaining > 0;

  const accept = useCallback((next: BlogConnection) => {
    if (!mounted.current) return;
    setConnection(next);
    setAllowDraft(next.allowDraft);
    setAllowPublish(next.allowPublish);
    if (['active', 'pending', 'expired', 'rejected'].includes(next.status)) setCode('');
    if (next.status === 'active' || next.status === 'pending') setReconnect(false);
  }, []);
  const failure = useCallback((value: unknown, keepPolicyDraft = false, keepPairDraft = false) => {
    if (!mounted.current) return;
    const next = value instanceof ConnectionRequestError ? value : new ConnectionRequestError('NETWORK_ERROR');
    if (next.connection) accept(next.connection);
    if (keepPolicyDraft && (!next.connection || next.connection.status === 'active')) { setAllowDraft(policyIntent.current.allowDraft); setAllowPublish(policyIntent.current.allowPublish); }
    if (keepPairDraft && next.retryable && (!next.connection || ['disconnected', 'expired', 'rejected'].includes(next.connection.status))) { setAllowDraft(pairIntent.current.allowDraft); setAllowPublish(pairIntent.current.allowPublish); }
    if (next.clearCode) setCode('');
    if (next.retryAfter > 0) setCooldownUntil(Date.now() + next.retryAfter * 1000);
    setError(next);
  }, [accept]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    connectionRequest(undefined, controller.signal).then(accept).catch(value => {
      if (!controller.signal.aborted) failure(value);
    }).finally(() => { if (!controller.signal.aborted) setBusy(null); });
    return () => { mounted.current = false; controller.abort(); };
  }, [accept, failure]);

  useEffect(() => {
    if (!code) { codeExpiresAt.current = 0; return; }
    if (!codeExpiresAt.current) codeExpiresAt.current = Date.now() + 120_000;
    const timer = window.setTimeout(() => {
      setCode('');
      setNotice('De koppelcode is gewist. Plak de code opnieuw om verder te gaan.');
    }, Math.max(0, codeExpiresAt.current - Date.now()));
    return () => window.clearTimeout(timer);
  }, [code]);

  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => { if (confirmDisconnect) confirmation.current?.focus(); }, [confirmDisconnect]);

  async function act(action: Action) {
    if (disabled) return;
    if (action === 'pair' && !code.trim()) return;
    if (action === 'pair') { pairBaselineId.current = connection?.connectionId; pairIntent.current = { allowDraft, allowPublish }; }
    if (action === 'policy') policyIntent.current = { allowDraft, allowPublish };
    setBusy(action); setLastAction(action); setError(null); setNotice('');
    try {
      const payload: ConnectionAction | undefined = action === 'load' ? undefined
        : action === 'pair' ? { action, code: code.trim(), allowDraft, allowPublish }
          : action === 'policy' ? { action, allowDraft, allowPublish } : { action };
      const next = await connectionRequest(payload);
      accept(next);
      if (action === 'disconnect') { setCode(''); setReconnect(false); setConfirmDisconnect(false); }
      setNotice(action === 'policy' ? 'De toestemmingen zijn opgeslagen.'
        : action === 'disconnect' ? 'De koppeling is ontkoppeld. Je artikelen blijven bewaard.'
          : next.status === 'active' && (action === 'pair' || action === 'verify') ? 'De koppeling is bevestigd en actief.'
            : next.status === 'pending' ? 'De voorlopige koppeling is opgeslagen. Hervat de verificatie om verder te gaan.'
              : action === 'check' ? 'De verbinding is gecontroleerd.' : action === 'load' ? 'De status is vernieuwd.' : 'De koppelstatus is bijgewerkt.');
    } catch (value) { failure(value, action === 'policy', action === 'pair'); }
    finally { if (mounted.current) setBusy(null); }
  }

  async function retry() {
    if (disabled) return;
    if (lastAction !== 'pair') { await act(lastAction); return; }
    // A timed-out claim may already have committed. Read its state before writing again.
    setBusy('retry'); setError(null); setNotice('');
    try {
      let next = await connectionRequest();
      accept(next);
      if (next.status === 'pending') { next = await connectionRequest({ action: 'verify' }); accept(next); }
      else if ((next.status === 'disconnected' || next.status === 'active' && next.connectionId === pairBaselineId.current) && code.trim()) { next = await connectionRequest({ action: 'pair', code: code.trim(), ...pairIntent.current }); accept(next); }
      setNotice(next.status === 'active' ? 'De koppeling is bevestigd en actief.' : next.status === 'pending' ? 'De koppeling wacht nog op bevestiging. Hervat de verificatie om verder te gaan.' : 'De status is vernieuwd. Gebruik een nieuwe koppelcode als de vorige is verlopen.');
    } catch (value) { failure(value, false, true); }
    finally { if (mounted.current) setBusy(null); }
  }

  function pair(event: FormEvent) { event.preventDefault(); void act('pair'); }
  const detail = connection ? statusCopy[connection.status] : null;
  const StatusIcon = detail?.icon ?? Link2;

  return <section className={styles.page} aria-labelledby="blog-socialhero-title">
    <Link className={styles.back} href="/platform/blog" prefetch={false}><ArrowLeft size={16} aria-hidden="true" /> Terug naar blogbeheer</Link>
    <header className={styles.heading}><div><span className={styles.eyebrow}>BLOGINSTELLINGEN</span><h1 id="blog-socialhero-title">SocialHero</h1><p>Ontvang campagneartikelen in je bestaande blogredactie en bepaal wat SocialHero mag publiceren.</p></div><span className={styles.brandIcon} aria-hidden="true"><Link2 size={26} /></span></header>

    {error && <Alert variant="destructive" className={styles.feedback}><XCircle aria-hidden="true" /><AlertTitle>De handeling is niet afgerond</AlertTitle><AlertDescription><p>{error.message}</p><div className={styles.actions}>{error.retryable && <Button type="button" variant="outline" disabled={disabled} onClick={() => void retry()}><RefreshCw aria-hidden="true" />{remaining ? `Opnieuw proberen over ${remaining}s` : 'Opnieuw proberen'}</Button>}<Button type="button" variant="ghost" disabled={disabled} onClick={() => void act('load')}>Status vernieuwen</Button></div></AlertDescription></Alert>}
    {notice && <Alert role="status" className={styles.notice}><CheckCircle2 aria-hidden="true" /><AlertDescription>{notice}</AlertDescription></Alert>}

    <div className={styles.layout}>
      <div className={styles.main}>
        <Card className={styles.card}>
          <CardHeader className={styles.cardHeader}><CardTitle><h2>Verbinding</h2></CardTitle>{detail && <span className={styles.status} data-status={connection?.status}><StatusIcon size={15} aria-hidden="true" />{detail.label}</span>}</CardHeader>
          <CardContent className={styles.cardContent}>
            {busy === 'load' && !connection ? <p role="status" className={styles.loading}><LoaderCircle size={18} className={styles.spin} aria-hidden="true" /> Verbindingsstatus laden…</p> : !connection ? <p>De verbindingsstatus is nog niet beschikbaar. Vernieuw de status om verder te gaan.</p> : <>
              <p className={styles.description}>{detail?.description}</p>
              <dl className={styles.identity}>
                <div><dt>Website</dt><dd><strong>{connection.siteName}</strong><span>{connection.origin}</span></dd></div>
                <div><dt>Omgeving</dt><dd><span className={styles.environment} data-environment={connection.environment}>{environmentLabels[connection.environment] ?? connection.environment}</span></dd></div>
                <div><dt>SocialHero</dt><dd>{connection.socialHeroOrigin ?? 'Nog niet ingesteld'}</dd></div>
                <div><dt>Laatst gecontroleerd</dt><dd>{formattedDate(connection.lastCheckedAt)}</dd></div>
                {pending && connection.expiresAt && <div><dt>Bevestigen vóór</dt><dd>{formattedDate(connection.expiresAt)}</dd></div>}
              </dl>
              {(active || pending) && <div className={styles.actions}>
                <Button type="button" variant={pending ? 'default' : 'outline'} disabled={disabled} onClick={() => void act(pending ? 'verify' : 'check')}><RefreshCw className={busy === 'verify' || busy === 'check' ? styles.spin : undefined} aria-hidden="true" />{pending ? busy === 'verify' ? 'Verifiëren…' : 'Verificatie hervatten' : busy === 'check' ? 'Controleren…' : 'Verbinding controleren'}</Button>
                <Button type="button" variant="ghost" disabled={disabled} onClick={() => { setReconnect(!reconnect); setCode(''); }}>{reconnect ? 'Koppelen annuleren' : 'Opnieuw koppelen'}</Button>
                <Button type="button" variant="ghost" className={styles.disconnect} disabled={disabled} onClick={() => setConfirmDisconnect(true)}><Unlink aria-hidden="true" />Ontkoppelen</Button>
              </div>}
              {!active && !pending && <div className={styles.actions}><Button type="button" variant="outline" disabled={disabled} onClick={() => void act('load')}><RefreshCw aria-hidden="true" />Status vernieuwen</Button></div>}
            </>}
          </CardContent>
        </Card>

        {canPair && <Card className={styles.card}><CardHeader><CardTitle><h2>{connection?.status === 'disconnected' ? 'Website koppelen' : 'Opnieuw koppelen'}</h2></CardTitle></CardHeader><CardContent className={styles.cardContent}>
          <p className={styles.description}>Open de websitekoppeling in SocialHero en maak een koppelcode aan voor deze website en omgeving. De code is tien minuten geldig.</p>
          {connection?.socialHeroOrigin && <a href={connection.socialHeroOrigin} target="_blank" rel="noopener noreferrer" className={styles.external}>Open SocialHero <ArrowUpRight size={15} aria-hidden="true" /></a>}
          <form onSubmit={pair} className={styles.form} autoComplete="off">
            <div className={styles.pairPermissions}><strong>Toestemmingen voor deze koppeling</strong><PermissionFields id={`${permissionId}-pair`} allowDraft={allowDraft} allowPublish={allowPublish} disabled={disabled} onDraft={setAllowDraft} onPublish={setAllowPublish} /></div>
            <label htmlFor={inputId}>Eenmalige koppelcode</label>
            <div className={styles.codeRow}><Input id={inputId} type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={code} maxLength={512} required disabled={disabled} aria-describedby={`${inputId}-hint`} onChange={event => setCode(event.target.value)} /><Button type="submit" disabled={disabled || !code.trim()}><KeyRound aria-hidden="true" />{busy === 'pair' || busy === 'retry' ? 'Koppelen…' : 'Verbinden'}</Button></div>
            <p id={`${inputId}-hint`} className={styles.hint}>De code blijft bij een tijdelijke fout maximaal twee minuten bewaard op deze pagina en wordt na het koppelen gewist.</p>
          </form>
        </CardContent></Card>}

        {confirmDisconnect && <Alert ref={confirmation} tabIndex={-1} className={styles.confirm} onKeyDown={event => { if (event.key === 'Escape') setConfirmDisconnect(false); }}><Unlink aria-hidden="true" /><AlertTitle>Koppeling ontkoppelen?</AlertTitle><AlertDescription><p>SocialHero krijgt direct geen toegang meer tot deze website. Je artikelen en publicatiehistorie blijven bewaard.</p><div className={styles.actions}><Button type="button" variant="destructive" disabled={disabled} onClick={() => void act('disconnect')}>{busy === 'disconnect' ? 'Ontkoppelen…' : 'Ontkoppeling bevestigen'}</Button><Button type="button" variant="outline" disabled={busy !== null} onClick={() => setConfirmDisconnect(false)}>Annuleren</Button></div></AlertDescription></Alert>}
      </div>

      <aside className={styles.aside}>
        <Card className={styles.card}><CardHeader><CardTitle><h2><ShieldCheck size={19} aria-hidden="true" /> Toestemmingen</h2></CardTitle></CardHeader><CardContent className={styles.cardContent}>
          <p className={styles.description}>Bepaal of SocialHero concepten mag aanleveren en artikelen zelfstandig mag publiceren. Je kunt deze toestemmingen hier aanpassen.</p>
          {connection?.environment === 'staging' && <p className={styles.stagingNote}>Staging blijft buiten zoekmachines. Artikelen behouden de productiecanonical; SocialHero kan de stagingpublicatie daarom op wacht op website houden.</p>}
          <span className={styles.policyState} data-enabled={Boolean(active && connection?.allowPublish)}>{active && connection?.allowPublish ? 'Publiceren toegestaan' : 'Publiceren uitgeschakeld'}</span>
          <span className={styles.policyState} data-enabled={Boolean(active && connection?.allowDraft)}>{active && connection?.allowDraft ? 'Concepten toegestaan' : 'Concepten uitgeschakeld'}</span>
          {active && !canPair ? <><PermissionFields id={permissionId} allowDraft={allowDraft} allowPublish={allowPublish} disabled={disabled} onDraft={setAllowDraft} onPublish={setAllowPublish} /><p className={styles.hint}>{policyDirty ? 'Deze wijzigingen zijn nog niet opgeslagen.' : 'Deze toestemmingen gelden alleen voor de website en omgeving op deze pagina.'}</p><Button type="button" variant="outline" disabled={disabled || !policyDirty} onClick={() => void act('policy')}>{busy === 'policy' ? 'Opslaan…' : 'Toestemmingen opslaan'}</Button></> : <p className={styles.hint}>{canPair ? 'Controleer je toestemmingen voordat je de website koppelt. Een eerder opgeslagen keuze blijft bij opnieuw koppelen behouden.' : pending ? 'De gekozen toestemmingen worden actief zodra de koppeling is bevestigd.' : 'Stel de koppeling in om toestemmingen te kiezen.'}</p>}
        </CardContent></Card>

        <Card className={styles.card}><CardHeader><CardTitle><h2>Toegang voor SocialHero</h2></CardTitle></CardHeader><CardContent className={styles.cardContent}><ul className={styles.permissions}>{(['read', 'draft', 'publish'] as const).map(scope => {
          const enabled = Boolean(active && connection?.scopes.includes(scope) && (scope !== 'publish' || connection.allowPublish) && (scope !== 'draft' || connection.allowDraft));
          return <li key={scope} data-enabled={enabled}><span aria-label={enabled ? 'Toegestaan' : 'Niet toegestaan'}>{enabled ? <Check size={16} /> : <Unlink size={15} />}</span><div><strong>{permissionLabels[scope].title}</strong><p>{permissionLabels[scope].description}</p></div></li>;
        })}</ul>{pending && <p className={styles.hint}>Tijdens de verificatie is de voorlopige koppeling alleen beschikbaar voor de verbindingscontrole.</p>}</CardContent></Card>
      </aside>
    </div>
  </section>;
}
