/** 播放页数据源与 FLIP 起点矩形（BlueGiantPage / AlbumNowPlaying 共用） */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 播放页的数据来源：专辑库 / 登录用户的网易云歌单（显式判别，不靠 ncmId 猜） */
export type PlayerSource =
  | { kind: "album"; albumId: string }
  | {
      kind: "playlist";
      playlistId: number;
      name: string;
      cover?: string;
      trackCount?: number;
      /** 从歌单卡点进来时，直接播这一首 */
      startId?: number;
    };
