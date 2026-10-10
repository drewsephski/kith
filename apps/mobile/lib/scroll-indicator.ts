export function scrollIndicatorGeometry({
  viewport,
  content,
  offset,
  inverted = false,
}: {
  viewport: number;
  content: number;
  offset: number;
  inverted?: boolean;
}) {
  const track = Math.max(0, viewport - 16);
  const scrollable = Math.max(0, content - viewport);
  if (!Number.isFinite(content + viewport + offset) || !track || !scrollable) return null;
  const thumb = Math.min(track, Math.max(24, (viewport / content) * track));
  const progress = Math.min(1, Math.max(0, offset / scrollable));
  return { thumb, position: (inverted ? 1 - progress : progress) * (track - thumb) };
}
