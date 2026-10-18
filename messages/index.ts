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
import enFloor from "./en/floor.json";
import esFloor from "./es/floor.json";
import enManage from "./en/manage.json";
import esManage from "./es/manage.json";
import enOwner from "./en/owner.json";
import esOwner from "./es/owner.json";
import enPeople from "./en/people.json";
import esPeople from "./es/people.json";
import enMine from "./en/me.json";
import esMine from "./es/me.json";
import enBar from "./en/bar.json";
import esBar from "./es/bar.json";
import enNotify from "./en/notify.json";
import esNotify from "./es/notify.json";

import enScreenGuide from "./en/screenGuide.json";
import esScreenGuide from "./es/screenGuide.json";

import enTraining from "./en/training.json";
import esTraining from "./es/training.json";

type Dict = { [k: string]: string | Dict };
import enActions from "./en/actions.json";
import esActions from "./es/actions.json";
import enTour from "./en/tour.json";
import esTour from "./es/tour.json";

export const en: Dict = { ...enCommon, ...enAuth, ...enToday, ...enTasks, ...enRules, ...enMenu, ...enSchedule, ...enGuide, ...enFloor, ...enManage, ...enOwner, ...enPeople, ...enMine, ...enBar, ...enNotify, ...enScreenGuide, ...enTraining, ...enActions, ...enTour };
export const es: Dict = { ...esCommon, ...esAuth, ...esToday, ...esTasks, ...esRules, ...esMenu, ...esSchedule, ...esGuide, ...esFloor, ...esManage, ...esOwner, ...esPeople, ...esMine, ...esBar, ...esNotify, ...esScreenGuide, ...esTraining, ...esActions, ...esTour };
