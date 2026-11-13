import { validDateKey } from "./model";
import type { DateKey } from "./model";

export type Screen = "today" | "calendar" | "settings";

export function screenLink(screen: Screen, date?: DateKey): string {
  return "#/" + screen + (date ? "/" + date : "");
}

export function readScreen(hash: string, today: DateKey): { screen: Screen; date: DateKey } {
  const [, page, requested] = hash.replace(/^#/, "").split("/");
  return {
    screen: page === "calendar" || page === "settings" ? page : "today",
    date: requested && validDateKey(requested) && requested <= today ? requested : today,
  };
}
