export type ComposerPeriod = 'BAROQUE' | 'CLASSICAL' | 'ROMANTIC' | 'MODERN' | 'VIETNAM';

/** Nhạc sĩ (mục 5.4), BE: ComposerResponse. */
export interface Composer {
  id: string;
  name: string;
  slug: string;
  aliases?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  country?: string | null;
  period?: ComposerPeriod | null;
  bio?: string | null;
  imageUrl?: string | null;
  imageSource?: string | null;
  imageLicense?: string | null;
  /** Số bản công khai (trang công khai) hoặc tổng số bản đang gắn (trang admin). */
  scoreCount: number;
  topTitles?: string[] | null;
}

export interface ComposerPayload {
  name: string;
  aliases?: string;
  birthYear?: number | null;
  deathYear?: number | null;
  country?: string;
  period?: ComposerPeriod | null;
  bio?: string;
  imageUrl?: string;
  imageSource?: string;
  imageLicense?: string;
}

export interface ExploreFacets {
  keys: string[];
}
