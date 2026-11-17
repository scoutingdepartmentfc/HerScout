export const PIPELINE_WORKFLOW = "pipeline.yml";

/** URL of the pipeline runs on GitHub (to follow a download started from /admin). */
export const pipelineRunsUrl = () =>
  `https://github.com/${process.env.GITHUB_REPO || "scoutingdepartmentfc/HerScout"}/actions/workflows/${PIPELINE_WORKFLOW}`;

/** Starts a GitHub Action workflow (defaults to pipeline.yml). Needs a token with "Actions: write".
 *  pipeline.yml inputs: pasos (todo | soccerdonna,opta,fotmob | catalogo...), liga, todas_temporadas, limite... */
export async function dispatchPipeline(
  inputs: Record<string, string> = {},
  workflow = PIPELINE_WORKFLOW
) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured: the download will run on the next scheduled run");
  const repo = process.env.GITHUB_REPO || "scoutingdepartmentfc/HerScout";
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: process.env.GITHUB_REF_NAME || "main", inputs }),
  });
  if (!res.ok) throw new Error(`GitHub refused to start the pipeline (${res.status}): ${(await res.text()).slice(0, 200)}`);
}
