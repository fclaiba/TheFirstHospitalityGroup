// The seven areas (BLUEPRINT 2.1, 14).
import { areaOf } from "./positions";
import type { Area } from "./types";

export { AREAS } from "./types";
export { areaOf };

/** Front-of-house areas: they share the menu and the floor. */
export const FRONT_OF_HOUSE: Area[] = ["floor", "reception", "pass", "bar"];
export const isFrontOfHouse = (a: Area): boolean => FRONT_OF_HOUSE.includes(a);
