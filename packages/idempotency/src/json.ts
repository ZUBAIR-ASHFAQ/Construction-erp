export type ReplayJsonPrimitive = string | number | boolean | null;
export type ReplayJsonValue = ReplayJsonPrimitive | ReplayJsonObject | ReplayJsonValue[];
export type ReplayJsonObject = { [key: string]: ReplayJsonValue };
