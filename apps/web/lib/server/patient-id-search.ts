export function escapePatientIdLikePattern(patientId: string): string {
  return patientId.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function patientIdSearchPattern(patientId: string): string {
  return `%${escapePatientIdLikePattern(patientId)}%`;
}
