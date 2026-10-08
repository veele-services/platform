"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownAZ, ArrowRightLeft, ChevronDown, LockKeyhole, Mail, Plus, Search, ShieldCheck, UserRoundCog, UserRoundX, Save } from "lucide-react";
import { toast } from "sonner";
import type { TenantContext } from "@/lib/auth/context";
import { managementModuleNames, type ManagementRole, type ManagementSnapshot } from "@/lib/management/model";
import { managementPermissionLabel } from "@/lib/management/labels";
import { inviteManagementUser, runManagementCommand } from "@/app/app/gebruikers/actions";
import { PageHeading } from "../page-heading";
import { ContentTabs } from "../content-tabs";
import { ActionIcon } from "../action-icon";
import { EmptyState } from "../empty-state";
import { ListPagination, useListPagination } from "../list-pagination";
import { WorkOrderDialog } from "../work-orders/dialog";
import "./management.css";

type Member = ManagementSnapshot["users"][number];
const statusLabel = (user: Member) => user.status === "suspended" ? "Geblokkeerd" : user.status === "revoked" ? "Ingetrokken" : user.status === "invited" || user.invitedAt && !user.acceptedAt ? "Uitgenodigd" : "Actief";

/** A retry of the same form intent reuses its receipt; an edited form is a new intent. */
function useRequestId() {
  const request = useRef({ signature: "", id: "" });
  return (input: unknown) => { const signature = JSON.stringify(input); if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() }; return request.current.id; };
}

