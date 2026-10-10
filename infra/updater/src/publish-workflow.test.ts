import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflowText = readFileSync(
  path.resolve(import.meta.dirname, "../../../.github/workflows/publish-server-image.yml"),
  "utf8",
);
interface WorkflowJob {
  if?: string;
  needs?: string | string[];
  "runs-on"?: string;
  concurrency?: { group: string; "cancel-in-progress": boolean };
  steps?: Array<{ name?: string; run?: string }>;
  strategy?: { matrix?: { arch?: string[]; include?: Array<Record<string, string>> } };
}

const workflow = parse(workflowText) as {
  jobs: {
    "tested-source": WorkflowJob;
    validate: WorkflowJob;
    build: WorkflowJob;
    publish: WorkflowJob;
    "promote-edge": WorkflowJob;
  };
};

describe("server image publish workflow", () => {
  it("builds every architecture natively instead of emulating arm64", () => {
    expect(workflowText).not.toContain("setup-qemu-action");
    const build = workflow.jobs.build;
    expect(build["runs-on"]).toContain("matrix.runner");
    expect(build.strategy?.matrix?.arch).toEqual(["amd64", "arm64"]);
    const runners = Object.fromEntries(
      (build.strategy?.matrix?.include ?? [])
        .filter((entry) => entry.arch !== undefined)
        .map((entry) => [entry.arch, entry.runner]),
    );
    expect(runners).toEqual({ amd64: "ubuntu-latest", arm64: "ubuntu-24.04-arm" });
  });

  it("publishes one verified multi-arch manifest per image after both builds", () => {
    const publish = workflow.jobs.publish;
    expect(publish.needs).toEqual(["tested-source", "build"]);
    expect(publish.concurrency).toEqual({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a GitHub Actions expression.
      group: "image-promotion-${{ matrix.name }}",
      "cancel-in-progress": false,
    });
    expect(workflow.jobs.build.needs).toBe("tested-source");
    expect(workflowText).toContain("event=push");
    expect(workflowText).toContain('.conclusion == "success"');
    expect(workflowText).toContain("push-by-digest=true");
    expect(workflowText).toContain("docker buildx imagetools create");
    expect(workflowText).toContain("for want in linux/amd64 linux/arm64");
    expect(workflowText).toContain("actions/attest-build-provenance@");
  });

  it("keeps individual manifest publication independent of edge eligibility", () => {
    const step = workflow.jobs.publish.steps?.find(
      (step) => step.name === "Assemble and verify the multi-arch manifest",
    );
    const f = publicationFixture();
    try {
      const result = f.run(step?.run, {});
      expect(result.status, result.stderr).toBe(0);
      const commands = readFileSync(f.log, "utf8");
      expect(commands).not.toContain(":edge");
      expect(commands).toContain("-t ghcr.io/example/app:sha-fixture");
      expect(commands).toContain("ghcr.io/example/app@sha256:");
    } finally {
      f.close();
    }
  });

  it("decides edge eligibility once for the complete image set inside a shared queue", () => {
    const promotion = workflow.jobs["promote-edge"];
    expect(promotion.needs).toEqual(["tested-source", "publish"]);
    expect(promotion.concurrency).toEqual({
      group: "image-edge-release",
      "cancel-in-progress": false,
    });
    const step = promotion.steps?.find(
      (step) => step.name === "Promote all edge images from one source decision",
    );
    const source = "a".repeat(40);
    for (const head of [source, "b".repeat(40)]) {
      const f = publicationFixture();
      try {
        const result = f.run(step?.run, {
          HEAD_SHA: head,
          SOURCE_SHA: source,
          // Simulate main advancing after the first image tag write.
          ADVANCE_MAIN: "true",
        });
        expect(result.status, result.stderr).toBe(0);
        const commands = readFileSync(f.log, "utf8");
        const writes = commands.split("\n").filter((line) => line.includes("create -t"));
        expect(writes).toHaveLength(head === source ? 3 : 0);
        expect(readFileSync(f.ghLog, "utf8").match(/commits\/main/g)).toHaveLength(1);
        if (head === source) {
          for (const [index, image] of ["app", "updater", "computer"].entries()) {
            expect(writes[index]).toContain(`ghcr.io/example/project/${image}:edge`);
            expect(writes[index]).toContain(`ghcr.io/example/project/${image}@sha256:`);
          }
        }
      } finally {
        f.close();
      }
    }
  });

  it("blocks the entire edge set if the latest CI rerun failed during image publication", () => {
    const step = workflow.jobs["promote-edge"].steps?.find(
      (step) => step.name === "Promote all edge images from one source decision",
    );
    const f = publicationFixture();
    try {
      const result = f.run(step?.run, {
        HEAD_SHA: "a".repeat(40),
        SOURCE_SHA: "a".repeat(40),
        CI_RUNS: JSON.stringify({
          workflow_runs: [
            { status: "completed", conclusion: "failure" },
            { status: "completed", conclusion: "success" },
          ],
        }),
      });
      expect(result.status).not.toBe(0);
      expect(readFileSync(f.log, "utf8")).not.toContain("create -t");
    } finally {
      f.close();
    }
  });

  it("preflights every immutable source before writing any edge tag", () => {
    const step = workflow.jobs["promote-edge"].steps?.find(
      (step) => step.name === "Promote all edge images from one source decision",
    );
    const f = publicationFixture();
    try {
      const result = f.run(step?.run, {
        HEAD_SHA: "a".repeat(40),
        SOURCE_SHA: "a".repeat(40),
        FAIL_SOURCE: "computer",
      });
      expect(result.status).not.toBe(0);
      expect(readFileSync(f.log, "utf8")).not.toContain("create -t");
    } finally {
      f.close();
    }
  });

  it("restores every prior digest after an ambiguous partial promotion and keeps the job failed", () => {
    const step = workflow.jobs["promote-edge"].steps?.find(
      (step) => step.name === "Promote all edge images from one source decision",
    );
    const f = publicationFixture();
    try {
      const result = f.run(step?.run, {
        HEAD_SHA: "a".repeat(40),
        SOURCE_SHA: "a".repeat(40),
        FAIL_PROMOTION: "updater",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Edge recovery completed; promotion remains failed");
      for (const image of ["app", "updater", "computer"]) {
        expect(f.state(image)).toBe(`ghcr.io/example/project/${image}@sha256:${"f".repeat(64)}`);
      }
    } finally {
      f.close();
    }
  });

  it("reports failed recovery without claiming the old release was restored", () => {
    const step = workflow.jobs["promote-edge"].steps?.find(
      (step) => step.name === "Promote all edge images from one source decision",
    );
    const f = publicationFixture();
    try {
      const result = f.run(step?.run, {
        HEAD_SHA: "a".repeat(40),
        SOURCE_SHA: "a".repeat(40),
        FAIL_PROMOTION: "updater",
        FAIL_ROLLBACK: "true",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Edge recovery failed; operator recovery is required");
      expect(result.stderr).not.toContain("Edge recovery completed");
    } finally {
      f.close();
    }
  });

  it("bootstraps only one source and recovers an interrupted first publication", () => {
    const step = workflow.jobs["promote-edge"].steps?.find(
      (step) => step.name === "Promote all edge images from one source decision",
    );
    for (const [missing, partial, failure] of [
      ["all", "", ""],
      ["all", "", "updater"],
      ["computer", "true", ""],
    ] as const) {
      const f = publicationFixture();
      try {
        const result = f.run(step?.run, {
          HEAD_SHA: "a".repeat(40),
          SOURCE_SHA: "a".repeat(40),
          MISSING_PRIOR: missing,
          BOOTSTRAP_PRIOR: partial,
          FAIL_PROMOTION: failure,
        });
        expect(result.status === 0, result.stderr).toBe(failure === "");
        for (const image of ["app", "updater", "computer"]) {
          expect(f.state(image)).toBe(`ghcr.io/example/project/${image}@sha256:${"c".repeat(64)}`);
        }
      } finally {
        f.close();
      }
    }
  });

  it("does not mistake a prior lookup error or mixed bootstrap for missing tags", () => {
    const step = workflow.jobs["promote-edge"].steps?.find(
      (step) => step.name === "Promote all edge images from one source decision",
    );
    const scenarios: Array<Record<string, string>> = [
      { PRIOR_ERROR: "true" },
      { MISSING_PRIOR: "computer" },
    ];
    for (const overrides of scenarios) {
      const f = publicationFixture();
      try {
        const result = f.run(step?.run, {
          HEAD_SHA: "a".repeat(40),
          SOURCE_SHA: "a".repeat(40),
          ...overrides,
        });
        expect(result.status).not.toBe(0);
        const writes = readFileSync(f.log, "utf8")
          .split("\n")
          .filter((line) => line.includes("create -t"));
        expect(writes).toHaveLength(0);
      } finally {
        f.close();
      }
    }
  });

  it("does not borrow an older CI success after the latest main run fails", () => {
    const step = workflow.jobs["tested-source"].steps?.[0];
    for (const conclusion of ["success", "failure"]) {
      const f = publicationFixture();
      try {
        const result = f.run(step?.run, {
          SOURCE_SHA: "a".repeat(40),
          CI_RUNS: JSON.stringify({
            workflow_runs: [
              { status: "completed", conclusion },
              { status: "completed", conclusion: "success" },
            ],
          }),
        });
        expect(result.status === 0, result.stderr).toBe(conclusion === "success");
        expect(readFileSync(f.ghLog, "utf8")).toContain("&branch=main");
      } finally {
        f.close();
      }
    }
  });

  it("keeps pull requests read-only and every action pinned to a commit", () => {
    const validate = workflow.jobs.validate;
    const build = workflow.jobs.build;
    const publish = workflow.jobs.publish;
    expect(validate.if).toBe("github.event_name == 'pull_request'");
    expect(build.if).toBe("github.event_name != 'pull_request'");
    expect(publish.if).toBe("github.event_name != 'pull_request'");
    expect(workflow.jobs["promote-edge"].if).toContain("github.event_name != 'pull_request'");
    expect(workflow.jobs["promote-edge"].if).toContain("github.ref_type != 'tag'");
    expect(workflowText).toContain("push: false");
    for (const match of workflowText.matchAll(/uses:\s+([^\s#]+)/g)) {
      expect(match[1], match[1]).toMatch(/@[0-9a-f]{40}$/);
    }
  });
});

function publicationFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "image-promotion-"));
  const bin = path.join(directory, "bin");
  const digests = path.join(directory, "digests");
  mkdirSync(bin);
  mkdirSync(digests);
  for (const hash of ["c", "d"]) writeFileSync(path.join(digests, hash.repeat(64)), "");
  const log = path.join(directory, "docker.log");
  const ghLog = path.join(directory, "gh.log");
  const scripts = {
    gh: `echo "$*" >> "$GH_LOG"
if [[ "$*" == *workflows/ci.yml/runs* ]]; then printf '%s' "$CI_RUNS" | jq -r "\${@: -1}"
elif [[ -f "$HEAD_FILE" ]]; then cat "$HEAD_FILE"
else echo "$HEAD_SHA"; fi`,
    docker: `echo "$*" >> "$DOCKER_LOG"
if [[ "$*" == *inspect* && "$*" == *Platform.OS* ]]; then printf 'linux/amd64\\nlinux/arm64\\n'
elif [[ "$*" == *inspect* ]]; then
  [[ -n "$FAIL_SOURCE" && "$*" == *"/$FAIL_SOURCE:sha-"* ]] && exit 1
  if [[ "$*" == *:edge* ]]; then
    if [[ "$PRIOR_ERROR" == true ]]; then echo 'ERROR: registry unavailable' >&2; exit 1; fi
    if [[ "$MISSING_PRIOR" == all || ("$MISSING_PRIOR" == computer && "$*" == */computer:edge*) ]]; then
      echo "ERROR: $4: not found" >&2; exit 1
    fi
    if [[ "$BOOTSTRAP_PRIOR" == true ]]; then echo sha256:${"c".repeat(64)}
    else echo sha256:${"f".repeat(64)}; fi
  else echo sha256:${"c".repeat(64)}; fi
elif [[ "$*" == *create* ]]; then
  for name in app updater computer; do
    if [[ "$*" == *"/$name:edge"* ]]; then
      echo "\${@: -1}" > "$STATE_DIR/$name"
      if [[ "$FAIL_PROMOTION" == "$name" && "$*" == *@sha256:${"c".repeat(64)} && ! -f "$STATE_DIR/failed" ]]; then
        touch "$STATE_DIR/failed"; exit 1
      fi
      [[ "$FAIL_ROLLBACK" == true && "$*" == *@sha256:${"f".repeat(64)} ]] && exit 1
    fi
  done
  [[ "$ADVANCE_MAIN" == true ]] && echo ${"b".repeat(40)} > "$HEAD_FILE"
fi
exit 0`,
    timeout: `[[ "$1" == --kill-after=5s ]] || exit 99
case "$2" in 30s|60s) ;; *) exit 99 ;; esac
shift 2
exec "$@"`,
  };
  for (const [name, body] of Object.entries(scripts)) {
    const file = path.join(bin, name);
    writeFileSync(file, `#!/bin/bash\n${body}\n`);
    chmodSync(file, 0o755);
  }
  return {
    log,
    ghLog,
    state: (image: string) => readFileSync(path.join(directory, image), "utf8").trim(),
    run(script: string | undefined, overrides: Record<string, string>) {
      expect(script).toBeDefined();
      return spawnSync("bash", ["-c", script!], {
        cwd: digests,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_REPOSITORY: "example/project",
          GITHUB_OUTPUT: path.join(directory, "outputs"),
          IMAGE: "ghcr.io/example/app",
          TAGS: "ghcr.io/example/app:sha-fixture",
          DOCKER_LOG: log,
          GH_LOG: ghLog,
          HEAD_FILE: path.join(directory, "main-head"),
          STATE_DIR: directory,
          CI_RUNS: JSON.stringify({
            workflow_runs: [{ status: "completed", conclusion: "success" }],
          }),
          ...overrides,
        },
        encoding: "utf8",
        timeout: 10000,
      });
    },
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}
