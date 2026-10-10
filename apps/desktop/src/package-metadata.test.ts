import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8"),
) as {
  productName?: string;
  build?: {
    productName?: string;
    appId: string;
    artifactName: string;
    linux: { executableName: string; desktop: { entry: { Name: string } } };
    mac: { hardenedRuntime: boolean; notarize: boolean; icon: string };
    win: { verifyUpdateCodeSignature: boolean };
  };
};

describe("desktop package metadata", () => {
  it("preserves upgrade identity while branding artifacts and launchers as Kith", () => {
    expect(packageJson.build?.appId).toBe("dev.rakazo.desktop");
    expect(packageJson.build?.artifactName).toBe(`Kith-\${version}-\${arch}.\${ext}`);
    expect(packageJson.build?.linux.executableName).toBe("rakazo");
    expect(packageJson.build?.linux.desktop.entry.Name).toBe("Kith");
    expect(packageJson.build?.mac.icon).toContain("Rakazo.icon");
    expect(packageJson.build?.mac.hardenedRuntime).toBe(true);
    expect(packageJson.build?.mac.notarize).toBe(true);
    expect(packageJson.build?.win.verifyUpdateCodeSignature).toBe(true);
  });

  it("shares the customer-facing name between Electron and electron-builder", () => {
    expect(packageJson.productName).toBe("Kith");
    expect(packageJson.build?.productName).toBeUndefined();
  });
});
