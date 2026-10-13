// UI copy (ADR 0004), one JSON file per namespace and language with identical keys (tests/copy.test.ts).
// Add a namespace: create messages/en/<ns>.json and messages/es/<ns>.json, then list it in both maps below.
import enCommon from "./en/common.json";
import esCommon from "./es/common.json";
import enAuth from "./en/auth.json";
import esAuth from "./es/auth.json";

type Dict = { [k: string]: string | Dict };

export const en: Dict = { ...enCommon, ...enAuth };
export const es: Dict = { ...esCommon, ...esAuth };
