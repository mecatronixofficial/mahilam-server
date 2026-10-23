import { BadRequestException, ForbiddenException } from "@nestjs/common";
export const PIPELINE_STAGES = ["NEW_ENQUIRY", "CONTACTED", "QUALIFIED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "APPLICATION_STARTED", "DOCUMENTS_PENDING", "APPLICATION_SUBMITTED", "APPROVED", "ENROLLED", "WAITLISTED", "REJECTED", "LOST"] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];
export function canonicalStage(stage: string): string {
  return ({ NEW: "NEW_ENQUIRY", FOLLOW_UP: "CONTACTED", VISITED: "VISIT_COMPLETED", ADMISSION_CONFIRMED: "ENROLLED", NOT_INTERESTED: "LOST", CLOSED: "LOST" } as Record<string, string>)[stage] ?? stage;
}
const edges: Record<string, string[]> = {
  NEW_ENQUIRY: ["CONTACTED", "LOST"],
  CONTACTED: ["QUALIFIED", "VISIT_SCHEDULED", "LOST"],
  QUALIFIED: ["VISIT_SCHEDULED", "APPLICATION_STARTED", "WAITLISTED", "LOST"],
  VISIT_SCHEDULED: ["VISIT_COMPLETED", "CONTACTED", "LOST"],
  VISIT_COMPLETED: ["APPLICATION_STARTED", "QUALIFIED", "LOST"],
  APPLICATION_STARTED: ["DOCUMENTS_PENDING", "APPLICATION_SUBMITTED", "LOST"],
  DOCUMENTS_PENDING: ["APPLICATION_SUBMITTED", "LOST"],
  APPLICATION_SUBMITTED: ["APPROVED", "WAITLISTED", "REJECTED"],
  APPROVED: ["ENROLLED", "WAITLISTED", "REJECTED"],
  WAITLISTED: ["QUALIFIED", "APPROVED", "REJECTED", "LOST"],
  REJECTED: [], LOST: [], ENROLLED: [],
};
export function assertStageTransition(from: string, to: string, options: { managed?: boolean; manager?: boolean; reason?: string | null } = {}) {
  const source = canonicalStage(from), target = canonicalStage(to);
  if (source === target) return;
  if (!PIPELINE_STAGES.includes(target as PipelineStage)) throw new BadRequestException("Unknown admission stage");
  if (!options.managed && ["APPLICATION_SUBMITTED", "APPROVED", "ENROLLED", "REJECTED"].includes(target)) throw new ForbiddenException("Use the application submission, review or enrollment action for this stage");
  if (["LOST", "WAITLISTED", "REJECTED"].includes(source) && target === "QUALIFIED" && options.manager) return;
  if (!(edges[source] ?? []).includes(target)) throw new BadRequestException(`Cannot move from ${source} to ${target}`);
  if (target === "LOST" && !options.reason?.trim()) throw new BadRequestException("A lost enquiry reason is required");
  if (["APPROVED", "REJECTED", "ENROLLED"].includes(target) && !options.manager) throw new ForbiddenException("An admission manager or administrator must perform this action");
}
export function normalizedPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}
export function assertWorkTransition(from: string, to: string) {
  if (from !== to && from !== "PENDING") throw new BadRequestException("Completed or cancelled items cannot be reopened");
}
