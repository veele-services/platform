import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function verifyProductionPromotion(env, fetcher = fetch) {
  const sha = env.RELEASE_SHA;
  if (env.GITHUB_REPOSITORY !== "veele-services/platform" || env.GITHUB_REF !== "refs/heads/production" || !/^[0-9a-f]{40}$/.test(sha ?? "") || env.ACCEPTED_RELEASE_SHA !== sha || !env.GH_TOKEN) throw new Error("Productiepromotie mist de expliciete acceptatie voor deze SHA of branch.");
  for (const [workflow, branch] of [["ci.yml", "main"], ["deploy-staging.yml", "staging"]]) {
    const target = new URL(`https://api.github.com/repos/veele-services/platform/actions/workflows/${workflow}/runs`);
    target.search = new URLSearchParams({ head_sha: sha, branch, event: "push", status: "success", per_page: "100" }).toString();
    let body;
    try {
      const response = await fetcher(target, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { accept: "application/vnd.github+json", authorization: `Bearer ${env.GH_TOKEN}`, "X-GitHub-Api-Version": "2022-11-28" } });
      if (!response.ok) throw new Error();
      body = await response.json();
    } catch { throw new Error("Promotiebewijs kon niet veilig bij GitHub worden gecontroleerd."); }
    if (!Array.isArray(body.workflow_runs) || !body.workflow_runs.some(run => run.head_sha === sha && run.head_branch === branch && run.event === "push" && run.status === "completed" && run.conclusion === "success" && run.path === `.github/workflows/${workflow}` && run.repository?.full_name === "veele-services/platform")) throw new Error("Deze SHA mist geslaagde main-CI of volledige stagingacceptatie.");
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    await verifyProductionPromotion(process.env);
    console.log("Exacte productie-SHA heeft expliciete acceptatie, groene main-CI en geslaagde stagingdeploy.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
