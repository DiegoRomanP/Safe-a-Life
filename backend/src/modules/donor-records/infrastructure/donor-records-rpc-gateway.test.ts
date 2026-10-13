import { describe, expect, it } from 'vitest';
import { PersistenceError } from '../../../shared/persistence/errors.js';
import type { RpcCall, RpcInvoker } from '../../../shared/persistence/rpc-invoker.js';
import { createDonorRecordsRpcGateway, parseProfile, parseSignup } from './donor-records-rpc-gateway.js';

const SIGNUP = { signupId: '5e5abebf-64ab-4ac4-a276-d91ca386886f', status: 'pendiente', createdAt: '2026-10-13T10:00:00Z', activationExpiresAt: '2026-10-14T10:00:00Z', purgeAt: '2026-11-12T10:00:00Z' };
const PROFILE = { name: 'Ana', email: 'ana@example.test', declaredBloodType: 'O_POS', isAvailable: true, approximateLocation: { latitude: -12.046, longitude: -77.043 } };
const HASH = 'a'.repeat(64);

function harness(reply: Record<string, unknown> | ((name: string) => Record<string, unknown>)) {
  const calls: Array<Pick<RpcCall<string>, 'accessToken' | 'name' | 'args'>> = [];
  const make = (label: string): RpcInvoker => (async ({ accessToken, name, args }: RpcCall<string>) => { calls.push({ accessToken, name: `${label}:${name}`, args }); return typeof reply === 'function' ? reply(name) : reply; }) as RpcInvoker;
  return { calls, repository: createDonorRecordsRpcGateway(make('usuario'), make('tecnica')) };
}

describe('guardas cerradas de las proyecciones', () => {
  it('aceptan la forma exacta y devuelven copias congeladas', () => {
    expect(parseSignup(SIGNUP)).toEqual(SIGNUP);
    expect(Object.isFrozen(parseProfile(PROFILE))).toBe(true);
  });

  it.each([
    ['alta con campo extra', () => parseSignup({ ...SIGNUP, email: 'x@example.test' })],
    ['alta con estado desconocido', () => parseSignup({ ...SIGNUP, status: 'archivada' })],
    ['perfil con grupo desconocido', () => parseProfile({ ...PROFILE, declaredBloodType: 'XX' })],
    ['perfil con campo extra', () => parseProfile({ ...PROFILE, latitude: 1 })],
    ['perfil sin ubicación', () => parseProfile({ ...PROFILE, approximateLocation: null })],
  ])('rechazan %s como fallo de persistencia', (_label, run) => {
    expect(run).toThrow(PersistenceError);
  });
});

