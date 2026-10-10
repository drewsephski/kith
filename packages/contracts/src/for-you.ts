import { z } from "zod";
import { TaskSourceSchema } from "./task-starters.js";

export const ForYouRecommendationSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(160),
  description: z.string().max(300),
  sources: z.array(TaskSourceSchema).min(1).max(6),
  discoveredAt: z.string(),
  expiresAt: z.string(),
  startsAt: z.string().optional(),
});
export type ForYouRecommendation = z.infer<typeof ForYouRecommendationSchema>;
export const ForYouDiscoverySchema = z.object({
  recommendations: z.array(ForYouRecommendationSchema).max(3),
  unavailable: z.boolean(),
});
export type ForYouDiscovery = z.infer<typeof ForYouDiscoverySchema>;