export function ManagementUsers({ tenant, currentUserId, initial }: { tenant: TenantContext; currentUserId: string; initial: ManagementSnapshot }) {
  const router = useRouter();
  const [tab, setTab] = useState("users"), [query, setQuery] = useState(""), [rightsQuery, setRightsQuery] = useState(""), [sort, setSort] = useState({ field: "name", direction: 1 });
  const [invite, setInvite] = useState(false), [selectedRole, setSelectedRole] = useState(initial.roles.find(role => role.code === "management")?.id ?? initial.roles[0]?.id);
  const [editing, setEditing] = useState<Member | null>(null), [transfer, setTransfer] = useState(false), [pending, start] = useTransition();
  const ownerId = initial.roles.find(role => role.code === "owner")?.id;
  const filtered = useMemo(() => initial.users.filter(user => `${user.name} ${user.email} ${user.roleName}`.toLocaleLowerCase("nl").includes(query.toLocaleLowerCase("nl"))).sort((left, right) => {
    const value = (user: Member) => sort.field === "email" ? user.email : sort.field === "role" ? user.roleName : sort.field === "status" ? statusLabel(user) : user.name;
    return value(left).localeCompare(value(right), "nl", { numeric: true }) * sort.direction;
  }), [initial.users, query, sort]);
  const pagination = useListPagination(filtered);
  const command = (operation: Parameters<typeof runManagementCommand>[0], success: string) => start(async () => {
    const result = await runManagementCommand(operation);
    if (!result.ok) { toast.error(result.error); return; }
    if (result.warning) toast.warning(result.warning); else toast.success(success);
    router.refresh();
  });
  const sortHeader = (name: string, field: string) => <th scope="col" aria-sort={sort.field === field ? sort.direction === 1 ? "ascending" : "descending" : "none"}><button type="button" onClick={() => { setSort(current => ({ field, direction: current.field === field ? -current.direction : 1 })); pagination.setPage(1); }}>{name}<ArrowDownAZ size={13}/></button></th>;
  const users = <><section className="resource-table-panel panel management-content-card" aria-label="Managementgebruikers"><div className="table-scroll"><table className="resource-table management-user-table">
    <thead><tr>{sortHeader("Gebruiker", "name")}{sortHeader("E-mailadres", "email")}{sortHeader("Rol", "role")}{sortHeader("Status", "status")}<th scope="col">Acties</th></tr></thead>
    <tbody>{pagination.items.map(user => <tr key={user.id}>
      <td><strong>{user.name}</strong>{user.userId === currentUserId && <small>Eigen account</small>}</td><td>{user.email}</td><td><span className="management-role-label"><ShieldCheck size={14}/>{user.roleName}</span></td><td><span className="resource-status">{statusLabel(user)}</span></td>
      <td><div className="resource-actions">{initial.canManage && user.userId !== currentUserId && user.roleId !== ownerId && <>
        <ActionIcon className="resource-action" label={`Rol van ${user.name} wijzigen`} icon={<UserRoundCog size={16}/>} disabled={pending} onClick={() => setEditing(user)}/>
        {user.status === "active" && <><ActionIcon className="resource-action" label={`Uitnodiging aan ${user.name} opnieuw versturen`} icon={<Mail size={16}/>} disabled={pending} onClick={() => command({ command: "resend", input: { memberId: user.id, revision: user.revision }, requestId: crypto.randomUUID() }, "Uitnodiging verwerkt")}/><ActionIcon className="resource-action" label={`Toegang van ${user.name} intrekken`} icon={<UserRoundX size={16}/>} disabled={pending} onClick={() => setEditing(user)}/></>}
      </>}</div></td>
    </tr>)}</tbody></table></div>{!filtered.length && <EmptyState title={query ? "Geen managementgebruikers gevonden" : "Nog geen managementgebruikers"} description={query ? "Pas je zoekopdracht aan om andere gebruikers te vinden." : "Nodig een gebruiker uit met de plusknop bovenaan."}/>}</section>
    <ListPagination total={pagination.total} page={pagination.page} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} noun="gebruikers" preferenceKey={`management:${tenant.id}:users`}/></>;
  const roles = <section className="panel management-content-card" aria-label="Managementrollen"><div className="management-role-grid">{initial.roles.map(role => <article className="management-role-card" key={role.id}>
    <span className="management-role-icon"><ShieldCheck size={22}/></span><h2>{role.name}</h2><p>{initial.users.filter(user => user.roleId === role.id && user.status === "active").length} gebruikers · {role.permissions.length} rechten</p>
    <button className="secondary-button" aria-label={`Rechten van ${role.name} bekijken`} onClick={() => { setSelectedRole(role.id); setTab("permissions"); }}>Rechten bekijken</button>
  </article>)}</div><p className="management-summary">Rechten horen bij een rol en gelden voor alle gebruikers van die rol. Alleen de eigenaar beheert gebruikers, rechten en overdracht. Personeels- en klantaccounts behouden hun eigen portaaltoegang.</p></section>;
  const role = initial.roles.find(value => value.id === selectedRole) ?? initial.roles[0];
  const rights = role ? <section className="panel management-content-card" aria-label="Rolrechten"><header className="management-permission-actions"><div><span className="eyebrow">PAGINA’S EN FUNCTIES</span><h2>Rechten voor {role.name}</h2></div><label>Rol<select aria-label="Rol voor rechten" value={role.id} onChange={event => setSelectedRole(event.target.value)}>{initial.roles.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label></header>
    <RolePermissions key={`${role.id}:${role.revision}`} role={role} catalog={initial.catalog} query={rightsQuery} canManage={initial.canManage} onSaved={() => router.refresh()}/></section> : <section className="panel management-content-card"><EmptyState title="Nog geen rollen" description="De standaardrollen worden aangemaakt bij het inrichten van de organisatie."/></section>;
  return <div className="management-page"><PageHeading eyebrow="ORGANISATIE" title="Gebruikers en rollen" help="Nodig managementgebruikers uit, bepaal hun pagina’s en functies en draag het eigenaarschap gecontroleerd over." actions={<>
    {tab !== "roles" && <label className="page-list-search"><Search size={16}/><input aria-label={tab === "permissions" ? "Rechten zoeken" : "Gebruikers zoeken"} type="search" placeholder={tab === "permissions" ? "Pagina of functie…" : "Naam, e-mail of rol…"} value={tab === "permissions" ? rightsQuery : query} onChange={event => { if (tab === "permissions") setRightsQuery(event.target.value); else { setQuery(event.target.value); pagination.setPage(1); } }}/></label>}
    {initial.canManage && <><ActionIcon className="secondary-button" label="Eigenaarschap overdragen" icon={<ArrowRightLeft size={18}/>} onClick={() => setTransfer(true)}/><ActionIcon className="primary-button" label="Managementgebruiker uitnodigen" icon={<Plus size={18}/>} onClick={() => setInvite(true)}/></>}
  </>}/>
    {initial.transfers.map(value => <section className="panel management-transfer-box" key={value.id}><div><strong>Eigendomsoverdracht wacht op acceptatie</strong><p>{initial.users.find(user => user.id === value.target)?.name ?? "De nieuwe eigenaar"} kan de overdracht na opnieuw inloggen accepteren. Geldig tot {new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: tenant.timezone }).format(new Date(value.expiresAt))}.</p></div>{initial.canManage && <button className="secondary-button" disabled={pending} onClick={() => command({ command: "cancel_transfer", input: { transferId: value.id }, requestId: crypto.randomUUID() }, "Overdracht ingetrokken")}>Intrekken</button>}</section>)}
    <ContentTabs label="Gebruikers en rollen" value={tab} onValueChange={setTab} tabs={[{ id: "users", title: "Gebruikers", content: users }, { id: "roles", title: "Rollen", content: roles }, { id: "permissions", title: "Rechten", content: rights }]}/>
    {invite && <InvitationDialog tenant={tenant} roles={initial.roles} onClose={() => setInvite(false)} onSaved={() => { setInvite(false); router.refresh(); }}/>} 
    {editing && <MemberDialog tenant={tenant} user={editing} roles={initial.roles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }}/>} 
    {transfer && <TransferDialog tenant={tenant} users={initial.users.filter(user => user.userId !== currentUserId && user.status === "active" && user.acceptedAt && user.roleId !== ownerId)} onClose={() => setTransfer(false)} onSaved={() => { setTransfer(false); router.refresh(); }}/>} 
  </div>;
}

