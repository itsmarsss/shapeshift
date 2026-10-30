import { UNIT_SCALE, type Units } from "../settings/store";

const DIGITS: Record<Units, number> = { m: 3, cm: 2, mm: 1 };

export function formatLength(metres: number, units: Units): string {
    return `${Number((metres * UNIT_SCALE[units]).toFixed(DIGITS[units]))} ${units}`;
}
