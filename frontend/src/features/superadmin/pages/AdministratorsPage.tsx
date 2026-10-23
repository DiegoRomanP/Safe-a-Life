import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '../../../components/ui/Button.js';
import { Input } from '../../../components/ui/Input.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Alert } from '../../../components/ui/Alert.js';
import { Card } from '../../../components/ui/Card.js';
import { InstitutionForm } from '../components/InstitutionForm.js';
import { ActionNotice, MoreResults, PageIntro, ReadBoundary, useAdminAction, useAdminPage } from '../components/AdminStates.js';
import { adminPath, hospitalsPage, idPath, membershipsPage } from '../httpGateway.js';
import type { Membership } from '../types.js';

function RevokeMembershipForm({ membership, onSaved, onClose }: { membership: Membership; onSaved: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const reasonInput = useRef<HTMLInputElement>(null);
  const action = useAdminAction();
  useEffect(() => { reasonInput.current?.focus(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim() || reason.trim().length > 300) {
      setError('Indica un motivo administrativo de hasta 300 caracteres.');
      reasonInput.current?.focus();
      return;
    }
    setError('');
    await action.execute(adminPath + '/memberships/' + idPath(membership.membershipId), 'PATCH', { status: 'revocada', reason: reason.trim() }, onSaved);
  }
  return <Card title="Revocar membresía">
    <form aria-label="Revocar membresía" className="sa-form" onSubmit={(event) => { void submit(event); }}>
      <p>Se retirará el acceso administrativo de {membership.emailHint} a este hospital. El servidor comprueba la membresía vigente en cada operación.</p>
      <div className="grid gap-1.5">
        <label htmlFor="sa-membership-reason">Motivo administrativo *</label>
        <Input ref={reasonInput} id="sa-membership-reason" required maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} disabled={action.pending || action.saved} aria-invalid={!!error} aria-describedby="sa-membership-help" />
        <p id="sa-membership-help" className="text-sm text-muted">No incluyas datos personales en el motivo. Esta operación requiere autenticación reforzada reciente.</p>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <ActionNotice {...action} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="danger" disabled={action.pending || action.saved}>{action.pending ? 'Revocando…' : action.saved ? 'Revocación aceptada' : 'Confirmar revocación'}</Button>
        <Button variant="ghost" onClick={onClose} disabled={action.pending}>Cerrar revocación</Button>
      </div>
    </form>
  </Card>;
}

export function AdministratorsPage() {
  const read = useAdminPage(adminPath + '/memberships', membershipsPage);
  const hospitals = useAdminPage(adminPath + '/hospitals', hospitalsPage);
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState<Membership | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  function closeRevocation() {
    flushSync(() => setRevoking(null));
    const target = trigger.current?.isConnected ? trigger.current : document.getElementById('sa-invite-administrator');
    target?.focus();
  }
  function closeInvitation() {
    flushSync(() => setOpen(false));
    document.getElementById('sa-invite-administrator')?.focus();
  }
  return <>
    <PageIntro title="Administradores y membresías" description="Consulta las membresías e invita administradores a un hospital autorizado." action={<Button id="sa-invite-administrator" disabled={open || !!revoking} onClick={() => setOpen(true)}>Invitar administrador</Button>} />
    <Alert tone="warning" title="Autenticación reforzada"><p>Invitar administradores o revocar membresías requiere un segundo factor reciente. El servidor valida el hospital y los permisos.</p></Alert>
    {open && <ReadBoundary {...hospitals}>
      <InstitutionForm kind="administrator" hospitals={hospitals.items} onSaved={read.retry} onClose={closeInvitation} />
      <MoreResults {...hospitals} count={hospitals.items.length} />
    </ReadBoundary>}
    {revoking && <RevokeMembershipForm key={revoking.membershipId} membership={revoking} onSaved={read.retry} onClose={closeRevocation} />}
    <ReadBoundary {...read} empty={!read.items.length}>
      <div className="sa-table-wrap">
        <table role="table" className="sa-table">
          <caption>Membresías registradas</caption>
          <thead><tr>{['Administrador', 'Hospital', 'Estado', 'Acción'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{read.items.map((membership) => <tr key={membership.membershipId}>
            <td data-label="Administrador"><strong>{membership.emailHint}</strong><p className="text-sm text-muted">{membership.membershipId}</p></td>
            <td data-label="Hospital">{hospitals.items.find((hospital) => hospital.hospitalId === membership.hospitalId)?.publicName ?? membership.hospitalId}</td>
            <td data-label="Estado"><Badge tone={membership.status === 'activa' ? 'success' : 'neutral'}>{membership.status === 'activa' ? 'Activa' : membership.status === 'pendiente' ? 'Pendiente' : 'Revocada'}</Badge></td>
            <td data-label="Acción">{membership.status === 'revocada' ? 'Sin acceso' : <Button variant="secondary" disabled={open || !!revoking} onClick={(event) => { trigger.current = event.currentTarget; setRevoking(membership); }}>Revocar</Button>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </ReadBoundary>
    {!read.loading && !read.error && <MoreResults {...read} count={read.items.length} />}
  </>;
}
