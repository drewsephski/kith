import type { APIRoute } from "astro";
import { markdownResponse } from "../agent-content";
import { alternativeMarkdown } from "../alternatives";
import { GROK_PAGE } from "../grok-alternative";

export const GET: APIRoute = ({ request }) =>
  markdownResponse(alternativeMarkdown(GROK_PAGE), request.method);