function RolePermissions({ role, catalog, query, canManage, onSaved }: { role: ManagementRole; catalog: ManagementSnapshot["catalog"]; query: string; canManage: boolean; onSaved: () => void }) {
  const [permissions, setPermissions] = useState(role.permissions), [baselineRevision] = useState(role.revision), [pending, start] = useTransition(), [error, setError] = useState("");
  const editable = canManage && role.code !== "owner", dirty = permissions.length !== role.permissions.length || permissions.some(key => !role.permissions.includes(key));
  const groups = useMemo(() => Object.entries(catalog.reduce<Record<string, ManagementSnapshot["catalog"]>>((all, value) => { (all[value.module] ??= []).push(value); return all; }, {})), [catalog]);
  function toggle(key: string, enabled: boolean) {
    setError("");
    setPermissions(current => {
      const next = new Set(current);
      if (enabled) {
        const add = (value: string) => { if (next.has(value)) return; next.add(value); const capability = catalog.find(item => item.key === value); capability?.dependencies.forEach(add); if (capability?.key.startsWith("backoffice.functions.")) add(`backoffice.${capability.module}.${capability.action}`); if (/^backoffice\.[^.]+\.write$/.test(value)) add(value.replace(".write", ".read")); };
        add(key);
      } else {
        next.delete(key); let removed = true;
        while (removed) { removed = false; for (const capability of catalog) if (next.has(capability.key) && (capability.dependencies.some(value => !next.has(value)) || capability.key.startsWith("backoffice.functions.") && !next.has(`backoffice.${capability.module}.${capability.action}`) || /^backoffice\.[^.]+\.write$/.test(capability.key) && !next.has(capability.key.replace(".write", ".read")))) { next.delete(capability.key); removed = true; } }
      }
      next.add("backoffice.access"); return [...next];
    });
  }
  const matches = (permission: ManagementSnapshot["catalog"][number]) => `${managementPermissionLabel(permission)} ${managementModuleNames[permission.module] ?? ""}`.toLocaleLowerCase("nl").includes(query.toLocaleLowerCase("nl"));
  const visible = groups.map(([module, items]) => [module, items.filter(matches)] as const).filter(([, items]) => items.length);
  return <><div className="management-note"><ShieldCheck size={20}/><p>{role.code === "owner" ? "De eigenaar heeft alle vastgelegde tenantrechten. Alleen een bevestigde overdracht kan dit eigenaarschap wijzigen." : "Pagina-inzage en bewerken zijn afzonderlijke rechten. Een functie vereist ook het bijbehorende paginarecht. Wijzigingen gelden direct voor alle gebruikers van deze rol."}</p></div>
    <div className="management-permission-section">{visible.map(([module, items]) => <details className="management-permission-group" key={module} open><summary><span>{managementModuleNames[module] ?? "Overige rechten"}</span><span className="management-permission-count">{items.filter(item => permissions.includes(item.key)).length} van {items.length}</span><ChevronDown size={16}/></summary>
      <div className="management-permission-grid">{items.map(permission => <label className="management-permission" key={permission.key}><input type="checkbox" value={permission.key} checked={permissions.includes(permission.key)} disabled={!editable || pending || permission.key === "backoffice.access" || permission.key.startsWith("management.")} onChange={event => toggle(permission.key, event.target.checked)}/><span>{managementPermissionLabel(permission)}{permission.sensitive && <small><LockKeyhole size={12}/>Vertrouwelijke gegevens</small>}</span></label>)}</div>
    </details>)}</div>
    {!visible.length && <EmptyState title="Geen rechten gevonden" description="Pas je zoekopdracht aan om andere pagina’s of functies te vinden."/>}
    {error && <p role="alert" className="wo-error">{error}</p>}
    {editable && <footer className="management-save"><p aria-live="polite">{dirty ? "Je wijzigingen zijn nog niet opgeslagen." : `${permissions.length} rechten toegewezen aan ${role.name}.`}</p><button className="primary-button" disabled={pending || !dirty} onClick={() => start(async () => {
      setError(""); const result = await runManagementCommand({ command: "save_role", input: { roleId: role.id, revision: baselineRevision, permissions }, requestId: crypto.randomUUID() });
      if (!result.ok) { setError(result.error); return; } toast.success("Rolrechten opgeslagen"); onSaved();
    })}><Save size={16}/>{pending ? "Opslaan…" : "Rechten opslaan"}</button></footer>}
  </>;
}