describe('repositorio', () => {
  it('las RPC con hash de token o id de usuario van por la sesión técnica y con argumentos p_*', async () => {
    const { repository, calls } = harness((name) => name === 'verify_donor_email'
      ? { kind: 'ok', status: 'incompleto', emailVerified: true, userId: 'u-1', email: 'a@example.test', passwordSetupRequired: true }
      : { kind: 'ok', status: 'incompleto', emailVerified: true });

    await repository.verifyDonorEmail(HASH);
    await repository.linkAssistedAccount('u-1', HASH);

    expect(calls.map((call) => call.name)).toEqual(['tecnica:verify_donor_email', 'tecnica:link_assisted_account']);
    expect(calls[1].args).toEqual({ p_user_id: 'u-1', p_token_hash: HASH });
  });

  it('traduce los estados del perfil a los del contrato (incompleto = reclamada_incompleta)', async () => {
    const verified = { kind: 'ok', emailVerified: true, userId: 'u-1', email: 'a@example.test', passwordSetupRequired: false };
    expect((await harness({ ...verified, status: 'incompleto' }).repository.verifyDonorEmail(HASH)).outcome.status).toBe('reclamada_incompleta');
    expect((await harness({ ...verified, status: 'activo' }).repository.verifyDonorEmail(HASH)).outcome.status).toBe('activa');
    expect((await harness({ kind: 'ok', status: 'reclamada_incompleta', emailVerified: true }).repository.linkAssistedAccount('u', HASH)).status).toBe('reclamada_incompleta');
  });

  it('rechaza un resultado con el correo sin verificar', async () => {
    await expect(harness({ kind: 'ok', status: 'incompleto', emailVerified: false, userId: 'u-1', email: 'a@example.test', passwordSetupRequired: false })
      .repository.verifyDonorEmail(HASH)).rejects.toThrow();
  });

  it('las RPC de la contraseña pendiente van por la sesión técnica con argumentos p_*', async () => {
    const { repository, calls } = harness({ kind: 'ok' });

    await repository.issuePasswordSetup('u-1', { tokenHash: HASH, outboxId: 'o-1', sealed: 'sellado' });
    await repository.confirmPasswordSetup('u-1');

    expect(calls.map((call) => call.name)).toEqual(['tecnica:issue_password_setup', 'tecnica:confirm_password_setup']);
    expect(calls[0].args).toEqual({ p_user_id: 'u-1', p_token_hash: HASH, p_outbox_id: 'o-1', p_sealed: 'sellado' });
    expect(calls[1].args).toEqual({ p_user_id: 'u-1' });
  });

  it('crear un alta usa la sesión de la persona y no envía hash de token ni correo sellado', async () => {
    const { repository, calls } = harness({ kind: 'created', signup: SIGNUP, seq: 1 });

    const registered = await repository.createAssistedSignup('jwt', { key: 'clave-alta-0000001', hash: HASH }, { email: 'a@example.test', name: null });

    expect(registered).toEqual({ signup: SIGNUP, seq: 1 });
    expect(calls[0]).toMatchObject({ accessToken: 'jwt', name: 'usuario:create_assisted_signup' });
    expect(calls[0].args).toEqual({ p_key: 'clave-alta-0000001', p_hash: HASH, p_email: 'a@example.test', p_name: null });
  });

  it('emitir el enlace de activación va por la sesión técnica con el payload sellado', async () => {
    const { repository, calls } = harness({ kind: 'ok' });

    await repository.issueAssistedActivation('s1', 'h1', 2, { tokenHash: HASH, outboxId: '70000000-0000-4000-8000-000000000001', sealed: 'v1.k1.cifrado' });

    expect(calls[0].name).toBe('tecnica:issue_assisted_activation');
    expect(calls[0].args).toEqual({ p_signup_id: 's1', p_hospital_id: 'h1', p_seq: 2, p_token_hash: HASH, p_outbox_id: '70000000-0000-4000-8000-000000000001', p_sealed: 'v1.k1.cifrado' });
  });

  it('reemitir devuelve el número de emisión', async () => {
    const { repository, calls } = harness({ kind: 'ok', seq: 3 });

    expect(await repository.reissueAssistedLink('jwt', { key: 'clave-reemit-00001', hash: HASH }, 's1')).toEqual({ seq: 3 });
    expect(calls[0].args).toEqual({ p_key: 'clave-reemit-00001', p_hash: HASH, p_id: 's1' });
  });

  it('la participación envía null por lo que no cambia', async () => {
    const { repository, calls } = harness({ kind: 'ok', profile: PROFILE });

    await repository.updateParticipation('jwt', { key: 'clave-partic-0001', hash: HASH }, { isAvailable: false });

    expect(calls[0].args).toEqual({ p_key: 'clave-partic-0001', p_hash: HASH, p_available: false, p_latitude: null, p_longitude: null, p_polygon_version: null });
  });

  it('la lista devuelve la página con su cursor', async () => {
    const { repository } = harness({ kind: 'ok', items: [SIGNUP], next: { createdAt: '2026-10-13T10:00:00Z', id: SIGNUP.signupId } });

    const page = await repository.listAssistedSignups('jwt', { limit: 10, cursor: null });

    expect(page.items).toEqual([SIGNUP]);
    expect(page.next).toEqual({ createdAt: '2026-10-13T10:00:00Z', id: SIGNUP.signupId });
  });
});
