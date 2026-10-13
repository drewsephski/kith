import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { markdownResponse } from "../../agent-content";
import { SITE_URL } from "../../site";

export async function getStaticPaths() {
  return (await getCollection("blog")).map((article) => {
    const { title, tldr, comparison, faq, sources, related } = article.data;
    const table = [
      `| ${comparison.columns.join(" | ")} |`,
      `| ${comparison.columns.map(() => "---").join(" | ")} |`,
      ...comparison.rows.map((row) => `| ${[row.topic, ...row.cells].join(" | ")} |`),
    ].join("\n");
    const body = [
      `# ${title}`,
      tldr,
      `## At a glance\n\n${comparison.caption}\n\n${table}`,
      article.body ?? "",
      `## FAQ\n\n${faq.map((item) => `### ${item.question}\n\n${item.answer}`).join("\n\n")}`,
      `## Sources\n\n${sources.map((item) => `- [${item.label}](${item.href})`).join("\n")}`,
      `## Related\n\n${related.map((item) => `- [${item.title}](${new URL(item.href, SITE_URL).href})`).join("\n")}`,
    ].join("\n\n");
    return { params: { slug: article.id }, props: { body } };
  });
}

export const GET: APIRoute = ({ props, request }) =>
  markdownResponse((props as { body: string }).body, request.method);
