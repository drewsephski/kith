import * as z from "zod";

export const IntegrationProviderIdSchema = z.enum(["composio", "pipedream"]);
export const ComposioAuthConfigsSchema = z
  .record(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), z.string().regex(/^ac_[a-zA-Z0-9_-]{1,200}$/))
  .refine((value) => Object.keys(value).length <= 20, "Use at most 20 OAuth configurations");
export const IntegrationProviderConfigSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("composio"),
    apiKey: z.string().trim().min(1).max(16384),
    authConfigs: ComposioAuthConfigsSchema.optional(),
  }),
  z.object({
    provider: z.literal("pipedream"),
    clientId: z.string().trim().min(1).max(512),
    clientSecret: z.string().trim().min(1).max(16384),
    projectId: z.string().trim().min(1).max(512),
    environment: z.enum(["production", "development"]).default("production"),
  }),
]);
export type IntegrationProviderConfig = z.infer<typeof IntegrationProviderConfigSchema>;
export type IntegrationProviderId = z.infer<typeof IntegrationProviderIdSchema>;
export const IntegrationSetupStateSchema = z.object({
  canConfigure: z.boolean(),
  needsSetup: z.boolean(),
  webUrl: z.string().url(),
  providers: z.array(z.object({ id: IntegrationProviderIdSchema, configured: z.boolean() })),
});
export type IntegrationSetupState = z.infer<typeof IntegrationSetupStateSchema>;
