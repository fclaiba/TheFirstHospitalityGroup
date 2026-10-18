export type StepKind =
  | "overview"
  | "section"
  | "field"
  | "choice"
  | "action"
  | "link"
  | "details"
  | "status"
  | "navigation";
export type Candidate = {
  id: string;
  kind: StepKind;
  label: string;
  visible: boolean;
  disabled?: boolean;
};
/** A walkthrough narrates available functions, not every repeated record. Never invent a hidden control. */
export function buildSteps<T extends Candidate>(candidates: T[]): T[] {
  const seen = new Set<string>();
  return candidates
    .filter((step) => {
      const key = `${step.kind}:${step.label.trim()}`;
      if (!step.visible || step.disabled || !step.label.trim() || seen.has(key))
        return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}
