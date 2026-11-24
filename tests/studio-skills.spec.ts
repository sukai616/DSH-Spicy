import { expect, test } from "vitest";
import { bundledSkill } from "../src/skill.js";

test("image skills remain registered after the video module is removed", () => {
  for (const name of ["qwen-image", "studio-creation", "studio-model-setup"])
    expect(bundledSkill(name)).toMatchObject({
      name,
      invocation: { modelInvocable: true, userInvocable: true },
    });
});
