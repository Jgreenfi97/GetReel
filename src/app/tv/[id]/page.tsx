import type { Metadata } from "next";

import { titleMetadata, TitleRoute } from "@/components/TitlePage";

type Props = PageProps<"/tv/[id]">;

export function generateMetadata({ params }: Props): Promise<Metadata> {
  return titleMetadata("tv", params);
}

/** /tv/[id]: a TV series' detail page (TMDB series id). */
export default function TvPage({ params }: Props) {
  return <TitleRoute kind="tv" params={params} />;
}