function InvitationDialog({ tenant, roles, onClose, onSaved }: { tenant: TenantContext; roles: ManagementRole[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [role, setRole] = useState(roles.find(value => value.code === "management")?.id ?? ""), [pending, start] = useTransition(), [error, setError] = useState("");
  const requestId = useRequestId(), dirty = Boolean(name || email), cancel = () => { if (!pending && (!dirty || window.confirm("Je uitnodiging is nog niet verstuurd. Wil je de invoer weggooien?"))) onClose(); };
  return <WorkOrderDialog tenant={tenant} eyebrow="GEBRUIKERS" title="Managementgebruiker uitnodigen" description="De gebruiker ontvangt een uitnodiging en logt daarna in met een eenmalige e-mailcode." busy={pending} dirty={dirty} onClose={onClose}>
    <form id="management-invite" className="wo-dialog-body management-form management-invite-form" onSubmit={event => { event.preventDefault(); start(async () => {
      setError(""); const input = { name, email, roleId: role }; const result = await inviteManagementUser({ ...input, requestId: requestId(input) });
      if (!result.ok) { setError(result.error); return; } if (result.warning) toast.warning(result.warning); else toast.success("Uitnodiging verzonden"); onSaved();
    }); }}>
      <label>Volledige naam<input autoComplete="name" required minLength={2} maxLength={160} disabled={pending} value={name} onChange={event => setName(event.target.value)}/></label>
      <label>E-mailadres<input type="email" autoComplete="email" required maxLength={254} disabled={pending} value={email} onChange={event => setEmail(event.target.value)}/></label>
      <label className="wide">Rol<select required disabled={pending} value={role} onChange={event => setRole(event.target.value)}><option value="" disabled>Kies een managementrol</option>{roles.filter(value => value.code !== "owner").map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <p className="management-summary wide">De uitnodiging geeft uitsluitend toegang tot de pagina’s en functies van de gekozen rol.</p>
      {error && <p role="alert" className="wo-error wide">{error}</p>}
    </form><footer className="wizard-footer"><button className="secondary-button" disabled={pending} onClick={cancel}>Annuleren</button><button className="primary-button" disabled={pending || !role} form="management-invite">{pending ? "Uitnodigen…" : "Uitnodiging versturen"}</button></footer>
  </WorkOrderDialog>;
}

function MemberDialog({ tenant, user, roles, onClose, onSaved }: { tenant: TenantContext; user: Member; roles: ManagementRole[]; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState(user.roleId ?? roles.find(value => value.code === "management")?.id), [pending, start] = useTransition(), [error, setError] = useState("");
  const requestId = useRequestId(), dirty = role !== user.roleId, cancel = () => { if (!pending && (!dirty || window.confirm("Je rolwijziging is nog niet opgeslagen. Wil je die weggooien?"))) onClose(); };
  function run(command: "assign" | "revoke") {
    if (command === "revoke" && !window.confirm(`De managementtoegang van ${user.name} intrekken?`)) return;
    start(async () => { setError(""); const input = { memberId: user.id, roleId: role, revision: user.revision }; const result = await runManagementCommand({ command, input, requestId: requestId({ command, input }) });
      if (!result.ok) { setError(result.error); return; } toast.success(command === "revoke" ? "Toegang ingetrokken" : "Rol opgeslagen"); onSaved(); });
  }
  return <WorkOrderDialog tenant={tenant} eyebrow="GEBRUIKERS" title={`Managementrol van ${user.name}`} description={user.email} busy={pending} dirty={dirty} onClose={onClose}>
    <div className="wo-dialog-body management-form"><label>Managementrol<select required disabled={pending} value={role ?? ""} onChange={event => setRole(event.target.value)}><option value="" disabled>Kies een managementrol</option>{roles.filter(value => value.code !== "owner").map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <p className="management-summary">Een rolwijziging geldt direct. Intrekken sluit de managementtoegang; bestaande personeels- of klantrelaties worden niet gewijzigd.</p>{error && <p role="alert" className="wo-error">{error}</p>}
    </div><footer className="wizard-footer">{user.status === "active" && <button className="secondary-button management-danger" disabled={pending} onClick={() => run("revoke")}>Toegang intrekken</button>}<button className="secondary-button" disabled={pending} onClick={cancel}>Annuleren</button><button className="primary-button" disabled={pending || !role || user.status === "active" && !dirty} onClick={() => run("assign")}>{user.status === "active" ? "Rol opslaan" : "Toegang herstellen"}</button></footer>
  </WorkOrderDialog>;
}

function TransferDialog({ tenant, users, onClose, onSaved }: { tenant: TenantContext; users: ManagementSnapshot["users"]; onClose: () => void; onSaved: () => void }) {
  const [target, setTarget] = useState(users[0]?.id ?? ""), [confirmed, setConfirmed] = useState(false), [pending, start] = useTransition(), [error, setError] = useState("");
  const requestId = useRequestId();
  return <WorkOrderDialog tenant={tenant} eyebrow="EIGENAARSCHAP" title="Eigenaarschap overdragen" description="De nieuwe eigenaar moet binnen 48 uur accepteren met een recente inlogcode. Daarna krijg jij de rol Management." busy={pending} onClose={onClose}>
    <div className="wo-dialog-body management-form"><label>Nieuwe eigenaar<select required value={target} onChange={event => { setTarget(event.target.value); setConfirmed(false); }} disabled={pending || !users.length}><option value="" disabled>Kies een actieve managementgebruiker</option>{users.map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>
      {!users.length && <p className="management-summary">Nodig eerst een gebruiker uit en laat die inloggen.</p>}
      <label className="management-permission"><input type="checkbox" disabled={pending || !target} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>Ik wil het volledige eigenaarschap aan deze gebruiker overdragen.</span></label>{error && <p role="alert" className="wo-error">{error}</p>}
    </div><footer className="wizard-footer"><button className="secondary-button" disabled={pending} onClick={onClose}>Annuleren</button><button className="primary-button" disabled={pending || !target || !confirmed} onClick={() => start(async () => {
      setError(""); const input = { memberId: target }; const result = await runManagementCommand({ command: "transfer", input, requestId: requestId(input) });
      if (!result.ok) { setError(result.error); return; } toast.success("Overdracht ter acceptatie klaargezet"); onSaved();
    })}>Overdracht klaarzetten</button></footer>
  </WorkOrderDialog>;
}
