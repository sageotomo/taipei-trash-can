// 缺垃圾桶指數頁的六個故事：每個預設指標背後的生活情境。
// 市民版只看得到這些故事與開關，看不到公式與權重；政府版在指標卡片上也會顯示故事標題。
// key 是 lib/indicators.ts 裡 DEFAULT_INDICATORS 的 id。

export interface Story {
  no: number;        // 故事編號（顯示用）
  title: string;     // 一句話情境
  detail: string;    // 為什麼這會影響缺不缺桶
}

export const STORIES: Record<string, Story> = {
  drinks: {
    no: 1,
    title: "逛街吃完東西，找不到垃圾桶",
    detail: "飲料店越密集，越像商圈，手上拿著空杯的人越多。",
  },
  youbike: {
    no: 2,
    title: "YouBike 菜籃裡塞滿垃圾",
    detail: "找不到垃圾桶的人，常順手把垃圾丟進腳踏車菜籃。",
  },
  residential: {
    no: 3,
    title: "住宅區有人把家裡垃圾丟進路邊桶",
    detail: "這是市府撤掉垃圾桶的主要原因，所以住宅區會降低優先順序。",
  },
  bus: {
    no: 4,
    title: "等公車時，手上的垃圾沒地方丟",
    detail: "公車站是行人停留、聚集的地方。",
  },
  reports: {
    no: 5,
    title: "市民已經通報過這裡很髒",
    detail: "通報越多，代表這裡真的需要處理。",
  },
  bins: {
    no: 6,
    title: "這裡已經有垃圾桶了",
    detail: "格子裡的垃圾桶越多，就越不缺。",
  },
};

export function storyOf(indicatorId: string): Story | undefined {
  return STORIES[indicatorId];
}
