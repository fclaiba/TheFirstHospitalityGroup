// Versioned starting criteria, not a claim to reproduce any restaurant's private manual.
import enGuide from "../messages/en/guide.json";
import esGuide from "../messages/es/guide.json";
import enTraining from "../messages/en/training.json";
import esTraining from "../messages/es/training.json";
import enCommon from "../messages/en/common.json";
import esCommon from "../messages/es/common.json";
import { TRAINING_VERSION } from "../lib/domain/training";
import type { Position } from "../lib/domain/types";

export type Program = {
  position: Position;
  version: number;
  title: { en: string; es: string };
  steps: Array<{
    key: string;
    label: { en: string; es: string };
    evidence: { en: string; es: string };
  }>;
  isDefault: boolean;
};
export function defaultProgram(position: Position): Program | null {
  if (position === "owner" || position === "dev") return null;
  const en = (
    { ...enGuide.guide.training, ...enTraining.training.defaults } as Record<
      string,
      Record<string, string>
    >
  )[position];
  const es = (
    { ...esGuide.guide.training, ...esTraining.training.defaults } as Record<
      string,
      Record<string, string>
    >
  )[position];
  if (!en || !es) return null;
  return {
    position,
    version: TRAINING_VERSION,
    isDefault: true,
    title: {
      en: enCommon.positions[position],
      es: esCommon.positions[position],
    },
    steps: Object.keys(en).map((key) => ({
      key,
      label: { en: en[key]!, es: es[key]! },
      evidence: {
        en: enTraining.training.defaultEvidence.replace("{skill}", en[key]!),
        es: esTraining.training.defaultEvidence.replace("{skill}", es[key]!),
      },
    })),
  };
}
