import type { Metadata } from "next";

import { titleMetadata, TitleRoute } from "@/components/TitlePage";

type Props = PageProps<"/movie/[id]">;

export function generateMetadata({ params }: Props): Promise<Metadata> {
  return titleMetadata("movie", params);
}

/** /movie/[id]: a film's detail page (TMDB film id). */
export default function MoviePage({ params }: Props) {
  return <TitleRoute kind="movie" params={params} />;
}
