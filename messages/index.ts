// UI copy (ADR 0004), one JSON file per namespace and language with identical keys (tests/copy.test.ts).
// Add a namespace: create messages/en/<ns>.json and messages/es/<ns>.json, then list it in both maps below.
import enCommon from "./en/common.json";
import esCommon from "./es/common.json";
import enAuth from "./en/auth.json";
import esAuth from "./es/auth.json";
import enToday from "./en/today.json";
import esToday from "./es/today.json";
import enTasks from "./en/tasks.json";
import esTasks from "./es/tasks.json";
import enRules from "./en/rules.json";
import esRules from "./es/rules.json";
import enMenu from "./en/menu.json";
import esMenu from "./es/menu.json";
import enSchedule from "./en/schedule.json";
import esSchedule from "./es/schedule.json";
import enGuide from "./en/guide.json";
import esGuide from "./es/guide.json";
import enInventory from "./en/inventory.json";
import esInventory from "./es/inventory.json";
import enFloor from "./en/floor.json";
import esFloor from "./es/floor.json";
import enManage from "./en/manage.json";
import esManage from "./es/manage.json";
import enOwner from "./en/owner.json";
import esOwner from "./es/owner.json";
import enPeople from "./en/people.json";
import esPeople from "./es/people.json";

type Dict = { [k: string]: string | Dict };

export const en: Dict = { ...enCommon, ...enAuth, ...enToday, ...enTasks, ...enRules, ...enMenu, ...enSchedule, ...enGuide, ...enInventory, ...enFloor, ...enManage, ...enOwner, ...enPeople };
export const es: Dict = { ...esCommon, ...esAuth, ...esToday, ...esTasks, ...esRules, ...esMenu, ...esSchedule, ...esGuide, ...esInventory, ...esFloor, ...esManage, ...esOwner, ...esPeople };
