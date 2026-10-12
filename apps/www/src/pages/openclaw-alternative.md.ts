import type { APIRoute } from "astro";
import { markdownResponse } from "../agent-content";
import { alternativeMarkdown } from "../alternatives";
import { OPENCLAW_PAGE } from "../guide";

export const GET: APIRoute = ({ request }) =>
  markdownResponse(alternativeMarkdown(OPENCLAW_PAGE), request.method);
