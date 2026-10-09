import type { ConfigContext, ExpoConfig } from "expo/config";
import { hostedServiceOrigin } from "./lib/service-url.cjs";

export default ({ config }: ConfigContext): ExpoConfig => {
  const serviceUrl = process.env.RAKAZO_SERVICE_URL;
  const apiUrl = serviceUrl ?? process.env.EXPO_PUBLIC_API_URL;
  let hostedOrigin: string | undefined;
  if (serviceUrl) hostedOrigin = hostedServiceOrigin(serviceUrl);
  if (process.env.EAS_BUILD_PROFILE === "production") {
    if (!apiUrl) {
      throw new Error(
        "RAKAZO_SERVICE_URL must be set in the EAS production environment before building for the App Store (EXPO_PUBLIC_API_URL is also supported).",
      );
    }
    hostedOrigin = hostedServiceOrigin(apiUrl);
  }

  return {
    ...config,
    extra: {
      ...config.extra,
      ...(hostedOrigin ? { rakazoServiceUrl: hostedOrigin } : {}),
    },
  } as ExpoConfig;
};
