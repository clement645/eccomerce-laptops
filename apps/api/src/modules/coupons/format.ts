/** "Ksh 5,000" for messages shown to customers. */
export function formatKesPlain(minor: number): string {
  return `Ksh ${(minor / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
}
