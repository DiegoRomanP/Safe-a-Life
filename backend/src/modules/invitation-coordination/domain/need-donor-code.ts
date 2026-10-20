const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const NEED_DONOR_CODE_LENGTH = 10;

/** Código opaco por necesidad (V14): Crockford base32 de 10 caracteres. La aleatoriedad se inyecta. */
export function generateNeedDonorCode(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(NEED_DONOR_CODE_LENGTH);
  if (bytes.length < NEED_DONOR_CODE_LENGTH) throw new RangeError('Aleatoriedad insuficiente.');
  let code = '';
  for (let i = 0; i < NEED_DONOR_CODE_LENGTH; i += 1) code += CROCKFORD[(bytes[i] as number) & 31];
  return code;
}
