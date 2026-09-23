export type { Point } from "./assignmentRules";
export type LocatedAddress = { lat: number; lng: number; address: string; locality?: string; source?: "map" | "current_location"; city: string; state: string; pincode: string; placeId: string };
